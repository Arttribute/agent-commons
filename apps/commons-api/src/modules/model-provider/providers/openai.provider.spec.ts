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
});
