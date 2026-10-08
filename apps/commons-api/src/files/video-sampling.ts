import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export function videoSampleTimes(durationSeconds: number, requestedFrames = 8, framesPerSecond = 30) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Video duration could not be determined');
  const limit = Number.isFinite(requestedFrames) ? Math.max(1, Math.min(12, Math.floor(requestedFrames))) : 8;
  const count = Math.min(limit, durationSeconds < 0.3 ? 1 : Math.max(3, Math.ceil(durationSeconds / 3)));
  const last = Math.max(0, durationSeconds - Math.min(durationSeconds / 2, Math.max(0.2, Number.isFinite(framesPerSecond) && framesPerSecond > 0 ? 1 / framesPerSecond : 0.2)));
  return Array.from({ length: count }, (_, index) => count === 1 ? 0 : last * index / (count - 1));
}

/** Remux browser recordings to obtain duration, then sample the entire clip. */
export async function extractSampledVideoFrames(inputPath: string, directory: string, requestedFrames = 8) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
  const normalizedPath = join(directory, 'seekable-video.mkv');
  const options = { maxBuffer: 4 * 1024 * 1024, timeout: 120_000 };
  await execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy', '-y', normalizedPath], options);
  const probe = await execute(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=avg_frame_rate', '-of', 'json', normalizedPath], options);
  const metadata = JSON.parse(probe.stdout);
  const durationSeconds = Number(metadata.format?.duration);
  const rate = metadata.streams?.find((stream: { avg_frame_rate?: string }) => stream.avg_frame_rate && stream.avg_frame_rate !== '0/0')?.avg_frame_rate?.split('/').map(Number);
  const framesPerSecond = rate?.length === 2 ? rate[0] / rate[1] : 30;
  const times = videoSampleTimes(durationSeconds, requestedFrames, framesPerSecond);
  const frames: Array<{ name: string; timestampMs: number }> = [];
  for (const [index, seconds] of times.entries()) {
    const name = `frame-${String(index + 1).padStart(2, '0')}.jpg`;
    await execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(seconds), '-i', normalizedPath, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '3', '-y', join(directory, name)], options);
    frames.push({ name, timestampMs: Math.round(seconds * 1000) });
  }
  return { frames, durationMs: Math.round(durationSeconds * 1000) };
}
