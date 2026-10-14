import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { extractSampledVideoFrames } = require('../dist/nest/src/files/video-sampling.js');
const sharp = require('sharp');
const directory = mkdtempSync(join(tmpdir(), 'commons-video-sampling-'));
try {
  const long = join(directory, 'long.webm');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=1:d=80', '-f', 'lavfi', '-i', 'color=c=green:s=160x120:r=1:d=40', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libvpx-vp9', long], { timeout: 30000 });
  const result = await extractSampledVideoFrames(long, directory);
  assert.equal(result.frames.length, 8);
  assert.ok(result.frames.at(-1).timestampMs > 110000, 'Ending was not sampled');
  const ending = await sharp(join(directory, result.frames.at(-1).name)).raw().toBuffer();
  assert.ok(ending[1] > ending[0] + 50, 'The actual last frame does not show the green ending');
  const short = join(directory, 'short.webm');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=12:d=0.25', '-c:v', 'libvpx-vp9', short], { timeout: 30000 });
  const brief = await extractSampledVideoFrames(short, directory);
  assert.equal(brief.frames.length, 1);
  await sharp(join(directory, brief.frames[0].name)).metadata();
  if (process.env.COMMONS_RECORDED_VIDEO_FIXTURE) {
    const recorded = await extractSampledVideoFrames(resolve(process.env.COMMONS_RECORDED_VIDEO_FIXTURE), directory);
    assert.ok(recorded.frames.length >= 3, 'Short browser recording lost intermediate workflow steps');
    for (const frame of recorded.frames) await sharp(join(directory, frame.name)).metadata();
  }
  console.log(JSON.stringify({ passed: true, wholeClip: true, lastFrameVerified: true, subsecondClip: true, browserRecording: !!process.env.COMMONS_RECORDED_VIDEO_FIXTURE }));
} finally { rmSync(directory, { recursive: true, force: true }); }
