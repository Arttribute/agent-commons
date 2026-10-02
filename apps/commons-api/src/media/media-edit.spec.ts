import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  addAudioArgs,
  concatArgs,
  normalizeArgs,
  parseProbe,
  parseScenes,
  parseSilences,
  sampleTimes,
  probeMedia,
  singlePassArgs,
  validateOperations,
  type EncodeTarget,
} from './media-edit';

const CLIP = '11111111-1111-4111-8111-111111111111';

describe('validateOperations', () => {
  it('accepts a full edit list and fills defaults', () => {
    expect(
      validateOperations([
        { op: 'trim', startMs: 0, endMs: 1000 },
        { op: 'addAudio', fileId: CLIP },
        { op: 'text', text: 'Trial 3' },
        { op: 'extractAudio' },
      ]),
    ).toEqual([
      { op: 'trim', startMs: 0, endMs: 1000 },
      expect.objectContaining({ op: 'addAudio', atMs: 0, volume: 1, mode: 'mix' }),
      expect.objectContaining({ op: 'text', position: 'bottom', size: 'medium' }),
      { op: 'extractAudio' },
    ]);
  });

  it.each([
    [[{ op: 'trim', startMs: 500, endMs: 100 }], 'endMs must be after startMs'],
    [[{ op: 'crop', x: 0.5, y: 0, width: 0.8, height: 1 }], 'inside the frame'],
    [[{ op: 'speed', factor: 10 }], 'between 0.25 and 4'],
    [[{ op: 'append', fileId: 'nope' }], 'Library file id'],
    [[{ op: 'extractAudio' }, { op: 'fade', inMs: 100 }], 'last operation'],
    [[{ op: 'explode' }], 'not supported'],
    [[], 'at least one'],
  ])('rejects %j', (operations, message) => {
    expect(() => validateOperations(operations)).toThrow(message);
  });
});

describe('parseProbe', () => {
  it('reads duration, streams, size and frame rate', () => {
    const probe = parseProbe(`
  Duration: 00:01:02.50, start: 0.000000, bitrate: 512 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 400 kb/s, 29.97 fps, 29.97 tbr
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s`);
    expect(probe).toEqual({ durationMs: 62_500, hasVideo: true, hasAudio: true, width: 1280, height: 720, fps: 29.97 });
  });

  it('treats album art as no video', () => {
    const probe = parseProbe(`
  Duration: 00:00:03.00
  Stream #0:0: Audio: mp3, 44100 Hz, stereo
  Stream #0:1: Video: png, rgb24(pc), 600x600, 90k tbr (attached pic)`);
    expect(probe.hasVideo).toBe(false);
    expect(probe.hasAudio).toBe(true);
  });
});

describe('analysis parsers', () => {
  it('pairs silence starts and ends, closing an open one at the end', () => {
    expect(
      parseSilences(
        '[silencedetect] silence_start: 1.25\n[silencedetect] silence_end: 2.5 | silence_duration: 1.25\n[silencedetect] silence_start: 9.1\n',
        10_000,
      ),
    ).toEqual([
      { startMs: 1250, endMs: 2500 },
      { startMs: 9100, endMs: 10_000 },
    ]);
  });

  it('reads scene times and drops near-duplicates', () => {
    expect(parseScenes('n:0 pts:1 pts_time:1.2 x\nn:1 pts_time:1.3\nn:2 pts_time:4.0')).toEqual([1200, 4000]);
  });

  it('samples frames across the clip, favouring scene changes', () => {
    const times = sampleTimes(60_000, [10_000, 30_000], 6);
    expect(times.length).toBeLessThanOrEqual(6);
    expect(times).toContain(10_300);
    expect(times.every((ms, index) => index === 0 || ms > times[index - 1])).toBe(true);
  });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
(hasFfmpeg ? describe : describe.skip)('ffmpeg edits', () => {
  let directory: string;
  const file = (name: string) => path.join(directory, name);
  const run = (args: string[]) => execFileSync('ffmpeg', args, { stdio: 'pipe' });
  const target: EncodeTarget = { video: true, width: 320, height: 240, fps: 25 };

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'media-edit-spec-'));
    run(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', file('a.mp4')]);
    // A silent clip in a different size: joins must still line up.
    run(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2', '-c:v', 'libx264', file('b.mp4')]);
    run(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', '-c:a', 'aac', file('music.m4a')]);
  }, 60_000);

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it('runs a full edit chain with exact durations', async () => {
    const a = await probeMedia(file('a.mp4'));
    run(normalizeArgs({ path: file('a.mp4'), probe: a, target, output: file('s0.mp4') }));

    run(singlePassArgs({ op: { op: 'trim', startMs: 500, endMs: 3500 }, path: file('s0.mp4'), probe: await probeMedia(file('s0.mp4')), target, output: file('s1.mp4') }));
    expect((await probeMedia(file('s1.mp4'))).durationMs).toBeGreaterThan(2900);
    expect((await probeMedia(file('s1.mp4'))).durationMs).toBeLessThan(3100);

    run(singlePassArgs({ op: { op: 'cut', startMs: 1000, endMs: 2000 }, path: file('s1.mp4'), probe: await probeMedia(file('s1.mp4')), target, output: file('s2.mp4') }));
    expect(Math.abs((await probeMedia(file('s2.mp4'))).durationMs - 2000)).toBeLessThan(150);

    const b = await probeMedia(file('b.mp4'));
    run(normalizeArgs({ path: file('b.mp4'), probe: b, target, startMs: 0, endMs: 1000, output: file('b-n.mp4') }));
    run(concatArgs([file('s2.mp4'), file('b-n.mp4')], target, file('s3.mp4')));
    const joined = await probeMedia(file('s3.mp4'));
    expect(Math.abs(joined.durationMs - 3000)).toBeLessThan(200);
    expect(joined).toEqual(expect.objectContaining({ hasVideo: true, hasAudio: true, width: 320, height: 240 }));

    run(addAudioArgs({ op: { op: 'addAudio', fileId: CLIP, atMs: 500, volume: 0.5, mode: 'mix', fadeInMs: 200 }, path: file('s3.mp4'), audioPath: file('music.m4a'), target, durationMs: joined.durationMs, output: file('s4.mp4') }));
    expect(Math.abs((await probeMedia(file('s4.mp4'))).durationMs - joined.durationMs)).toBeLessThan(150);

    const s4 = await probeMedia(file('s4.mp4'));
    run(singlePassArgs({ op: { op: 'blur', x: 0.25, y: 0.25, width: 0.5, height: 0.5, startMs: 0, endMs: 1000 }, path: file('s4.mp4'), probe: s4, target, output: file('s5.mp4') }));
    run(singlePassArgs({ op: { op: 'fade', inMs: 300, outMs: 300 }, path: file('s5.mp4'), probe: await probeMedia(file('s5.mp4')), target, output: file('s6.mp4') }));
    run(singlePassArgs({ op: { op: 'speed', factor: 2 }, path: file('s6.mp4'), probe: await probeMedia(file('s6.mp4')), target, output: file('s7.mp4') }));
    expect(Math.abs((await probeMedia(file('s7.mp4'))).durationMs - joined.durationMs / 2)).toBeLessThan(200);

    run(singlePassArgs({ op: { op: 'crop', x: 0, y: 0, width: 0.5, height: 0.5 }, path: file('s7.mp4'), probe: await probeMedia(file('s7.mp4')), target, output: file('s8.mp4') }));
    expect(await probeMedia(file('s8.mp4'))).toEqual(expect.objectContaining({ width: 160, height: 120 }));

    run(singlePassArgs({ op: { op: 'extractAudio' }, path: file('s8.mp4'), probe: await probeMedia(file('s8.mp4')), target: { ...target, video: false }, output: file('s9.m4a') }));
    expect(await probeMedia(file('s9.m4a'))).toEqual(expect.objectContaining({ hasVideo: false, hasAudio: true }));
  }, 120_000);

  it('draws a text overlay from a text file', async () => {
    writeFileSync(file('caption.txt'), "Trial 3: it's \"working\" 100%");
    const probe = await probeMedia(file('a.mp4'));
    const fonts = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/liberation/LiberationSans-Bold.ttf'];
    const fontFile = fonts.find((font) => spawnSync('test', ['-f', font]).status === 0);
    run(singlePassArgs({ op: { op: 'text', text: 'x', position: 'bottom', size: 'medium', startMs: 0, endMs: 2000 }, path: file('a.mp4'), probe, target, output: file('text.mp4'), textFile: file('caption.txt'), fontFile }));
    expect((await probeMedia(file('text.mp4'))).hasVideo).toBe(true);
  }, 60_000);
});
