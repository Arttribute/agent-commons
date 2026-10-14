import { AgentToolsController } from './agent-tools.controller';

/**
 * The dynamic tool executor itself now lives in ToolInvocationService (see
 * tool-invocation.service.spec.ts). What remains controller-specific is the
 * internal-caller guard on the tool-execution endpoint.
 */
describe('AgentToolsController', () => {
  let controller: AgentToolsController;

  beforeEach(() => {
    // The method under test doesn't touch injected services.
    controller = new AgentToolsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  describe('internal caller assertion', () => {
    const env = process.env;

    afterEach(() => {
      process.env = env;
    });

    it('rejects calls without the internal secret when configured', () => {
      process.env = {
        ...env,
        API_SECRET_KEY: 'shh',
        API_AUTH_REQUIRED: 'true',
      };
      expect(() =>
        (controller as any).assertInternalCaller(undefined),
      ).toThrow();
      expect(() => (controller as any).assertInternalCaller('wrong')).toThrow();
      expect(() =>
        (controller as any).assertInternalCaller('shh'),
      ).not.toThrow();
    });

    it('is a no-op when auth is disabled (local dev)', () => {
      process.env = {
        ...env,
        API_SECRET_KEY: 'shh',
        API_AUTH_REQUIRED: 'false',
      };
      expect(() =>
        (controller as any).assertInternalCaller(undefined),
      ).not.toThrow();
    });
  });

  it('does not route an ordinary chat tool through another space or a legacy account', async () => {
    const target = controller as any;
    jest.spyOn(target, 'assertInternalCaller').mockImplementation(() => {});
    target.agent = { getAgent: jest.fn().mockResolvedValue({ ownerUserId: 'current-owner', owner: 'old-owner' }) };
    target.spaceTools = { findToolByName: jest.fn().mockReturnValue({ spaceId: 'foreign-space', tool: { apiSpec: {} } }) };
    target.mcpToolDiscovery = { getToolsByOwner: jest.fn().mockResolvedValue([]) };
    target.toolService = { getToolByName: jest.fn().mockResolvedValue(null) };
    const read = jest.fn().mockResolvedValue({ content: 'current chat source' });
    target.commonToolService = { readUploadedFile: read };
    jest.spyOn(target, 'logToolSuccess').mockResolvedValue(undefined);
    const result = await controller.makeAgentToolCall({ toolCall: { name: 'readUploadedFile', args: { agentId: 'forged', fileId: 'source' } }, metadata: { agentId: 'current-agent', sessionId: 'current-chat' } });
    expect(result).toEqual({ content: 'current chat source' });
    expect(target.spaceTools.findToolByName).not.toHaveBeenCalled();
    expect(target.mcpToolDiscovery.getToolsByOwner).toHaveBeenCalledWith({ ownerId: 'current-owner', ownerType: 'user' });
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'current-agent', sessionId: 'current-chat' }), expect.objectContaining({ agentId: 'current-agent' }));
  });
});
