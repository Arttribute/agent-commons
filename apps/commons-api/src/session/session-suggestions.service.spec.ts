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
    const { service, invoke } = setup(sessions, '{"suggestions":[{"text":"Draft the launch email","sourceSessionId":"s1","app":null}]}');
    const first = await service.suggest('alice', ['Gmail']);
    const second = await service.suggest('ALICE', ['Gmail']);
    expect(first.suggestions[0].text).toBe('Draft the launch email');
    expect(second).toEqual(first);
    expect(invoke).toHaveBeenCalledTimes(1);
    const prompt = invoke.mock.calls[0][0][1].content as string;
    expect(prompt).toContain('Launch plan');
    expect(prompt).toContain('Connected apps: Gmail');
    expect(prompt).toContain('- a1: Research Scout (Cites every claim.)');
    expect(first.suggestions[0].prompt).toContain('readUserChat');
    expect(first.suggestions[0].sourceSessionId).toBe('s1');
    sessions[0].title = 'Updated launch plan';
    await service.suggest('alice', ['Gmail']);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('grounds follow-ups in exact source IDs and concrete context, rejecting invented sessions', () => {
    const source = { sessionId: 'source-id', agentId: 'dev', projectId: null, title: 'Deploy plan', contextExcerpt: 'Use Node 22. Run migrations before replacing the API task. Verify the health check.' };
    const rows = parseSuggestions(JSON.stringify({ suggestions: [
      { text: 'Make a deploy checklist', sourceSessionId: 'source-id', prompt: 'Turn the deployment decisions into a checklist.', agentId: 'writer' },
      { text: 'Continue a made-up chat', sourceSessionId: 'invented' },
    ] }), [], ['dev', 'writer'], [source]);
    expect(rows).toHaveLength(1);
    expect(rows[0].agentId).toBe('dev');
    expect(rows[0].prompt).toContain('source-id');
    expect(rows[0].prompt).toContain('general agent chat');
    expect(rows[0].prompt).toContain('Node 22');
    expect(rows[0].prompt).toContain('nextContentOffset');
  });

  it('returns no suggestions when the model fails', async () => {
    const { service, invoke } = setup([{ sessionId: 's1', title: 'Launch plan', agentId: 'a1', projectId: null }], '');
    invoke.mockRejectedValueOnce(new Error('down'));
    expect(await service.suggest('alice')).toEqual({ suggestions: [] });
  });
});
