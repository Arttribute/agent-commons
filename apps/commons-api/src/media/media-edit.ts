/**
 * Deterministic video and audio editing with ffmpeg.
 *
 * An edit is an ordered list of operations applied to one source clip. Each
 * operation reads the current clip and writes the next one, so the list reads
 * like an editor's history: trim, insert a clip, lay music under it, fade out.
 * Clips that are joined are first normalized to the source's frame size,
 * frame rate and audio format so they concatenate cleanly.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type MediaEditOperation =
  | { op: 'trim'; startMs: number; endMs: number }
  | { op: 'cut'; startMs: number; endMs: number }
  | { op: 'append'; fileId: string; startMs?: number; endMs?: number }
  | { op: 'insert'; fileId: string; atMs: number; startMs?: number; endMs?: number }
  | {
      op: 'addAudio';
      fileId: string;
      atMs?: number;
      startMs?: number;
      endMs?: number;
      volume?: number;
      mode?: 'mix' | 'replace';
      fadeInMs?: number;
      fadeOutMs?: number;
    }
  | { op: 'volume'; level: number; startMs?: number; endMs?: number }
  | { op: 'speed'; factor: number }
  | { op: 'crop'; x: number; y: number; width: number; height: number }
  | { op: 'resize'; width: number }
  | { op: 'fade'; inMs?: number; outMs?: number }
  | {
      op: 'text';
      text: string;
      startMs?: number;
      endMs?: number;
      position?: 'top' | 'center' | 'bottom';
      size?: 'small' | 'medium' | 'large';
    }
  | {
      op: 'blur';
      x: number;
      y: number;
      width: number;
      height: number;
      startMs?: number;
      endMs?: number;
    }
  | { op: 'extractAudio' };

export type MediaProbe = {
  durationMs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  fps?: number;
};

export const MAX_OPERATIONS = 16;
export const MAX_SOURCE_BYTES = 512 * 1024 * 1024;

/** Validate untrusted operations from an agent and return them cleaned. */
export function validateOperations(
  value: unknown,
  probe?: MediaProbe,
): MediaEditOperation[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error('Provide at least one edit operation.');
  }
  if (value.length > MAX_OPERATIONS) {
    throw new Error(`Use at most ${MAX_OPERATIONS} operations per edit.`);
  }
  const ms = (input: unknown, name: string, optional = false) => {
    if (input === undefined && optional) return undefined;
    if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
      throw new Error(`${name} must be a positive number of milliseconds.`);
    }
    return Math.round(input);
  };
  const unit = (input: unknown, name: string) => {
    if (typeof input !== 'number' || input < 0 || input > 1) {
      throw new Error(`${name} must be between 0 and 1 (a fraction of the frame).`);
    }
    return input;
  };
  const range = (start: number | undefined, end: number | undefined, label: string) => {
    if (start !== undefined && end !== undefined && end <= start) {
      throw new Error(`${label}: endMs must be after startMs.`);
    }
  };
  const fileId = (input: unknown) => {
    if (typeof input !== 'string' || !/^[0-9a-f-]{36}$/i.test(input)) {
      throw new Error('fileId must be a Library file id.');
    }
    return input;
  };
  let extracted = false;
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Operation ${index + 1} is not an object.`);
    const input = raw as Record<string, any>;
    const label = `Operation ${index + 1} (${input.op})`;
    if (extracted) throw new Error('extractAudio must be the last operation.');
    switch (input.op) {
      case 'trim':
      case 'cut': {
        const startMs = ms(input.startMs, `${label} startMs`)!;
        const endMs = ms(input.endMs, `${label} endMs`)!;
        range(startMs, endMs, label);
        return { op: input.op, startMs, endMs };
      }
      case 'append':
      case 'insert': {
        const startMs = ms(input.startMs, `${label} startMs`, true);
        const endMs = ms(input.endMs, `${label} endMs`, true);
        range(startMs, endMs, label);
        const base = { fileId: fileId(input.fileId), startMs, endMs };
        return input.op === 'append'
          ? { op: 'append', ...base }
          : { op: 'insert', ...base, atMs: ms(input.atMs, `${label} atMs`)! };
      }
      case 'addAudio': {
        const startMs = ms(input.startMs, `${label} startMs`, true);
        const endMs = ms(input.endMs, `${label} endMs`, true);
        range(startMs, endMs, label);
        const volume = input.volume === undefined ? 1 : Number(input.volume);
        if (!(volume >= 0 && volume <= 4)) throw new Error(`${label}: volume must be between 0 and 4.`);
        return {
          op: 'addAudio',
          fileId: fileId(input.fileId),
          atMs: ms(input.atMs ?? 0, `${label} atMs`)!,
          startMs,
          endMs,
          volume,
          mode: input.mode === 'replace' ? 'replace' : 'mix',
          fadeInMs: ms(input.fadeInMs, `${label} fadeInMs`, true),
          fadeOutMs: ms(input.fadeOutMs, `${label} fadeOutMs`, true),
        };
      }
      case 'volume': {
        const level = Number(input.level);
        if (!(level >= 0 && level <= 4)) throw new Error(`${label}: level must be between 0 and 4.`);
        const startMs = ms(input.startMs, `${label} startMs`, true);
        const endMs = ms(input.endMs, `${label} endMs`, true);
        range(startMs, endMs, label);
        return { op: 'volume', level, startMs, endMs };
      }
      case 'speed': {
        const factor = Number(input.factor);
        if (!(factor >= 0.25 && factor <= 4)) throw new Error(`${label}: factor must be between 0.25 and 4.`);
        return { op: 'speed', factor };
      }
      case 'crop':
      case 'blur': {
        const box = {
          x: unit(input.x, `${label} x`),
          y: unit(input.y, `${label} y`),
          width: unit(input.width, `${label} width`),
          height: unit(input.height, `${label} height`),
        };
        if (box.width <= 0 || box.height <= 0 || box.x + box.width > 1.0001 || box.y + box.height > 1.0001) {
          throw new Error(`${label}: the box must sit inside the frame.`);
        }
        if (input.op === 'crop') return { op: 'crop', ...box };
        const startMs = ms(input.startMs, `${label} startMs`, true);
        const endMs = ms(input.endMs, `${label} endMs`, true);
        range(startMs, endMs, label);
        return { op: 'blur', ...box, startMs, endMs };
      }
      case 'resize': {
        const width = Math.round(Number(input.width));
        if (!(width >= 64 && width <= 3840)) throw new Error(`${label}: width must be between 64 and 3840 pixels.`);
        return { op: 'resize', width: width - (width % 2) };
      }
      case 'fade': {
        const inMs = ms(input.inMs, `${label} inMs`, true);
        const outMs = ms(input.outMs, `${label} outMs`, true);
        if (!inMs && !outMs) throw new Error(`${label}: set inMs, outMs, or both.`);
        return { op: 'fade', inMs, outMs };
      }
      case 'text': {
        const text = typeof input.text === 'string' ? input.text.trim() : '';
        if (!text || text.length > 300) throw new Error(`${label}: text must be 1 to 300 characters.`);
        const startMs = ms(input.startMs, `${label} startMs`, true);
        const endMs = ms(input.endMs, `${label} endMs`, true);
        range(startMs, endMs, label);
        return {
          op: 'text',
          text,
          startMs,
          endMs,
          position: ['top', 'center', 'bottom'].includes(input.position) ? input.position : 'bottom',
          size: ['small', 'medium', 'large'].includes(input.size) ? input.size : 'medium',
        };
      }
      case 'extractAudio':
        extracted = true;
        if (probe && !probe.hasAudio) throw new Error('This clip has no audio to extract.');
        return { op: 'extractAudio' };
      default:
        throw new Error(
          `${label} is not supported. Use trim, cut, append, insert, addAudio, volume, speed, crop, resize, fade, text, blur, or extractAudio.`,
        );
    }
  }) as MediaEditOperation[];
}

/** Read duration, streams, size and frame rate from ffmpeg's stream summary. */
export function parseProbe(output: string): MediaProbe {
  const duration = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationMs = duration
    ? Math.round(
        (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000,
      )
    : 0;
  const video = output.match(/Stream #[^\n]*Video:[^\n]*/);
  const audio = /Stream #[^\n]*Audio:/.test(output);
  const size = video?.[0].match(/,\s*(\d{2,5})x(\d{2,5})[\s,[]/);
  const fps = video?.[0].match(/,\s*([\d.]+)\s*fps/);
  // Cover art in audio files shows up as an attached-picture video stream.
  const isCoverArt = Boolean(video?.[0].match(/attached pic/));
  return {
    durationMs,
    hasVideo: Boolean(video) && !isCoverArt,
    hasAudio: audio,
    width: size ? Number(size[1]) : undefined,
    height: size ? Number(size[2]) : undefined,
    fps: fps ? Number(fps[1]) : undefined,
  };
}

export async function probeMedia(path: string, ffmpeg = 'ffmpeg'): Promise<MediaProbe> {
  try {
    await execFileAsync(ffmpeg, ['-hide_banner', '-i', path], { maxBuffer: 2 * 1024 * 1024 });
  } catch (error) {
    // ffmpeg exits non-zero without an output file but prints the summary.
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const probe = parseProbe(stderr);
    if (probe.durationMs || probe.hasVideo || probe.hasAudio) return probe;
    throw new Error('This file is not a readable video or audio clip.');
  }
  throw new Error('This file is not a readable video or audio clip.');
}

export type EncodeTarget = {
  video: boolean;
  width: number;
  height: number;
  fps: number;
};

const VIDEO_CODEC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];
const AUDIO_CODEC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const sec = (ms: number) => (ms / 1000).toFixed(3);

/** Encoder flags for the current clip type. */
export function encodeArgs(target: EncodeTarget) {
  return target.video
    ? [...VIDEO_CODEC, ...AUDIO_CODEC, '-movflags', '+faststart']
    : [...AUDIO_CODEC, '-vn'];
}

/**
 * Re-encode a clip to the target format, optionally trimmed, always with an
 * audio track (silence when the clip has none) so joins line up.
 */
export function normalizeArgs(input: {
  path: string;
  probe: MediaProbe;
  target: EncodeTarget;
  startMs?: number;
  endMs?: number;
  output: string;
}) {
  const { path, probe, target, startMs, endMs, output } = input;
  const seek = [
    ...(startMs !== undefined ? ['-ss', sec(startMs)] : []),
    ...(endMs !== undefined ? ['-to', sec(endMs)] : []),
  ];
  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...seek, '-i', path];
  if (!probe.hasAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }
  const filters: string[] = [];
  if (target.video) {
    filters.push(
      `[0:v]scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${target.fps},format=yuv420p[v]`,
    );
  }
  filters.push(`[${probe.hasAudio ? '0:a:0' : '1:a'}]aresample=48000,aformat=channel_layouts=stereo[a]`);
  args.push('-filter_complex', filters.join(';'));
  if (target.video) args.push('-map', '[v]');
  args.push('-map', '[a]');
  if (!probe.hasAudio) args.push('-shortest');
  args.push(...encodeArgs(target), output);
  return args;
}

/** Join normalized clips end to end. */
export function concatArgs(paths: string[], target: EncodeTarget, output: string) {
  const inputs = paths.flatMap((path) => ['-i', path]);
  const streams = paths
    .map((_, index) => (target.video ? `[${index}:v][${index}:a]` : `[${index}:a]`))
    .join('');
  const filter = `${streams}concat=n=${paths.length}:v=${target.video ? 1 : 0}:a=1${target.video ? '[v]' : ''}[a]`;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...inputs,
    '-filter_complex',
    filter,
    ...(target.video ? ['-map', '[v]'] : []),
    '-map',
    '[a]',
    ...encodeArgs(target),
    output,
  ];
}

const between = (startMs?: number, endMs?: number) =>
  startMs === undefined && endMs === undefined
    ? ''
    : `:enable='between(t,${sec(startMs ?? 0)},${endMs === undefined ? 1e9 : sec(endMs)})'`;

/**
 * Arguments for operations that transform the current clip in one pass.
 * Joins (append, insert, addAudio) are planned by the service because they
 * need other files.
 */
export function singlePassArgs(input: {
  op: Exclude<MediaEditOperation, { op: 'append' | 'insert' | 'addAudio' }>;
  path: string;
  probe: MediaProbe;
  target: EncodeTarget;
  output: string;
  fontFile?: string;
  textFile?: string;
}): string[] {
  const { op, path, probe, target, output } = input;
  const head = ['-hide_banner', '-loglevel', 'error', '-y'];
  const encode = encodeArgs(target);
  switch (op.op) {
    case 'trim':
      return [...head, '-ss', sec(op.startMs), '-to', sec(op.endMs), '-i', path, ...encode, output];
    case 'cut': {
      const keep = `not(between(t,${sec(op.startMs)},${sec(op.endMs)}))`;
      const filters = [
        ...(target.video ? [`[0:v]select='${keep}',setpts=N/FRAME_RATE/TB[v]`] : []),
        `[0:a]aselect='${keep}',asetpts=N/SR/TB[a]`,
      ];
      return [
        ...head,
        '-i',
        path,
        '-filter_complex',
        filters.join(';'),
        ...(target.video ? ['-map', '[v]'] : []),
        '-map',
        '[a]',
        ...encode,
        output,
      ];
    }
    case 'volume': {
      const filter =
        op.startMs === undefined && op.endMs === undefined
          ? `volume=${op.level}`
          : `volume=${op.level}:enable='between(t,${sec(op.startMs ?? 0)},${op.endMs === undefined ? 1e9 : sec(op.endMs)})'`;
      return [...head, '-i', path, ...(target.video ? ['-c:v', 'copy'] : []), '-af', filter, ...AUDIO_CODEC, ...(target.video ? ['-movflags', '+faststart'] : ['-vn']), output];
    }
    case 'speed': {
      const tempos: string[] = [];
      let remaining = op.factor;
      while (remaining > 2) {
        tempos.push('atempo=2');
        remaining /= 2;
      }
      while (remaining < 0.5) {
        tempos.push('atempo=0.5');
        remaining /= 0.5;
      }
      tempos.push(`atempo=${remaining.toFixed(4)}`);
      const filters = [
        ...(target.video ? [`[0:v]setpts=PTS/${op.factor}[v]`] : []),
        `[0:a]${tempos.join(',')}[a]`,
      ];
      return [...head, '-i', path, '-filter_complex', filters.join(';'), ...(target.video ? ['-map', '[v]'] : []), '-map', '[a]', ...encode, output];
    }
    case 'crop':
      requireVideo(probe, 'crop');
      return [
        ...head,
        '-i',
        path,
        '-vf',
        `crop=trunc(iw*${op.width}/2)*2:trunc(ih*${op.height}/2)*2:trunc(iw*${op.x}):trunc(ih*${op.y})`,
        ...encode,
        output,
      ];
    case 'resize':
      requireVideo(probe, 'resize');
      return [...head, '-i', path, '-vf', `scale=${op.width}:-2`, ...encode, output];
    case 'fade': {
      const duration = probe.durationMs;
      const video: string[] = [];
      const audio: string[] = [];
      if (op.inMs) {
        video.push(`fade=t=in:st=0:d=${sec(op.inMs)}`);
        audio.push(`afade=t=in:st=0:d=${sec(op.inMs)}`);
      }
      if (op.outMs) {
        const start = sec(Math.max(0, duration - op.outMs));
        video.push(`fade=t=out:st=${start}:d=${sec(op.outMs)}`);
        audio.push(`afade=t=out:st=${start}:d=${sec(op.outMs)}`);
      }
      return [
        ...head,
        '-i',
        path,
        ...(target.video && video.length ? ['-vf', video.join(',')] : []),
        '-af',
        audio.join(','),
        ...encode,
        output,
      ];
    }
    case 'text': {
      requireVideo(probe, 'text');
      const size = op.size === 'small' ? 'h/24' : op.size === 'large' ? 'h/10' : 'h/16';
      const y = op.position === 'top' ? 'h/12' : op.position === 'center' ? '(h-text_h)/2' : 'h-text_h-h/12';
      const font = input.fontFile ? `fontfile='${input.fontFile}':` : '';
      const draw = `drawtext=${font}textfile='${input.textFile}':fontsize=${size}:fontcolor=white:borderw=2:bordercolor=black@0.6:x=(w-text_w)/2:y=${y}${between(op.startMs, op.endMs)}`;
      return [...head, '-i', path, '-vf', draw, ...encode, output];
    }
    case 'blur': {
      requireVideo(probe, 'blur');
      const w = `trunc(iw*${op.width}/2)*2`;
      const h = `trunc(ih*${op.height}/2)*2`;
      const filter = `[0:v]split[base][part];[part]crop=${w}:${h}:trunc(iw*${op.x}):trunc(ih*${op.y}),boxblur=luma_radius=20:luma_power=3[blurred];[base][blurred]overlay=trunc(main_w*${op.x}):trunc(main_h*${op.y})${between(op.startMs, op.endMs)}[v]`;
      return [...head, '-i', path, '-filter_complex', filter, '-map', '[v]', '-map', '0:a?', ...encode, output];
    }
    case 'extractAudio':
      return [...head, '-i', path, '-vn', ...AUDIO_CODEC, output];
  }
}

function requireVideo(probe: MediaProbe, operation: string) {
  if (!probe.hasVideo) throw new Error(`${operation} needs a video clip.`);
}

/** Lay an audio clip under the current clip, mixed or replacing its sound. */
export function addAudioArgs(input: {
  op: Extract<MediaEditOperation, { op: 'addAudio' }>;
  path: string;
  audioPath: string;
  target: EncodeTarget;
  durationMs: number;
  output: string;
}) {
  const { op, path, audioPath, target, durationMs, output } = input;
  const chain = [
    op.startMs !== undefined || op.endMs !== undefined
      ? `atrim=start=${sec(op.startMs ?? 0)}${op.endMs !== undefined ? `:end=${sec(op.endMs)}` : ''},asetpts=PTS-STARTPTS`
      : 'asetpts=PTS-STARTPTS',
    'aresample=48000,aformat=channel_layouts=stereo',
    `volume=${op.volume ?? 1}`,
    ...(op.fadeInMs ? [`afade=t=in:st=0:d=${sec(op.fadeInMs)}`] : []),
    ...(op.fadeOutMs && op.endMs !== undefined
      ? [`afade=t=out:st=${sec(Math.max(0, op.endMs - (op.startMs ?? 0) - op.fadeOutMs))}:d=${sec(op.fadeOutMs)}`]
      : []),
    ...(op.atMs ? [`adelay=${op.atMs}|${op.atMs}`] : []),
  ].join(',');
  const mix =
    op.mode === 'replace'
      ? `[1:a]${chain},apad[a]`
      : `[1:a]${chain}[ext];[0:a][ext]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    path,
    '-i',
    audioPath,
    '-filter_complex',
    mix,
    ...(target.video ? ['-map', '0:v', '-c:v', 'copy'] : []),
    '-map',
    '[a]',
    '-t',
    sec(durationMs),
    ...AUDIO_CODEC,
    ...(target.video ? ['-movflags', '+faststart'] : ['-vn']),
    output,
  ];
}

/** Silent stretches from ffmpeg's silencedetect output. */
export function parseSilences(output: string, durationMs: number) {
  const silences: Array<{ startMs: number; endMs: number }> = [];
  let start: number | null = null;
  for (const line of output.split('\n')) {
    const begin = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (begin) start = Math.max(0, Math.round(Number(begin[1]) * 1000));
    const end = line.match(/silence_end:\s*([\d.]+)/);
    if (end && start !== null) {
      silences.push({ startMs: start, endMs: Math.round(Number(end[1]) * 1000) });
      start = null;
    }
  }
  if (start !== null) silences.push({ startMs: start, endMs: durationMs });
  return silences.slice(0, 500);
}

/** Scene-change times from a select+showinfo pass. */
export function parseScenes(output: string) {
  const times: number[] = [];
  for (const match of output.matchAll(/pts_time:\s*([\d.]+)/g)) {
    const ms = Math.round(Number(match[1]) * 1000);
    if (!times.length || ms - times[times.length - 1] > 400) times.push(ms);
  }
  return times.slice(0, 300);
}

/** Frame times to describe: scene changes first, then even coverage. */
export function sampleTimes(durationMs: number, scenes: number[], count = 12) {
  const picks = new Set<number>([Math.min(500, durationMs / 2)]);
  for (const scene of scenes) {
    if (picks.size >= Math.ceil(count / 2)) break;
    picks.add(Math.min(durationMs - 100, scene + 300));
  }
  const step = durationMs / (count - picks.size + 1);
  for (let index = 1; picks.size < count && index <= count; index += 1) {
    picks.add(Math.round(step * index));
  }
  return [...picks]
    .filter((ms) => ms >= 0 && ms < durationMs)
    .sort((a, b) => a - b)
    .filter((ms, index, all) => index === 0 || ms - all[index - 1] > 750)
    .slice(0, count);
}
