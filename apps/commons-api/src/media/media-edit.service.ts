import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type OpenAI from 'openai';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { UsageService } from '~/modules/usage';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { FilesService } from '~/files';
import { CanvasService } from './canvas.service';
import {
  MAX_SOURCE_BYTES,
  addAudioArgs,
  concatArgs,
  normalizeArgs,
  parseScenes,
  parseSilences,
  probeMedia,
  sampleTimes,
  singlePassArgs,
  validateOperations,
  type EncodeTarget,
  type MediaEditOperation,
  type MediaProbe,
} from './media-edit';

const execFileAsync = promisify(execFile);
const STEP_TIMEOUT_MS = 10 * 60 * 1000;
const ANALYSIS_VERSION = 1;
const FONT_CANDIDATES = [
  '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf',
  '/usr/share/fonts/TTF/LiberationSans-Bold.ttf',
  '/usr/share/fonts/opensans/OpenSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];

type Owner = { principalId: string; workspaceId?: string | null };

/** Runs edit lists with ffmpeg and saves the result as a new Library file. */
@Injectable()
export class MediaEditService {
  private readonly logger = new Logger(MediaEditService.name);
  private running = 0;
  private readonly ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

  constructor(
    private readonly files: FilesService,
    private readonly canvas: CanvasService,
    private readonly db: DatabaseService,
    private readonly usage: UsageService,
    @Inject(OpenAIService) private readonly openai: OpenAI,
  ) {}

  /**
   * Timestamped understanding of a clip, for editing decisions: transcript
   * segments (and words on request), silences, scene changes and short
   * descriptions of sampled frames. Cached on the Library item.
   */
  async analyze(
    input: {
      fileId?: string;
      projectId?: string;
      words?: boolean;
      refresh?: boolean;
      agentId?: string;
      sessionId?: string;
      toolCallId?: string;
    },
    owner: Owner,
  ) {
    const principal = {
      principalId: owner.principalId,
      principalType: 'user' as const,
      workspaceId: owner.workspaceId ?? null,
      actorId: input.agentId,
    };
    const project = input.projectId
      ? await this.canvas.requireProject(input.projectId, principal, 'read')
      : null;
    const sourceId = input.fileId ?? project?.activeItemId;
    if (!sourceId) throw new BadRequestException('Pass the fileId of the clip, or the canvas projectId.');
    const item = await this.db.query.libraryItem.findFirst({
      where: (table) => eq(table.itemId, sourceId),
      columns: { itemId: true, metadata: true },
    });
    const cached = (item?.metadata as Record<string, any> | null)?.mediaAnalysis;
    if (cached?.version === ANALYSIS_VERSION && !input.refresh && (!input.words || cached.transcript?.words)) {
      // Access is still checked before returning cached analysis.
      await this.files.getFileMetadata(sourceId, {
        ownerId: owner.principalId,
        workspaceId: owner.workspaceId ?? undefined,
        agentId: input.agentId,
        sessionId: input.sessionId,
      });
      return { fileId: sourceId, cached: true, ...cached };
    }

    const directory = await mkdtemp(path.join(tmpdir(), 'commons-analyze-'));
    try {
      const source = await this.load(sourceId, owner, input, directory, 'source');
      const probe = await probeMedia(source.path, this.ffmpeg);
      if (!probe.hasVideo && !probe.hasAudio) {
        throw new BadRequestException('Only video and audio files can be analysed this way.');
      }
      const minutes = Math.max(1, probe.durationMs / 60_000);
      const billingKey = `capability:media-analysis:${input.toolCallId ?? `${sourceId}:${Date.now()}`}`;
      const reservation = await this.usage
        .authorizeCapability({
          principalId: owner.principalId,
          capability: 'media_analysis',
          estimatedCostUsd: minutes * 0.006 + (probe.hasVideo ? 0.02 : 0),
          idempotencyKey: billingKey,
          agentId: input.agentId,
          sessionId: input.sessionId,
          metadata: { fileId: sourceId },
        })
        .catch((error) => {
          throw new BadRequestException(error instanceof Error ? error.message : 'Credits are needed for media analysis.');
        });

      const silences = probe.hasAudio
        ? parseSilences(await this.stderr(['-hide_banner', '-nostats', '-i', source.path, '-af', 'silencedetect=noise=-35dB:d=0.6', '-f', 'null', '-']), probe.durationMs)
        : [];
      const scenes = probe.hasVideo
        ? parseScenes(await this.stderr(['-hide_banner', '-nostats', '-i', source.path, '-filter:v', "select='gt(scene,0.3)',showinfo", '-an', '-f', 'null', '-']))
        : [];
      const transcript = probe.hasAudio ? await this.transcribe(source.path, directory, input.words === true) : null;
      const frames = probe.hasVideo ? await this.describeFrames(source.path, directory, probe.durationMs, scenes) : [];

      await this.usage
        .settleCapability({
          reservationId: reservation?.reservationId,
          capability: 'media_analysis',
          actualCostUsd: (transcript ? minutes * 0.006 : 0) + (frames.length ? 0.02 : 0),
          idempotencyKey: `${billingKey}:capture`,
          agentId: input.agentId,
          sessionId: input.sessionId,
          metadata: { fileId: sourceId },
        })
        .catch(() => undefined);

      const analysis = {
        version: ANALYSIS_VERSION,
        durationMs: probe.durationMs,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        hasAudio: probe.hasAudio,
        hasVideo: probe.hasVideo,
        transcript,
        silences,
        scenes,
        frames,
        analyzedAt: new Date().toISOString(),
      };
      if (item) {
        await this.db
          .update(schema.libraryItem)
          .set({ metadata: { ...((item.metadata as Record<string, unknown>) ?? {}), mediaAnalysis: analysis } })
          .where(eq(schema.libraryItem.itemId, sourceId))
          .catch(() => undefined);
      }
      return { fileId: sourceId, cached: false, ...analysis };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async transcribe(source: string, directory: string, words: boolean) {
    if (!process.env.OPENAI_API_KEY) return null;
    const audio = path.join(directory, 'speech.mp3');
    await this.run(['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]);
    const bytes = await readFile(audio);
    if (bytes.length > 25 * 1024 * 1024) {
      return { segments: [], note: 'The recording is too long to transcribe in one pass (over about 70 minutes).' };
    }
    try {
      const result: any = await this.openai.audio.transcriptions.create({
        file: new File([new Uint8Array(bytes)], 'speech.mp3', { type: 'audio/mpeg' }),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: words ? ['segment', 'word'] : ['segment'],
      } as any);
      return {
        language: result.language,
        segments: (result.segments ?? []).slice(0, 2000).map((segment: any) => ({
          startMs: Math.round(segment.start * 1000),
          endMs: Math.round(segment.end * 1000),
          text: String(segment.text ?? '').trim(),
        })),
        ...(words
          ? {
              words: (result.words ?? []).slice(0, 20_000).map((word: any) => ({
                startMs: Math.round(word.start * 1000),
                endMs: Math.round(word.end * 1000),
                word: word.word,
              })),
            }
          : {}),
      };
    } catch (error) {
      this.logger.warn(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
      return { segments: [], note: 'The speech could not be transcribed.' };
    }
  }

  private async describeFrames(source: string, directory: string, durationMs: number, scenes: number[]) {
    if (!process.env.OPENAI_API_KEY || process.env.AGENT_FILE_VIDEO_UNDERSTANDING_ENABLED === 'false') return [];
    const times = sampleTimes(durationMs, scenes, 12);
    const images: Array<{ atMs: number; data: string }> = [];
    for (const [index, atMs] of times.entries()) {
      const file = path.join(directory, `frame-${index}.jpg`);
      try {
        await this.run(['-hide_banner', '-loglevel', 'error', '-y', '-ss', (atMs / 1000).toFixed(3), '-i', source, '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", '-q:v', '4', file]);
        images.push({ atMs, data: (await readFile(file)).toString('base64') });
      } catch {
        // A frame that fails to decode is skipped.
      }
    }
    if (!images.length) return [];
    try {
      const completion = await this.openai.chat.completions.create({
        model: process.env.AGENT_FILE_VIDEO_UNDERSTANDING_MODEL || 'gpt-5.4-mini',
        messages: [
          {
            role: 'system',
            content:
              'You describe video frames for an editor. For each frame, give one plain sentence on what is visible (people, slides, screen content, text). Reply as JSON: {"frames":[{"atMs":number,"description":string}]}. Do not guess beyond what is visible.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Frames at: ${images.map((image) => `${image.atMs}ms`).join(', ')}` },
              ...images.map((image) => ({
                type: 'image_url' as const,
                image_url: { url: `data:image/jpeg;base64,${image.data}`, detail: 'low' as const },
              })),
            ],
          },
        ],
        response_format: { type: 'json_object' },
      } as any);
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      return (Array.isArray(parsed.frames) ? parsed.frames : [])
        .filter((frame: any) => typeof frame?.atMs === 'number' && typeof frame?.description === 'string')
        .slice(0, 12)
        .map((frame: any) => ({ atMs: Math.round(frame.atMs), description: frame.description.slice(0, 400) }));
    } catch (error) {
      this.logger.warn(`Frame description failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /** Run an analysis pass and return ffmpeg's log output. */
  private async stderr(args: string[]) {
    try {
      const { stderr } = await execFileAsync(this.ffmpeg, args, { timeout: STEP_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
      return String(stderr);
    } catch (error) {
      return String((error as { stderr?: string }).stderr ?? '');
    }
  }

  async edit(
    input: {
      fileId?: string;
      projectId?: string;
      operations: unknown;
      outputName?: string;
      summary?: string;
      agentId?: string;
      sessionId?: string;
    },
    owner: Owner,
  ) {
    const principal = {
      principalId: owner.principalId,
      principalType: 'user' as const,
      workspaceId: owner.workspaceId ?? null,
      actorId: input.agentId,
    };
    const project = input.projectId
      ? await this.canvas.requireProject(input.projectId, principal, 'edit')
      : null;
    const sourceId = input.fileId ?? project?.activeItemId;
    if (!sourceId) {
      throw new BadRequestException('Pass the fileId of the clip to edit, or the canvas projectId.');
    }
    if (this.running >= Number(process.env.MEDIA_EDIT_CONCURRENCY ?? 2)) {
      throw new BadRequestException('Another edit is running. Try again in a moment.');
    }
    this.running += 1;
    const directory = await mkdtemp(path.join(tmpdir(), 'commons-edit-'));
    try {
      const source = await this.load(sourceId, owner, input, directory, 'source');
      const probe = await probeMedia(source.path, this.ffmpeg);
      if (!probe.hasVideo && !probe.hasAudio) {
        throw new BadRequestException('Only video and audio files can be edited this way.');
      }
      let operations: MediaEditOperation[];
      try {
        operations = validateOperations(input.operations, probe);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      let target: EncodeTarget = {
        video: probe.hasVideo,
        width: even(probe.width ?? 1280),
        height: even(probe.height ?? 720),
        fps: Math.max(1, Math.min(60, Math.round(probe.fps ?? 30))),
      };
      let step = 0;
      const next = () => path.join(directory, `step-${++step}.${target.video ? 'mp4' : 'm4a'}`);

      // Step 0: a clean, uniform copy so every later operation can rely on it.
      let current = next();
      await this.run(normalizeArgs({ path: source.path, probe, target, output: current }));
      let currentProbe = await probeMedia(current, this.ffmpeg);
      const inputIds = new Set<string>([sourceId]);

      for (const operation of operations) {
        let output: string;
        if (operation.op === 'append' || operation.op === 'insert') {
          const clip = await this.load(operation.fileId, owner, input, directory, `clip-${step}`);
          inputIds.add(operation.fileId);
          const clipProbe = await probeMedia(clip.path, this.ffmpeg);
          const normalized = path.join(directory, `clip-${step}-n.${target.video ? 'mp4' : 'm4a'}`);
          await this.run(
            normalizeArgs({
              path: clip.path,
              probe: clipProbe,
              target,
              startMs: operation.startMs,
              endMs: operation.endMs,
              output: normalized,
            }),
          );
          let parts: string[];
          if (operation.op === 'append' || operation.atMs >= currentProbe.durationMs) {
            parts = [current, normalized];
          } else if (operation.atMs <= 0) {
            parts = [normalized, current];
          } else {
            const before = path.join(directory, `split-${step}-a.${target.video ? 'mp4' : 'm4a'}`);
            const after = path.join(directory, `split-${step}-b.${target.video ? 'mp4' : 'm4a'}`);
            const uniform = { ...currentProbe, hasAudio: true };
            await this.run(normalizeArgs({ path: current, probe: uniform, target, endMs: operation.atMs, output: before }));
            await this.run(normalizeArgs({ path: current, probe: uniform, target, startMs: operation.atMs, output: after }));
            parts = [before, normalized, after];
          }
          output = next();
          await this.run(concatArgs(parts, target, output));
        } else if (operation.op === 'addAudio') {
          const audio = await this.load(operation.fileId, owner, input, directory, `audio-${step}`);
          inputIds.add(operation.fileId);
          const audioProbe = await probeMedia(audio.path, this.ffmpeg);
          if (!audioProbe.hasAudio) throw new BadRequestException(`${audio.name} has no sound to add.`);
          output = next();
          await this.run(
            addAudioArgs({
              op: operation,
              path: current,
              audioPath: audio.path,
              target,
              durationMs: currentProbe.durationMs,
              output,
            }),
          );
        } else {
          if (operation.op === 'extractAudio') target = { ...target, video: false };
          output = next();
          let textFile: string | undefined;
          if (operation.op === 'text') {
            textFile = path.join(directory, `text-${step}.txt`);
            await writeFile(textFile, operation.text, 'utf8');
          }
          await this.run(
            singlePassArgs({
              op: operation,
              path: current,
              probe: currentProbe,
              target,
              output,
              textFile,
              fontFile: FONT_CANDIDATES.find((candidate) => existsSync(candidate)),
            }),
          );
        }
        current = output;
        currentProbe = await probeMedia(current, this.ffmpeg);
      }

      const buffer = await readFile(current);
      const mimeType = target.video ? 'video/mp4' : 'audio/mp4';
      const created = await this.files.createGeneratedFile({
        buffer,
        fileName: outputName(input.outputName ?? source.name, target.video ? 'mp4' : 'm4a'),
        mimeType,
        agentId: input.agentId,
        sessionId: input.sessionId,
        ownerId: owner.principalId,
        workspaceId: owner.workspaceId ?? null,
        metadata: {
          operation: 'edit',
          sourceFileId: sourceId,
          inputFileIds: [...inputIds],
          editOperations: operations,
          canvasProjectId: project?.projectId,
          durationMs: currentProbe.durationMs,
          width: target.video ? currentProbe.width : undefined,
          height: target.video ? currentProbe.height : undefined,
        },
      });
      const revision = project
        ? await this.canvas.addRevision({
            projectId: project.projectId,
            itemId: created.fileId,
            parentItemId: sourceId,
            operation: 'edit',
            inputItemIds: [...inputIds],
            settings: {
              operations,
              ...(input.summary ? { summary: input.summary.trim().slice(0, 500) } : {}),
            },
            createdByType: input.agentId ? 'agent' : 'human',
            createdById: input.agentId ?? owner.principalId,
          })
        : null;
      return {
        fileId: created.fileId,
        name: created.name,
        mimeType,
        durationMs: currentProbe.durationMs,
        width: target.video ? currentProbe.width : undefined,
        height: target.video ? currentProbe.height : undefined,
        hasAudio: currentProbe.hasAudio,
        revisionId: revision?.revisionId,
        projectId: project?.projectId,
      };
    } finally {
      this.running -= 1;
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** A single frame as PNG, for showing agents exactly what a note marks. */
  async frame(input: { buffer: Buffer; mimeType: string; atMs: number }) {
    const directory = await mkdtemp(path.join(tmpdir(), 'commons-frame-'));
    try {
      const source = path.join(directory, `source${extensionFor(input.mimeType)}`);
      const output = path.join(directory, 'frame.png');
      await writeFile(source, input.buffer);
      await this.run([
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        (Math.max(0, input.atMs) / 1000).toFixed(3),
        '-i',
        source,
        '-frames:v',
        '1',
        output,
      ]);
      return await readFile(output);
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async load(
    fileId: string,
    owner: Owner,
    input: { agentId?: string; sessionId?: string },
    directory: string,
    label: string,
  ) {
    const original = await this.files.loadOriginalForProcessing({
      fileId,
      ownerId: owner.principalId,
      workspaceId: owner.workspaceId,
      agentId: input.agentId,
      sessionId: input.sessionId,
    });
    if (original.buffer.length > MAX_SOURCE_BYTES) {
      throw new BadRequestException(`${original.name} is larger than 512 MB.`);
    }
    const file = path.join(directory, `${label}${extensionFor(original.mimeType, original.name)}`);
    await writeFile(file, original.buffer);
    return { path: file, name: original.name, mimeType: original.mimeType };
  }

  private async run(args: string[]) {
    try {
      await execFileAsync(this.ffmpeg, args, {
        timeout: STEP_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (error) {
      const stderr = String((error as { stderr?: string }).stderr ?? '').trim();
      this.logger.warn(`ffmpeg failed: ${stderr.slice(0, 2000)}`);
      throw new BadRequestException(
        `The edit could not be rendered${stderr ? `: ${stderr.split('\n').pop()?.slice(0, 300)}` : '.'}`,
      );
    }
  }
}

function even(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded - (rounded % 2);
}

function extensionFor(mimeType: string, name = '') {
  const fromName = name.match(/\.[a-z0-9]{2,5}$/i)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('quicktime')) return '.mov';
  if (mimeType.startsWith('audio/mpeg')) return '.mp3';
  if (mimeType.startsWith('audio/wav') || mimeType.includes('wave')) return '.wav';
  if (mimeType.startsWith('audio/')) return '.m4a';
  return '.mp4';
}

function outputName(name: string, extension: string) {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\w .-]+/g, '').trim().slice(0, 80) || 'clip';
  return `${base} edit.${extension}`;
}

export type { MediaProbe };
