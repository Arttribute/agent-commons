import { normalizeToolOutput, normalizeValue } from './workflow-value';

describe('workflow-value normalizer', () => {
  it('returns [] for nullish output', () => {
    expect(normalizeToolOutput(undefined)).toEqual([]);
    expect(normalizeToolOutput(null)).toEqual([]);
  });

  it('classifies short strings as text and long/markdown as markdown', () => {
    expect(normalizeValue('hello').kind).toBe('text');
    expect(normalizeValue('# Title\n\n- a\n- b').kind).toBe('markdown');
  });

  it('detects image / audio / video / link URLs', () => {
    expect(normalizeValue('https://x.com/a.png').kind).toBe('image');
    expect(normalizeValue('https://x.com/a.mp3').kind).toBe('audio');
    expect(normalizeValue('https://x.com/a.mp4').kind).toBe('video');
    expect(normalizeValue('https://x.com/page').kind).toBe('link');
  });

  it('keeps base64 data URIs out of text', () => {
    const v = normalizeValue('data:image/png;base64,AAAA');
    expect(v.kind).toBe('image');
    expect(v.text).toBe('[image]');
    expect(v.data?.url).toContain('data:image/png');
  });

  it('numbers and booleans', () => {
    expect(normalizeValue(42)).toMatchObject({ kind: 'number', text: '42' });
    expect(normalizeValue(true)).toMatchObject({ kind: 'boolean', text: 'true' });
  });

  it('unwraps { result } wrappers', () => {
    expect(normalizeValue({ result: 'hi', success: true }).kind).toBe('text');
  });

  it('detects email shape', () => {
    const v = normalizeValue({ to: 'a@b.com', subject: 'Hi', body: 'yo', status: 'sent' });
    expect(v.kind).toBe('email');
    expect(v.text).toBe('Hi');
    expect(v.data?.to).toBe('a@b.com');
  });

  it('detects calendar event shape', () => {
    const v = normalizeValue({ title: 'Standup', start: '2026-07-22T09:00:00Z', location: 'Zoom' });
    expect(v.kind).toBe('calendar_event');
    expect(v.data?.location).toBe('Zoom');
  });

  it('detects media by url field', () => {
    expect(normalizeValue({ imageUrl: 'https://x/y.jpg' }).kind).toBe('image');
    expect(normalizeValue({ audioUrl: 'https://x/y' }).kind).toBe('audio');
  });

  it('recognizes tool results with outcome flags', () => {
    const v = normalizeValue({ success: true, message: 'Done', foo: 1 });
    expect(v.kind).toBe('tool_result');
    expect(v.text).toBe('Done');
  });

  it('falls back to json for unknown objects', () => {
    expect(normalizeValue({ a: 1, b: 2 }).kind).toBe('json');
  });

  it('honors an explicit presentation hint', () => {
    const v = normalizeToolOutput(
      { photo: 'https://x/y', caption: 'A cat' },
      { kind: 'image', textPath: 'caption', fieldMap: { url: 'photo' } },
    );
    expect(v[0].kind).toBe('image');
    expect(v[0].text).toBe('A cat');
    expect(v[0].data?.url).toBe('https://x/y');
  });
});
