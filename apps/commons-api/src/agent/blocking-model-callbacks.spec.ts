import { FakeListChatModel } from '@langchain/core/utils/testing';
import { blockingModelCallbacks } from './blocking-model-callbacks';

function fixture() {
  const model = new FakeListChatModel({ responses: ['Approved output'] });
  return { model, generate: jest.spyOn(model as any, '_generate'), chunks: jest.spyOn(model as any, '_streamResponseChunks') };
}

describe('model authorization through the actual LangChain lifecycle', () => {
  let log: jest.SpyInstance;
  beforeEach(() => { log = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { log.mockRestore(); });

  it('waits for asynchronous authorization before sending a provider request', async () => {
    const { model, generate } = fixture();
    let allow!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { allow = resolve; });
    const callback = blockingModelCallbacks({ handleLLMStart: async () => { started(); await gate; } });
    const result = model.invoke('Request', { callbacks: [callback] });
    await entered;
    expect(generate).not.toHaveBeenCalled();
    allow();
    expect((await result).content).toBe('Approved output');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('rejects denied authorization before a non-streaming provider request, including copied handlers', async () => {
    const { model, generate } = fixture();
    const denied = new Error('Insufficient credits.');
    const callback = blockingModelCallbacks({ handleLLMStart: async () => { throw denied; } });
    await expect(model.invoke('Request', { callbacks: [callback.copy()] })).rejects.toBe(denied);
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects denied streaming authorization before invoking provider chunks', async () => {
    const { model, chunks } = fixture();
    const denied = new Error('Insufficient credits.');
    const callback = blockingModelCallbacks({ handleLLMStart: async () => { throw denied; } });
    await expect(model.stream('Request', { callbacks: [callback] })).rejects.toBe(denied);
    expect(chunks).not.toHaveBeenCalled();
  });

  it('propagates settlement failure instead of reporting a successful paid result', async () => {
    const { model, generate } = fixture();
    const failure = new Error('Settlement failed.');
    const callback = blockingModelCallbacks({ handleLLMEnd: async () => { throw failure; } });
    await expect(model.invoke('Request', { callbacks: [callback] })).rejects.toBe(failure);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
