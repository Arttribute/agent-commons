import { CommonToolService } from './common-tool.service';

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
  it('unauthorized inputs prevent code execution', async () => {
    const service = setup(); service.files.createDownloadUrl.mockRejectedValue(new Error('Access denied'));
    await expect(service.runPythonAnalysis({ code: 'print(64)', inputItemIds: ['private'] }, { agentId: 'agent' })).rejects.toThrow('Access denied');
    expect(service.computers.runCommand).not.toHaveBeenCalled();
  });
});
