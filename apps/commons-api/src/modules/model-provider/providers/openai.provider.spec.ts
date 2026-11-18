import { ChatOpenAI } from '@langchain/openai';
import { buildOpenAIModel } from './openai.provider';
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));
describe('GPT reasoning model compatibility', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each(['gpt-6.2-astra', 'gpt-6.2-sol'])('does not send rejected sampling or reasoning parameters to %s', modelId => {
    buildOpenAIModel({ provider: 'openai', modelId, apiKey: 'test-key', reasoningEffort: 'none', temperature: 0.4, topP: 0.9, presencePenalty: 1, frequencyPenalty: 1 });
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ model: modelId, reasoning: { effort: 'low' }, temperature: undefined, topP: undefined, presencePenalty: undefined, frequencyPenalty: undefined }));
  });
  it('keeps the supported GPT-5.6 reasoning floor', () => {
    buildOpenAIModel({ provider: 'openai', modelId: 'gpt-5.6-sol', apiKey: 'test-key', reasoningEffort: 'minimal' });
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ reasoning: { effort: 'none' }, temperature: undefined }));
  });
});
