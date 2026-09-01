import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { FilesService, LibraryService } from '~/files';
import { UsageService } from '~/modules/usage';
import { ProvenanceService } from '~/provenance';
import { CanvasService } from './canvas.service';
import {
  estimateMediaCost,
  getMediaModel,
  isMediaModelPriceConfigured,
  MEDIA_MODEL_REGISTRY,
} from './media-model.registry';
import { BytePlusMediaProvider } from './providers/byteplus-media.provider';
import { GoogleMediaProvider } from './providers/google-media.provider';
import { KlingMediaProvider } from './providers/kling-media.provider';
import type {
  CreateMediaGenerationInput,
  MediaPrincipal,
  MediaProviderAdapter,
} from './media.types';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly db: DatabaseService,
    private readonly files: FilesService,
    private readonly library: LibraryService,
    private readonly usage: UsageService,
    private readonly provenance: ProvenanceService,
    private readonly canvas: CanvasService,
    private readonly google: GoogleMediaProvider,
    private readonly kling: KlingMediaProvider,
    private readonly byteplus: BytePlusMediaProvider,
  ) {}

  catalog() {
    const googleConfigured = Boolean(
      process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY,
    );
    const klingConfigured = Boolean(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY);
    const byteplusConfigured = Boolean(process.env.BYTEPLUS_ARK_API_KEY ?? process.env.ARK_API_KEY);
    const configured: Record<string, boolean> = {
      google: googleConfigured,
      kling: klingConfigured,
      byteplus: byteplusConfigured,
    };
    return {
      models: MEDIA_MODEL_REGISTRY.map((model) => ({
        ...model,
        available: Boolean(configured[model.provider]) && isMediaModelPriceConfigured(model),
        unavailableReason: !configured[model.provider]
          ? 'provider_not_configured'
          : !isMediaModelPriceConfigured(model)
            ? 'price_not_configured'
            : undefined,
      })),
      providers: [
        {
          id: 'google',
          displayName: 'Google',
          configured: googleConfigured,
          capabilities: ['image', 'video', 'audio', 'music'],
        },
        {
          id: 'kling',
          displayName: 'Kling AI',
          configured: klingConfigured,
          capabilities: ['image', 'video'],
        },
        {
          id: 'byteplus',
          displayName: 'BytePlus ModelArk',
          configured: byteplusConfigured,
          capabilities: ['image', 'video'],
        },
      ],
      billing: {
        estimate: 'Credit authorization is shown before generation.',
        settlement: 'Successful jobs settle once from catalog or provider-reported usage; failed jobs release the authorization.',
      },
    };
  }

  async quote(input: CreateMediaGenerationInput, principal: MediaPrincipal) {
    const provider = resolveProvider(input);
    const selector = input.modelKey ?? input.modelId;
    if (!selector) throw new BadRequestException('A media model is required.');
    const model = getMediaModel(provider, selector);
    const settings = normalizeSettings(model.settings, input.settings ?? {});
    const inputKinds = await this.resolveInputKinds(input.inputItemIds ?? [], principal, model);
    const estimatedCostUsd = estimateMediaCost(model, input.prompt?.trim() ?? '', settings, inputKinds);
    const quote = this.usage.quoteCapability(`${model.kind}_generation`, estimatedCostUsd);
    return {
      ...quote,
      modelKey: model.modelKey,
      provider: model.provider,
      modelId: model.modelId,
      pricing: model.pricing,
      settlement: model.pricing.settlement,
    };
  }

  async createGeneration(
    input: CreateMediaGenerationInput,
    principal: MediaPrincipal,
    options: { start?: boolean } = { start: true },
  ) {
    const provider = resolveProvider(input);
    const selector = input.modelKey ?? input.modelId;
    if (!selector) throw new BadRequestException('A media model is required.');
    const model = getMediaModel(provider, selector);
    const prompt = input.prompt?.trim();
    if (!prompt) throw new BadRequestException('A generation prompt is required.');
    if (prompt.length > 40_000) throw new BadRequestException('Prompt is too long.');
    const operation = input.operation ?? (input.inputItemIds?.length ? 'transform' : 'generate');
    if (!model.operations.includes(operation)) {
      throw new BadRequestException(`${model.displayName} does not support ${operation}.`);
    }
    const settings = normalizeSettings(model.settings, input.settings ?? {});
    let inputItemIds = [...new Set((input.inputItemIds ?? []).filter(Boolean))];
    let project: typeof schema.canvasProject.$inferSelect | undefined;
    if (input.projectId) {
      project = await this.canvas.requireProject(input.projectId, principal, 'edit');
      if (operation === 'transform' && !inputItemIds.length) {
        inputItemIds = [project.activeItemId];
      }
    }
    if (inputItemIds.length > model.maxInputs) {
      throw new BadRequestException(
        `${model.displayName} accepts at most ${model.maxInputs} input artifact(s).`,
      );
    }
    const inputKinds = await this.resolveInputKinds(inputItemIds, principal, model);
    const traceId = randomUUID();
    const estimatedCostUsd = estimateMediaCost(model, prompt, settings, inputKinds);
    const quote = this.usage.quoteCapability(`${model.kind}_generation`, estimatedCostUsd);
    const [job] = await this.db
      .insert(schema.mediaGenerationJob)
      .values({
        projectId: project?.projectId,
        ownerUserId: principal.principalId,
        workspaceId: principal.workspaceId ?? null,
        agentId: input.agentId,
        sessionId: input.sessionId,
        traceId,
        provider,
        modelId: model.modelId,
        mediaKind: model.kind,
        operation,
        prompt,
        inputItemIds,
        request: { settings, toolCallId: input.toolCallId, modelKey: model.modelKey, inputKinds, quote },
        estimatedCostUsd,
        billing: { quote, pricing: model.pricing, status: 'authorized_pending' },
      })
      .returning();
    if (options.start !== false) this.kick(job.jobId);
    return this.publicJob(job);
  }

  private async resolveInputKinds(
    itemIds: string[],
    principal: MediaPrincipal,
    model: ReturnType<typeof getMediaModel>,
  ) {
    const kinds: string[] = [];
    for (const itemId of itemIds) {
      const item = await this.library.get(itemId, {
        principalId: principal.principalId,
        principalType: principal.principalType,
        workspaceId: principal.workspaceId,
      });
      if (!model.inputKinds.includes(item.kind as any)) {
        throw new BadRequestException(`${model.displayName} cannot use ${item.kind} input ${item.name}.`);
      }
      kinds.push(item.kind);
    }
    return kinds;
  }

  async getGeneration(jobId: string, principal: MediaPrincipal) {
    const job = await this.requireJob(jobId, principal);
    if (job.status === 'queued') this.kick(job.jobId);
    return this.publicJob(job);
  }

  async generateAndWait(
    input: CreateMediaGenerationInput,
    principal: MediaPrincipal,
  ) {
    const job = await this.createGeneration(input, principal, { start: false });
    await this.run(job.jobId);
    const completed = await this.requireJob(job.jobId, principal);
    if (completed.status !== 'completed' || !completed.outputItemId) {
      throw new BadRequestException(
        completed.errorMessage || 'Media generation did not complete.',
      );
    }
    const preview = await this.library.preview(completed.outputItemId, {
      principalId: principal.principalId,
      principalType: principal.principalType,
      workspaceId: principal.workspaceId,
    });
    return {
      job: this.publicJob(completed),
      artifact: {
        itemId: preview.itemId,
        name: preview.name,
        kind: preview.kind,
        mimeType: preview.mimeType,
        url: preview.inline?.url ?? preview.download?.url,
      },
    };
  }

  private kick(jobId: string) {
    queueMicrotask(() => {
      void this.run(jobId).catch((error) =>
        this.logger.error(
          `Media job ${jobId} crashed: ${error instanceof Error ? error.stack : String(error)}`,
        ),
      );
    });
  }

  private run(jobId: string) {
    const existing = this.running.get(jobId);
    if (existing) return existing;
    const promise = this.execute(jobId).finally(() => this.running.delete(jobId));
    this.running.set(jobId, promise);
    return promise;
  }

  private async execute(jobId: string) {
    const [job] = await this.db
      .update(schema.mediaGenerationJob)
      .set({ status: 'running', progress: 2, startedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.mediaGenerationJob.jobId, jobId),
          eq(schema.mediaGenerationJob.status, 'queued'),
        ),
      )
      .returning();
    if (!job) return;
    const request = (job.request ?? {}) as Record<string, any>;
    const settings = (request.settings ?? {}) as Record<string, unknown>;
    const inputKinds = Array.isArray(request.inputKinds) ? request.inputKinds.map(String) : [];
    const model = getMediaModel(job.provider, String(request.modelKey ?? job.modelId), job.mediaKind);
    const provider = this.provider(job.provider, job.modelId);
    const traceStarted = this.provenance.startRun({
      traceId: job.traceId!,
      sessionId: job.sessionId ?? undefined,
      agentId: job.agentId ?? undefined,
      scopeType: 'canvas_project',
      scopeId: job.projectId ?? job.jobId,
      initiator: job.ownerUserId,
      workspaceId: job.workspaceId ?? undefined,
      provider: job.provider,
      modelId: job.modelId,
      input: {
        prompt: job.prompt,
        inputItemIds: job.inputItemIds,
        settings,
      },
      metadata: {
        schema: 'https://provenancekit.com/context/v2',
        mediaKind: job.mediaKind,
        operation: job.operation,
        projectId: job.projectId,
        inputItemIds: job.inputItemIds,
      },
    });
    let reservation: { reservationId?: string } | null = null;
    let costCaptured = false;
    let settledCostUsd = 0;
    const startedAt = Date.now();
    try {
      reservation = await this.usage.authorizeCapability({
        principalId: job.ownerUserId,
        capability: `${job.mediaKind}_generation`,
        estimatedCostUsd: job.estimatedCostUsd ?? estimateMediaCost(model, job.prompt, settings, inputKinds),
        idempotencyKey: `capability:media:${job.jobId}`,
        agentId: job.agentId ?? undefined,
        sessionId: job.sessionId ?? undefined,
        metadata: { provider: job.provider, modelId: job.modelId, projectId: job.projectId },
      });
      const assets = await Promise.all(
        (job.inputItemIds ?? []).map((fileId) =>
          this.files.loadOriginalForProcessing({
            fileId,
            ownerId: job.ownerUserId,
            workspaceId: job.workspaceId,
            agentId: job.agentId ?? undefined,
            sessionId: job.sessionId ?? undefined,
          }),
        ),
      );
      this.provenance.recordEvent(job.traceId!, {
        category: 'model',
        eventType: 'media.generate',
        name: model.displayName,
        phase: 'generation',
        status: 'running',
        summary: `${job.operation} ${job.mediaKind} with ${model.displayName}`,
        payload: { inputItemIds: job.inputItemIds, settings },
        performedBy: {
          type: job.agentId ? 'agent' : 'human',
          id: job.agentId ?? job.ownerUserId,
        },
      });
      const output = await provider.generate({
        model,
        prompt: job.prompt,
        operation: job.operation as any,
        inputs: assets,
        settings,
        onProgress: async (progress, providerOperationId) => {
          await this.db
            .update(schema.mediaGenerationJob)
            .set({ progress, providerOperationId, updatedAt: new Date() })
            .where(eq(schema.mediaGenerationJob.jobId, job.jobId));
        },
      });
      const actualCostUsd = output.billing?.actualCostUsd ?? job.estimatedCostUsd
        ?? estimateMediaCost(model, job.prompt, settings, inputKinds);
      settledCostUsd = actualCostUsd;
      await this.usage.settleCapability({
        reservationId: reservation?.reservationId,
        capability: `${job.mediaKind}_generation`,
        actualCostUsd,
        idempotencyKey: `capability:media:${job.jobId}:capture`,
        agentId: job.agentId ?? undefined,
        sessionId: job.sessionId ?? undefined,
        metadata: {
          provider: job.provider,
          modelId: job.modelId,
          modelKey: model.modelKey,
          providerOperationId: output.providerOperationId,
          billing: output.billing,
        },
      });
      costCaptured = true;
      const created = await this.files.createGeneratedFile({
        buffer: output.buffer,
        fileName: `${slug(model.displayName)}-${Date.now()}.${output.extension}`,
        mimeType: output.mimeType,
        agentId: job.agentId ?? undefined,
        sessionId: job.sessionId ?? undefined,
        traceId: job.traceId ?? undefined,
        ownerId: job.ownerUserId,
        workspaceId: job.workspaceId,
        metadata: {
          provider: job.provider,
          model: job.modelId,
          canvasProjectId: job.projectId,
          sourceFileId: job.inputItemIds?.[0],
          inputFileIds: job.inputItemIds,
          operation: job.operation,
          generationSettings: settings,
          promptHash: sha256(job.prompt),
          providerOutput: output.metadata,
          billing: output.billing,
        },
      });
      if (job.projectId) {
        const project = await this.db.query.canvasProject.findFirst({
          where: (table) => eq(table.projectId, job.projectId!),
        });
        await this.canvas.addRevision({
          projectId: job.projectId,
          itemId: created.fileId,
          parentItemId: project?.activeItemId,
          operation: job.operation,
          provider: job.provider,
          modelId: job.modelId,
          prompt: job.prompt,
          inputItemIds: job.inputItemIds ?? [],
          settings,
          traceId: job.traceId ?? undefined,
          createdByType: job.agentId ? 'agent' : 'human',
          createdById: job.agentId ?? job.ownerUserId,
        });
      }
      await this.db
        .update(schema.mediaGenerationJob)
        .set({
          status: 'completed',
          progress: 100,
          outputItemId: created.fileId,
          providerOperationId: output.providerOperationId,
          actualCostUsd,
          billing: {
            quote: request.quote,
            pricing: model.pricing,
            settlement: output.billing ?? {
              actualCostUsd,
              quantity: 1,
              unit: model.pricing.unit,
              unitPriceUsd: actualCostUsd,
              source: 'catalog',
            },
            status: 'settled',
          },
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.mediaGenerationJob.jobId, job.jobId));
      this.provenance.recordEvent(job.traceId!, {
        category: 'output',
        eventType: 'artifact.revision.created',
        name: created.name,
        phase: 'persistence',
        status: 'completed',
        summary: `Created ${job.mediaKind} artifact revision`,
        result: { itemId: created.fileId, mimeType: output.mimeType },
        durationMs: Date.now() - startedAt,
      });
      this.provenance.finishRun(job.traceId!, {
        status: 'completed',
        output: { itemId: created.fileId, projectId: job.projectId },
        durationMs: Date.now() - startedAt,
        costUsd: actualCostUsd,
      });
    } catch (error) {
      if (!costCaptured) await this.usage.releaseCapability(reservation?.reservationId);
      const message = safeError(error);
      await this.db
        .update(schema.mediaGenerationJob)
        .set({
          status: 'failed',
          errorCode: providerErrorCode(error),
          errorMessage: message,
          actualCostUsd: costCaptured ? settledCostUsd : null,
          billing: {
            ...((job.billing ?? {}) as Record<string, unknown>),
            status: costCaptured ? 'settled_provider_succeeded_artifact_failed' : 'released',
            ...(costCaptured ? { actualCostUsd: settledCostUsd } : {}),
          },
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.mediaGenerationJob.jobId, job.jobId));
      if (traceStarted) {
        this.provenance.finishRun(job.traceId!, {
          status: 'failed',
          error: message,
          output: { error: message },
          durationMs: Date.now() - startedAt,
          costUsd: costCaptured ? settledCostUsd : 0,
        });
      }
      this.logger.warn(`Media job ${job.jobId} failed: ${message}`);
    }
  }

  private provider(providerId: string, modelId: string): MediaProviderAdapter {
    const providers: MediaProviderAdapter[] = [this.google, this.kling, this.byteplus];
    const provider = providers.find(
      (entry) => entry.id === providerId && entry.supports(modelId),
    );
    if (!provider) throw new BadRequestException(`Provider ${providerId} is unavailable.`);
    return provider;
  }

  private async requireJob(jobId: string, principal: MediaPrincipal) {
    const job = await this.db.query.mediaGenerationJob.findFirst({
      where: (table) => eq(table.jobId, jobId),
    });
    if (!job) throw new NotFoundException('Media generation not found.');
    if (same(job.ownerUserId, principal.principalId)) return job;
    if (job.projectId) {
      await this.canvas.requireProject(job.projectId, principal, 'read');
      return job;
    }
    throw new NotFoundException('Media generation not found.');
  }

  private publicJob(job: typeof schema.mediaGenerationJob.$inferSelect) {
    const { prompt: _prompt, request: _request, ...safe } = job;
    return safe;
  }
}

function normalizeSettings(
  fields: Array<{ key: string; default?: string | number | boolean; options?: Array<{ value: string }> }>,
  provided: Record<string, unknown>,
) {
  const allowed = new Set(fields.map((field) => field.key));
  const unknown = Object.keys(provided).filter((key) => !allowed.has(key));
  if (unknown.length) throw new BadRequestException(`Unsupported setting(s): ${unknown.join(', ')}`);
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const value = provided[field.key] ?? field.default;
    if (value === undefined) continue;
    if (field.options?.length && !field.options.some((option) => option.value === String(value))) {
      throw new BadRequestException(`Invalid ${field.key} setting.`);
    }
    output[field.key] = value;
  }
  return output;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(api[-_ ]?key|authorization|token)\s*[:=]\s*\S+/gi, '$1=[redacted]').slice(0, 2_000);
}

function providerErrorCode(error: unknown) {
  const status = Number((error as any)?.status ?? (error as any)?.statusCode);
  return Number.isFinite(status) ? `provider_${status}` : 'generation_failed';
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sha256(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function same(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function resolveProvider(input: CreateMediaGenerationInput) {
  if (input.provider) return input.provider;
  const prefixed = input.modelKey?.split(':')[0];
  return prefixed || 'google';
}
