import { CommonToolService } from './common-tool.service';

// This boundary test supplies its own file and computer services. Avoid booting
// unrelated Nest modules and controllers while loading the tool service.
jest.mock('~/agent/agent.service', () => ({ AgentService: class {} }));
jest.mock('~/files', () => ({ FilesService: class {}, LibraryService: class {} }));
jest.mock('~/computer', () => ({ ComputerService: class {} }));
jest.mock('~/code-project', () => ({ CodeProjectService: class {} }));
jest.mock('~/arcade', () => ({ ArcadeService: class {} }));
jest.mock('~/provider', () => ({ CapabilityProviderService: class {} }));
jest.mock('~/ui-plugin', () => ({ AppDataService: class {}, UiPluginService: class {} }));
jest.mock('~/brain', () => ({ BrainService: class {} }));
jest.mock('~/media', () => ({ CanvasService: class {}, MediaEditService: class {}, MediaService: class {} }));

describe('computed Python output boundary', () => {
  const setup = () => {
    const service = Object.create(CommonToolService.prototype) as any;
    service.capabilityOwner = jest.fn().mockResolvedValue({ principalId: 'owner', workspaceId: null });
    service.computers = { writeFiles: jest.fn().mockResolvedValue({}), runCommand: jest.fn().mockResolvedValue({ status: 'completed' }), readFile: jest.fn().mockResolvedValue({ content: JSON.stringify({ exitCode: 0, stdout: 'mean=64', stderr: '', files: [{ name: 'means.json', mimeType: 'application/json', base64: Buffer.from('{"T1":64}').toString('base64') }] }) }) };
    service.files = { createDownloadUrl: jest.fn().mockResolvedValue({ itemId: 'input', name: 'heart_rate.csv', url: 'https://private.example/signed' }), createGeneratedFile: jest.fn().mockResolvedValue({ fileId: 'computed', name: 'means.json' }) };
    return service;
  };
  it('authorizes every input and publishes actual output bytes from the isolated computer', async () => {
    const service = setup();
    const result = await service.runPythonAnalysis({ code: 'print(64)', inputItemIds: ['input'] }, { agentId: 'agent', sessionId: 'session' });
    expect(service.files.createDownloadUrl).toHaveBeenCalledWith('input', expect.objectContaining({ agentId: 'agent', sessionId: 'session', ownerId: 'owner' }));
    expect(service.computers.runCommand).toHaveBeenCalledWith(expect.objectContaining({ command: expect.stringMatching(/^python3 \/mnt\/shared\/\.commons-python\/runs\//) }));
    expect(service.files.createGeneratedFile).toHaveBeenCalledWith(expect.objectContaining({ buffer: Buffer.from('{"T1":64}'), agentId: 'agent', sessionId: 'session' }));
    expect(result.artifacts).toEqual([{ fileId: 'computed', name: 'means.json' }]);
  });
  it('cannot report success from a terminal narrative without an actual result manifest', async () => {
    const service = setup(); service.computers.readFile.mockResolvedValue({ content: 'I made a chart successfully' });
    await expect(service.runPythonAnalysis({ code: 'print(64)' }, { agentId: 'agent' })).rejects.toThrow(/verified result/);
    expect(service.files.createGeneratedFile).not.toHaveBeenCalled();
  });
  it('stages the active chat attachments when the model omits input IDs', async () => {
    const service = setup();
    await service.runPythonAnalysis({ code: 'print(64)' }, { agentId: 'agent', sessionId: 'session', attachmentFileIds: ['input'] });
    expect(service.files.createDownloadUrl).toHaveBeenCalledWith('input', expect.objectContaining({ sessionId: 'session' }));
  });
  it('unauthorized inputs prevent code execution', async () => {
    const service = setup(); service.files.createDownloadUrl.mockRejectedValue(new Error('Access denied'));
    await expect(service.runPythonAnalysis({ code: 'print(64)', inputItemIds: ['private'] }, { agentId: 'agent' })).rejects.toThrow('Access denied');
    expect(service.computers.runCommand).not.toHaveBeenCalled();
  });
});

describe('explicit chat Knowledge selection', () => {
  const setup = () => {
    const service = Object.create(CommonToolService.prototype) as any;
    service.brains = {
      ensureDefaultForAgent: jest.fn(),
      listSpaces: jest.fn().mockResolvedValue([{ spaceId: 'chosen' }, { spaceId: 'other' }]),
      search: jest.fn().mockResolvedValue([]),
      getDocument: jest.fn().mockResolvedValue({ spaceId: 'other', content: 'Outside selection' }),
      writeDocument: jest.fn(),
    };
    return service;
  };
  const metadata = { agentId: 'agent', knowledgeMode: 'selected', knowledgeSpaceIds: ['chosen'] };
  it('filters listings and enforces the selected spaces on searches', async () => {
    const service = setup();
    expect(await service.listKnowledgeSpaces({}, metadata)).toEqual([{ spaceId: 'chosen' }]);
    await service.searchKnowledge({ query: 'facts', spaceIds: ['other'] }, metadata);
    expect(service.brains.search).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ spaceIds: ['chosen'] }), expect.anything());
  });
  it('blocks document reads and writes outside the selection', async () => {
    const service = setup();
    await expect(service.readKnowledgeDocument({ documentId: 'outside' }, metadata)).rejects.toThrow(/outside this chat/);
    await expect(service.writeKnowledgeDocument({ spaceId: 'other', path: 'note.md', title: 'Note', content: 'test' }, metadata)).rejects.toThrow(/selected Knowledge/);
    expect(service.brains.writeDocument).not.toHaveBeenCalled();
  });
  it('knowledge-off performs no retrieval or default-space creation', async () => {
    const service = setup();
    await expect(service.listKnowledgeSpaces({}, { agentId: 'agent', knowledgeMode: 'off' })).rejects.toThrow(/off for this chat/);
    expect(service.brains.ensureDefaultForAgent).not.toHaveBeenCalled();
    expect(service.brains.listSpaces).not.toHaveBeenCalled();
  });
});


describe('saved media preferences win over model-chosen defaults', () => {
  const setup = () => {
    const service = Object.create(CommonToolService.prototype) as any;
    service.capabilityOwner = jest.fn().mockResolvedValue({ principalId: 'owner' });
    service.agent = { getAgent: jest.fn().mockResolvedValue({ ttsProvider: 'openai', ttsVoice: 'verse', mediaModels: { audioModel: 'openai:audio:gpt-4o-mini-tts' } }) };
    service.media = { generateAndWait: jest.fn().mockResolvedValue({ status: 'completed' }) };
    return service;
  };
  it('uses the saved audio model and voice even when the model proposes another', async () => {
    const service = setup();
    await service.generateMedia({ agentId: 'agent', kind: 'audio', modelKey: 'google:audio:gemini-3.1-flash-tts-preview', prompt: 'Hello', settings: { voice: 'Kore' } }, { agentId: 'agent' });
    expect(service.media.generateAndWait).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'openai:audio:gpt-4o-mini-tts', settings: { voice: 'verse' } }), expect.anything());
  });
  it('allows an explicit per-request override without persisting it', async () => {
    const service = setup();
    await service.generateMedia({ agentId: 'agent', kind: 'audio', modelKey: 'google:audio:gemini-3.1-flash-tts-preview', overrideAgentDefault: true, prompt: 'Hello', settings: { voice: 'Kore' } }, { agentId: 'agent' });
    expect(service.media.generateAndWait).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'google:audio:gemini-3.1-flash-tts-preview', settings: { voice: 'Kore' } }), expect.anything());
  });
});
