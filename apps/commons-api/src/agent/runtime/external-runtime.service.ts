import { BadRequestException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database';
import { SessionService } from '~/session/session.service';
import { ComputerService, type CommonOsRuntimeEvent } from '~/computer';
import { MemoryService } from '~/memory/memory.service';
import { SkillService } from '~/skill/skill.service';
import { FilesService } from '~/files';
import { LogService } from '~/log/log.service';
import { UsageService } from '~/modules/usage/usage.service';
import { calculateCost } from '~/modules/model-provider/model-registry';
import { RuntimeManagementService } from './runtime-management.service';
import { normalizeRuntimeType } from './runtime.types';

export type RuntimeRunInput = {
  agentId: string;
  messages?: Array<{ role: string; content: unknown }>;
  sessionId?: string;
  initiator: string;
  parentSessionId?: string;
  stream?: boolean;
  attachments?: Array<{ fileId: string }>;
};

@Injectable()
export class ExternalRuntimeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sessions: SessionService,
    private readonly computers: ComputerService,
    private readonly runtimes: RuntimeManagementService,
    private readonly memories: MemoryService,
    private readonly skills: SkillService,
    private readonly files: FilesService,
    private readonly logs: LogService,
    private readonly usage: UsageService,
  ) {}

  runAgent(props: RuntimeRunInput): Observable<any> {
    return new Observable((subscriber) => {
      const keepalive = setInterval(
        () => subscriber.next({ type: 'keepalive' }),
        15_000,
      );
      let cancelled = false;

      const emit = (event: Record<string, any>) => {
        if (!cancelled && !subscriber.closed) subscriber.next(event);
      };
      const emitStatus = (
        stage: string,
        status: 'running' | 'completed' | 'failed',
        message: string,
        detail?: string,
        payload?: Record<string, any>,
      ) => {
        if (!props.stream) return;
        emit({
          type: 'status',
          phase: 'commentary',
          stage,
          status,
          message,
          detail,
          payload,
          sessionId: props.sessionId,
          timestamp: new Date().toISOString(),
        });
      };

      void (async () => {
        const startedAt = performance.now();
        const traceId = uuidv4();
        let sessionId = props.sessionId;
        try {
          emitStatus('request', 'running', 'Starting agent run');
          const agent = await this.db.query.agent.findFirst({
            where: (table) => eq(table.agentId, props.agentId),
          });
          if (!agent) throw new BadRequestException('Agent not found');
          const runtimeType = normalizeRuntimeType(agent.runtimeType);
          if (runtimeType === 'native') {
            throw new BadRequestException(
              'Native agents must use the native runtime adapter',
            );
          }
          emitStatus(
            'agent',
            'completed',
            `Loaded ${agent.name}`,
            runtimeType,
            {
              runtimeType,
            },
          );

          let isNewSession = false;
          if (!sessionId) {
            emitStatus('session', 'running', 'Opening a new conversation');
            const created = await this.sessions.createSession({
              value: {
                sessionId: uuidv4(),
                agentId: props.agentId,
                initiator: props.initiator,
                initiatorType: 'web',
                runtimeType,
                model: {
                  name: agent.modelId ?? 'default',
                  provider: agent.modelProvider ?? 'openai',
                  modelId: agent.modelId ?? 'default',
                  temperature: agent.temperature ?? 0.7,
                  maxTokens: agent.maxTokens ?? 4096,
                  topP: agent.topP ?? 1,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              parentSessionId: props.parentSessionId,
            });
            sessionId = created.sessionId;
            isNewSession = true;
          } else {
            const existing = await this.sessions.getSession({ id: sessionId });
            if (!existing || existing.agentId !== props.agentId) {
              throw new BadRequestException(
                'Session does not belong to this agent',
              );
            }
          }
          emitStatus('session', 'completed', 'Conversation ready', undefined, {
            sessionId,
            isNewSession,
            runtimeType,
          });

          let runtimeStatusShown = false;
          let runtimeStatusTimer: ReturnType<typeof setTimeout> | undefined;
          const runtimeReady = this.runtimes
            .ensureReady(props.agentId, sessionId)
            .finally(() => {
              if (runtimeStatusTimer) clearTimeout(runtimeStatusTimer);
            });
          runtimeStatusTimer = setTimeout(() => {
            runtimeStatusShown = true;
            emitStatus(
              'runtime',
              'running',
              `Starting ${this.runtimeLabel(runtimeType)}`,
            );
          }, 1_000);

          const userText = this.latestUserText(props.messages);
          if (!userText)
            throw new BadRequestException('A user message is required');
          const memoryMode = String(
            (agent.runtimeConfig as Record<string, unknown> | null)
              ?.memoryMode ?? 'hybrid',
          );
          const includePlatformMemory = memoryMode !== 'native';
          const [
            computer,
            memoryBlock,
            sharedMemoryBlock,
            skillsBlock,
            attachments,
          ] = await Promise.all([
            runtimeReady,
            includePlatformMemory
              ? this.memories
                  .buildMemoryBlock(props.agentId, userText)
                  .catch(() => '')
              : Promise.resolve(''),
            includePlatformMemory
              ? this.memories
                  .buildSharedMemoryBlock(props.agentId, userText)
                  .catch(() => '')
              : Promise.resolve(''),
            this.buildSkillsBlock(props.agentId).catch(() => ''),
            props.attachments?.length
              ? this.files.getAttachmentSummaries(props.attachments, {
                  agentId: props.agentId,
                  sessionId,
                  ownerId: props.initiator,
                  includeImageParts: false,
                })
              : Promise.resolve({
                  text: '',
                  imageParts: [],
                  attachments: [],
                }),
          ]);
          if (runtimeStatusShown) {
            emitStatus(
              'runtime',
              'completed',
              `${this.runtimeLabel(runtimeType)} ready`,
              undefined,
              {
                runtimeType,
                computerId: computer.computerId,
              },
            );
          }
          const instruction = [
            userText,
            memoryBlock,
            sharedMemoryBlock,
            skillsBlock,
            attachments.text,
          ]
            .filter(Boolean)
            .join('\n\n');

          let streamedText = '';
          const activeTools = new Set<string>();
          emitStatus(
            'runtime_turn',
            'running',
            `${this.runtimeLabel(runtimeType)} is working`,
          );
          const result = await this.computers.sendInstruction({
            agentId: props.agentId,
            computerId: computer.computerId,
            sessionId,
            instruction,
            eventType: 'runtime.turn',
            summary: `${runtimeType} session turn`,
            waitMs: 10 * 60_000,
            actorId: props.initiator,
            actorType: 'user',
            onRuntimeEvent: async (event) => {
              this.forwardRuntimeEvent(
                event,
                emit,
                activeTools,
                (delta) => {
                  streamedText += delta;
                },
                sessionId!,
              );
            },
          });
          if (result.status === 'failed' || result.status === 'timeout') {
            throw new Error(
              result.error ||
                `${runtimeType} runtime did not complete the turn`,
            );
          }
          const responseText = String(
            result.response ?? streamedText ?? '',
          ).trim();
          if (!responseText)
            throw new Error(`${runtimeType} runtime returned no response`);
          if (!streamedText && props.stream) {
            emit({
              type: 'token',
              phase: 'final_answer',
              role: 'assistant',
              content: responseText,
              sessionId,
            });
          }
          const runtimeUsage = this.normalizeUsage((result as any).usage);
          if (runtimeUsage) {
            const provider =
              runtimeUsage.provider || agent.modelProvider || runtimeType;
            // OpenResponses gateways identify the runtime endpoint itself
            // (for example `openclaw/<runtime-id>`), not the upstream model
            // that incurred the tokens. Price and expose usage against the
            // configured agent model unless the runtime reports a real model.
            const reportedModel = runtimeUsage.model;
            const modelId =
              reportedModel && !reportedModel.startsWith(`${runtimeType}/`)
                ? reportedModel
                : agent.modelId || 'unknown';
            runtimeUsage.model = modelId;
            runtimeUsage.costUsd = calculateCost(
              provider as Parameters<typeof calculateCost>[0],
              modelId,
              Math.max(0, runtimeUsage.inputTokens - runtimeUsage.cachedTokens),
              runtimeUsage.outputTokens,
            );
            await this.usage.record({
              agentId: props.agentId,
              sessionId,
              provider,
              modelId,
              inputTokens: runtimeUsage.inputTokens,
              outputTokens: runtimeUsage.outputTokens,
              cachedTokens: runtimeUsage.cachedTokens,
              totalTokens: runtimeUsage.totalTokens,
              costUsd: runtimeUsage.costUsd,
              isByok: Boolean(agent.modelApiKey),
              durationMs: Math.round(performance.now() - startedAt),
              traceId,
              runtimeType,
              usageSource: `common_os_${runtimeType}`,
            });
          }
          for (const tool of activeTools) {
            emit({
              type: 'toolEnd',
              phase: 'commentary',
              toolName: tool,
              output: null,
              sessionId,
            });
          }

          const current = await this.sessions.getSession({ id: sessionId });
          if (!current) throw new BadRequestException('Session not found');
          const history = [...((current.history as any[]) ?? [])];
          const now = new Date().toISOString();
          history.push({
            role: 'human',
            content: userText,
            timestamp: now,
            metadata: attachments.attachments.length
              ? { attachments: attachments.attachments }
              : {},
          });
          history.push({
            role: 'ai',
            content: responseText,
            timestamp: new Date().toISOString(),
            metadata: {
              runtimeType,
              computerId: computer.computerId,
              durationMs: Math.round(performance.now() - startedAt),
            },
          });
          const title = current.title || this.fallbackTitle(userText);
          await this.sessions.updateSession({
            id: sessionId,
            delta: {
              title,
              history,
              runtimeType,
              endedAt: new Date(),
              updatedAt: new Date(),
            },
          });
          await this.logs.createLogEntry({
            agentId: props.agentId,
            sessionId,
            action: 'run',
            message: responseText.slice(0, 512),
            status: 'success',
            responseTime: performance.now() - startedAt,
            tools: [...activeTools].map((name) => ({
              name,
              status: 'success',
            })),
          });
          emitStatus('session', 'completed', 'Conversation saved', undefined, {
            sessionId,
          });
          emit({
            type: 'final',
            phase: 'final_answer',
            payload: {
              type: 'ai',
              content: responseText,
              sessionId,
              title,
              traceId,
              durationMs: Math.round(performance.now() - startedAt),
              usage: runtimeUsage ?? {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                costUsd: 0,
              },
              metadata: {
                runtimeType,
                computerId: computer.computerId,
                commonOsMessageId: result.commonOsMessageId,
                toolCalls: [...activeTools].map((name) => ({ name })),
              },
            },
          });
          this.memories
            .consolidateSession(props.agentId, sessionId!, [
              { role: 'user', content: userText },
              { role: 'assistant', content: responseText },
            ])
            .catch(() => undefined);
          clearInterval(keepalive);
          subscriber.complete();
        } catch (error) {
          clearInterval(keepalive);
          const message =
            error instanceof Error ? error.message : String(error);
          emitStatus('runtime', 'failed', 'Agent runtime failed', message);
          emit({
            type: 'error',
            phase: 'final_answer',
            message,
            sessionId,
            timestamp: new Date().toISOString(),
          });
          subscriber.complete();
        }
      })();

      return () => {
        cancelled = true;
        clearInterval(keepalive);
      };
    });
  }

  private normalizeUsage(value: any): {
    provider?: string;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    costUsd: number;
  } | null {
    if (!value || typeof value !== 'object') return null;
    const inputTokens = Math.max(0, Number(value.inputTokens ?? 0) || 0);
    const outputTokens = Math.max(0, Number(value.outputTokens ?? 0) || 0);
    const cachedTokens = Math.min(
      inputTokens,
      Math.max(
        0,
        Number(value.cachedInputTokens ?? value.cachedTokens ?? 0) || 0,
      ),
    );
    if (inputTokens + outputTokens === 0) return null;
    return {
      provider: typeof value.provider === 'string' ? value.provider : undefined,
      model: typeof value.model === 'string' ? value.model : undefined,
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: 0,
    };
  }

  private forwardRuntimeEvent(
    event: CommonOsRuntimeEvent,
    emit: (event: Record<string, any>) => void,
    activeTools: Set<string>,
    onDelta: (delta: string) => void,
    sessionId: string,
  ) {
    if (event.type === 'runtime.message_delta' && event.payload.delta) {
      onDelta(event.payload.delta);
      emit({
        type: 'token',
        phase: 'final_answer',
        role: 'assistant',
        content: event.payload.delta,
        sessionId,
        timestamp: event.createdAt,
      });
      return;
    }
    if (event.type === 'runtime.tool_call' && event.payload.tool) {
      activeTools.add(event.payload.tool);
      emit({
        type: 'toolStart',
        phase: 'commentary',
        toolName: event.payload.tool,
        input: '',
        sessionId,
        timestamp: event.createdAt,
      });
      return;
    }
    if (event.type === 'runtime.tool_result' && event.payload.tool) {
      activeTools.delete(event.payload.tool);
      emit({
        type: 'toolEnd',
        phase: 'commentary',
        toolName: event.payload.tool,
        output: event.payload.label,
        sessionId,
        timestamp: event.createdAt,
      });
      return;
    }
    if (event.type === 'runtime.message_status') {
      emit({
        type: 'status',
        phase: 'commentary',
        stage: 'runtime_turn',
        status: 'running',
        message: this.statusLabel(event.payload.status),
        sessionId,
        timestamp: event.createdAt,
      });
    }
  }

  /**
   * Agent Commons skills reach managed runtimes (OpenClaw, Hermes) as an
   * instruction-context index: the runtime sees which skills exist and pulls
   * full instructions on demand through the pod tool bridge
   * (agent_commons_call_tool → invoke_skill). Native runs get the same
   * skills through the platform tool loader instead.
   */
  private async buildSkillsBlock(agentId: string) {
    const index = await this.skills.getIndex(agentId);
    if (!index.length) return '';
    const lines = index
      .slice(0, 25)
      .map(
        (skill) =>
          `- ${skill.name} (slug: ${skill.slug})${skill.description ? ` — ${skill.description}` : ''}`,
      );
    return [
      '## Agent skills',
      'Reusable instructions configured for this agent. When a request matches a skill, fetch its full instructions with the agent_commons_call_tool pod tool: call invoke_skill with { "skillSlug": "<slug>" } and follow them.',
      ...lines,
    ].join('\n');
  }

  private latestUserText(messages?: Array<{ role: string; content: unknown }>) {
    const message = [...(messages ?? [])]
      .reverse()
      .find((item) => item.role === 'user');
    if (!message) return '';
    if (typeof message.content === 'string') return message.content.trim();
    if (Array.isArray(message.content)) {
      return message.content
        .map((part: any) =>
          typeof part === 'string' ? part : (part?.text ?? ''),
        )
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    return String(message.content ?? '').trim();
  }

  private fallbackTitle(value: string) {
    return (
      value
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 7)
        .join(' ')
        .slice(0, 80) || 'New Session'
    );
  }

  private runtimeLabel(runtime: string) {
    return runtime === 'openclaw'
      ? 'OpenClaw'
      : runtime === 'hermes'
        ? 'Hermes'
        : 'agent runtime';
  }

  private statusLabel(status?: string) {
    if (status === 'waiting_for_runtime') return 'Waiting for agent runtime';
    if (status === 'waiting_for_openclaw') return 'Starting OpenClaw';
    if (status === 'waiting_for_hermes') return 'Starting Hermes';
    if (status === 'runtime_recovering')
      return 'Agent runtime is restarting — hang tight';
    if (status?.startsWith('waiting_for_'))
      return `Waiting for ${status.slice(12).replace(/_/g, ' ')}`;
    return status ? status.replace(/_/g, ' ') : 'Agent runtime is working';
  }
}
