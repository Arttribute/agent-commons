import { CommonToolService } from './common-tool.service';

describe('CommonToolService library discovery', () => {
  it('forwards trusted owner and session context without expanding results', async () => {
    const searchForAgent = jest.fn().mockResolvedValue([]);
    const service = Object.create(CommonToolService.prototype) as any;
    service.library = { searchForAgent };

    await service.searchLibraryArtifacts(
      { agentId: 'agent-1', query: '', limit: 12 },
      {
        agentId: 'agent-1',
        ownerId: 'user-1',
        sessionId: 'session-1',
      },
    );

    expect(searchForAgent).toHaveBeenCalledWith({
      agentId: 'agent-1',
      ownerId: 'user-1',
      sessionId: 'session-1',
      query: '',
      limit: 12,
    });
  });
});
