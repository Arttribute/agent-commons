import { effectiveGrants } from './ui-plugin.capabilities';

describe('effectiveGrants', () => {
  const requested = [
    { name: 'tasks.read' },
    { name: 'agents.run', resourceIds: ['agent-a', 'agent-b'] },
    { name: 'data.write' },
  ];

  it('keeps the reviewed manifest for legacy apps without grants', () => {
    expect(effectiveGrants(requested, null)).toEqual([
      { name: 'tasks.read', approval: 'auto' },
      {
        name: 'agents.run',
        resourceIds: ['agent-a', 'agent-b'],
        approval: 'ask',
      },
      { name: 'data.write', approval: 'auto' },
    ]);
  });

  it('only narrows what the app requested', () => {
    expect(
      effectiveGrants(requested, {
        capabilities: [
          {
            name: 'agents.run',
            resourceIds: ['agent-b', 'agent-z'],
            approval: 'auto',
          },
          { name: 'workflows.execute' },
        ],
      }),
    ).toEqual([
      { name: 'agents.run', resourceIds: ['agent-b'], approval: 'auto' },
    ]);
  });

  it('drops a grant whose scope no longer overlaps the request', () => {
    expect(
      effectiveGrants(requested, {
        capabilities: [{ name: 'agents.run', resourceIds: ['agent-z'] }],
      }),
    ).toEqual([]);
  });

  it('ignores unknown capability names', () => {
    expect(effectiveGrants([{ name: 'secrets.read' }], null)).toEqual([]);
  });
});
