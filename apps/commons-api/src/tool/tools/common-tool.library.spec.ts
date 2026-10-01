import { CommonToolService } from './common-tool.service';

describe('CommonToolService library discovery', () => {
  it('forwards trusted owner and session context without expanding results', async () => {
    const searchForAgent = jest.fn().mockResolvedValue([]);
    const service = Object.create(CommonToolService.prototype) as any;
    service.library = { searchForAgent };

    await service.searchLibraryArtifacts(
      { query: '', limit: 12 },
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

  it('uses the authenticated agent and session for a file search when the model omits them', async () => {
    const searchFileForAgent = jest.fn().mockResolvedValue({ matches: [] });
    const service = Object.create(CommonToolService.prototype) as any;
    service.files = { searchFileForAgent };

    await service.searchUploadedFile(
      { fileId: 'file-1', query: 'conclusion' },
      { agentId: 'agent-1', ownerId: 'user-1', sessionId: 'session-1' },
    );

    expect(searchFileForAgent).toHaveBeenCalledWith({
      fileId: 'file-1', query: 'conclusion', maxResults: undefined,
      agentId: 'agent-1', ownerId: 'user-1', sessionId: 'session-1',
    });
  });

  it('uses the authenticated agent to list its Knowledge Spaces', async () => {
    const ensureDefaultForAgent = jest.fn().mockResolvedValue(undefined);
    const listSpaces = jest.fn().mockResolvedValue([]);
    const service = Object.create(CommonToolService.prototype) as any;
    service.brains = { ensureDefaultForAgent, listSpaces };

    await service.listKnowledgeSpaces({}, { agentId: 'agent-1', ownerId: 'user-1' });

    expect(ensureDefaultForAgent).toHaveBeenCalledWith('agent-1');
    expect(listSpaces).toHaveBeenCalledWith({ principalId: 'agent-1', principalType: 'agent' });
  });

  it('rejects an agent ID supplied by the model that conflicts with the authenticated agent', async () => {
    const service = Object.create(CommonToolService.prototype) as any;
    service.files = { readFileForAgent: jest.fn() };
    await expect(service.readUploadedFile(
      { fileId: 'file-1', agentId: 'another-agent' },
      { agentId: 'agent-1', ownerId: 'user-1' },
    )).rejects.toThrow('agentId must match the authenticated calling agent');
    expect(service.files.readFileForAgent).not.toHaveBeenCalled();
  });
});
