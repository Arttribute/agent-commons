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
});
