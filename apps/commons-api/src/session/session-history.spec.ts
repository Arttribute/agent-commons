import { restoreSessionMessages } from './session-history';

describe('restoreSessionMessages', () => {
  it('restores every turn persisted with LangChain human/ai roles', () => {
    const restored = restoreSessionMessages([
      { role: 'human', content: 'first question' },
      { role: 'ai', content: 'first answer' },
      { role: 'human', content: 'follow-up question' },
      { role: 'ai', content: 'follow-up answer' },
    ]);

    expect(restored).toEqual([
      { type: 'user', role: 'user', content: 'first question' },
      { type: 'assistant', role: 'assistant', content: 'first answer' },
      { type: 'user', role: 'user', content: 'follow-up question' },
      { type: 'assistant', role: 'assistant', content: 'follow-up answer' },
    ]);
  });

  it('supports legacy roles and structured content without restoring tools', () => {
    expect(
      restoreSessionMessages([
        { role: 'system', content: 'stale system prompt' },
        { role: 'user', content: '[{"type":"text","text":"hello"}]' },
        { role: 'ai', content: '' },
        { role: 'tool', content: 'expired signed URL' },
        { role: 'assistant', content: 'hello back' },
      ]),
    ).toEqual([
      {
        type: 'user',
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
      { type: 'assistant', role: 'assistant', content: 'hello back' },
    ]);
  });

  it('returns an empty list for malformed history', () => {
    expect(restoreSessionMessages(null)).toEqual([]);
    expect(restoreSessionMessages({ role: 'human' })).toEqual([]);
  });
});
