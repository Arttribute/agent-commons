import { of, lastValueFrom } from 'rxjs';
import { RuntimeDispatcherService } from './runtime-dispatcher.service';

describe('RuntimeDispatcherService', () => {
  const input = { agentId: 'agent-1', initiator: 'user-1', messages: [] };

  it('preserves the native execution path and input contract', async () => {
    const native = {
      getAgent: jest.fn().mockResolvedValue({ runtimeType: 'native' }),
      runAgent: jest
        .fn()
        .mockReturnValue(of({ type: 'final', source: 'native' })),
    };
    const external = { runAgent: jest.fn() };
    const service = new RuntimeDispatcherService(
      native as any,
      external as any,
    );

    await expect(lastValueFrom(service.runAgent(input))).resolves.toEqual({
      type: 'final',
      source: 'native',
    });
    expect(native.runAgent).toHaveBeenCalledWith(input);
    expect(external.runAgent).not.toHaveBeenCalled();
  });

  it.each(['openclaw', 'hermes', 'custom'])(
    'delegates %s to the external adapter',
    async (runtimeType) => {
      const native = {
        getAgent: jest.fn().mockResolvedValue({ runtimeType }),
        runAgent: jest.fn(),
      };
      const external = {
        runAgent: jest
          .fn()
          .mockReturnValue(of({ type: 'final', source: runtimeType })),
      };
      const service = new RuntimeDispatcherService(
        native as any,
        external as any,
      );

      await expect(lastValueFrom(service.runAgent(input))).resolves.toEqual({
        type: 'final',
        source: runtimeType,
      });
      expect(external.runAgent).toHaveBeenCalledWith(input);
      expect(native.runAgent).not.toHaveBeenCalled();
    },
  );
});
