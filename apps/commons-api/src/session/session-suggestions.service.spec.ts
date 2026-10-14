import { parseSuggestions, SessionSuggestionsService } from './session-suggestions.service';

describe('parseSuggestions', () => {
  it('keeps three clean suggestions and only known apps', () => {
    const raw = 'Sure! {"suggestions":[{"text":"  \\"Draft the launch email.\\" ","app":"gmail","kind":"document"},{"text":"Draft the launch email"},{"text":"Schedule a weekly review","app":"Slack","kind":"schedule"},{"text":"Summarize the research","kind":"nonsense"},{"text":"A fourth"}]}';
    expect(parseSuggestions(raw, ['Gmail'])).toEqual([
      { text: 'Draft the launch email', agentId: null, app: 'Gmail', kind: 'document' },
      { text: 'Schedule a weekly review', agentId: null, app: null, kind: 'schedule' },
      { text: 'Summarize the research', agentId: null, app: null },
    ]);
  });

  it('keeps a prompt, context and one of the person\'s agents', () => {
    const raw = JSON.stringify({
      suggestions: [
        { text: 'Turn the brief into a memo', prompt: 'Turn  my fintech brief into a one-page memo.', detail: 'You finished the brief yesterday.', agentId: 'scout' },
        { text: 'Write the launch post', agentId: 'someone-elses-agent' },
      ],
    });
    expect(parseSuggestions(raw, [], ['scout', 'writer'])).toEqual([
      { text: 'Turn the brief into a memo', prompt: 'Turn my fintech brief into a one-page memo.', detail: 'You finished the brief yesterday.', agentId: 'scout', app: null },
      { text: 'Write the launch post', agentId: null, app: null },
    ]);
  });

  it('returns nothing for text that is not JSON', () => {
    expect(parseSuggestions('no suggestions today', [])).toEqual([]);
    expect(parseSuggestions('{broken', [])).toEqual([]);
  });
});

describe('SessionSuggestionsService', () => {
  function setup(sessions: any[], reply: string) {
    const agents = [{ agentId: 'a1', name: 'Research Scout', persona: 'Cites every claim.' }];
    const db: any = {
      query: { session: { findMany: jest.fn().mockResolvedValue(sessions) } },
      select: jest.fn(() => ({
        from: () => ({
          where: () => Object.assign(Promise.resolve([]), { limit: () => Promise.resolve(agents) }),
        }),
      })),
    };
    const invoke = jest.fn().mockResolvedValue({ content: reply });
    const models: any = { build: jest.fn(() => ({ invoke })) };
    return { service: new SessionSuggestionsService(db, models), invoke };
  }

  it('skips the model for people without titled chats', async () => {
    const { service, invoke } = setup([{ sessionId: 's1', title: 'New chat', agentId: 'a1', projectId: null }], '{}');
    expect(await service.suggest('Alice')).toEqual({ suggestions: [] });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('asks once and serves the cache until chats change', async () => {
    const sessions = [{ sessionId: 's1', title: 'Launch plan', agentId: 'a1', projectId: null }];
    const { service, invoke } = setup(sessions, '{"suggestions":[{"text":"Draft the launch email","app":null}]}');
    const first = await service.suggest('alice', ['Gmail']);
    const second = await service.suggest('ALICE', ['Gmail']);
    expect(first.suggestions[0].text).toBe('Draft the launch email');
    expect(second).toEqual(first);
    expect(invoke).toHaveBeenCalledTimes(1);
    const prompt = invoke.mock.calls[0][0][1].content as string;
    expect(prompt).toContain('Launch plan');
    expect(prompt).toContain('Connected apps: Gmail');
    expect(prompt).toContain('- a1: Research Scout (Cites every claim.)');
  });

  it('returns no suggestions when the model fails', async () => {
    const { service, invoke } = setup([{ sessionId: 's1', title: 'Launch plan', agentId: 'a1', projectId: null }], '');
    invoke.mockRejectedValueOnce(new Error('down'));
    expect(await service.suggest('alice')).toEqual({ suggestions: [] });
  });
});
