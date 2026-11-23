import { ChatOpenAI } from '@langchain/openai';
import { buildOpenAIModel } from './openai.provider';

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({})),
}));

describe('OpenAI reasoning tool transport', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each(['gpt-5.5', 'gpt-5.6-sol', 'gpt-6.2-sol', 'gpt-6.2-astra'])(
    'uses Responses for function tools with %s', (modelId) => {
      buildOpenAIModel({ provider: 'openai', modelId, apiKey: 'fixture-key', reasoningEffort: 'high' });
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        model: modelId, useResponsesApi: true, reasoning: { effort: 'high' }, temperature: undefined,
      }));
    },
  );
  it.each(['openrouter', 'xai', 'custom'] as const)(
    'keeps %s compatibility endpoints on Chat Completions', (provider) => {
      buildOpenAIModel({ provider, modelId: 'gpt-6.2-astra', apiKey: 'fixture-key', baseUrl: 'https://fixture.invalid/v1' });
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        useResponsesApi: false, configuration: { baseURL: 'https://fixture.invalid/v1' },
      }));
    },
  );
  it('retains the existing API for legacy chat models', () => {
    buildOpenAIModel({ provider: 'openai', modelId: 'gpt-4.1', apiKey: 'fixture-key' });
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ useResponsesApi: false }));
  });
  it.each(['gpt-6.2-astra', 'gpt-6.2-sol'])('does not send rejected sampling or reasoning parameters to %s', modelId => {
    buildOpenAIModel({ provider: 'openai', modelId, apiKey: 'test-key', reasoningEffort: 'none', temperature: 0.4, topP: 0.9, presencePenalty: 1, frequencyPenalty: 1 });
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ model: modelId, reasoning: { effort: 'low' }, temperature: undefined, topP: undefined, presencePenalty: undefined, frequencyPenalty: undefined }));
  });
  it('keeps the supported GPT-5.6 reasoning floor', () => {
    buildOpenAIModel({ provider: 'openai', modelId: 'gpt-5.6-sol', apiKey: 'test-key', reasoningEffort: 'minimal' });
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ reasoning: { effort: 'none' }, temperature: undefined }));
  });
  it('routes an agent\'s OpenAI requests to a shared prompt cache', () => {
    buildOpenAIModel({ provider: 'openai', modelId: 'gpt-5.5', apiKey: 'test-key', promptCacheKey: 'agent:a1' });
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ promptCacheKey: 'agent:a1' }));
  });
  it.each(['openrouter', 'xai', 'custom'] as const)('does not send a prompt cache key to %s', (provider) => {
    buildOpenAIModel({ provider, modelId: 'gpt-5.5', apiKey: 'test-key', baseUrl: 'https://fixture.invalid/v1', promptCacheKey: 'agent:a1' });
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ promptCacheKey: undefined }));
  });

});
