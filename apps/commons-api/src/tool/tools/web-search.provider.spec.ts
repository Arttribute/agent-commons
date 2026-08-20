import { BadRequestException } from '@nestjs/common';
import {
  executeWebSearch,
  resolveAccountWebSearchConfig,
  resolveWebSearchConfig,
} from './web-search.provider';

describe('web search provider', () => {
  it('explains both supported configuration paths when search is disabled', () => {
    expect(() => resolveWebSearchConfig({})).toThrow(
      /BRAVE_SEARCH_API_KEY.*SEARXNG_BASE_URL/,
    );
  });

  it('keeps Brave as the automatic provider when its key is configured', () => {
    expect(
      resolveWebSearchConfig({
        BRAVE_SEARCH_API_KEY: 'brave-key',
        SEARXNG_BASE_URL: 'http://searxng:8080',
      }),
    ).toMatchObject({
      provider: 'brave',
      braveApiKey: 'brave-key',
      costUsdPerCall: 0.005,
    });
  });

  it('uses a self-hosted SearXNG instance without a vendor API key', async () => {
    const config = resolveWebSearchConfig({
      WEB_SEARCH_PROVIDER: 'searxng',
      SEARXNG_BASE_URL: 'http://searxng:8080',
      SEARXNG_API_KEY: 'staging-search-key',
    });
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'Agent Commons',
              url: 'https://agentcommons.io',
              content: 'A commons for agents.',
              publishedDate: '2026-07-23',
            },
            { title: '', url: 'https://invalid.example' },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await executeWebSearch(
      config,
      {
        query: 'agent commons',
        count: 8,
        safeSearch: 'moderate',
        freshness: 'month',
      },
      fetcher,
    );

    const requestUrl = new URL(fetcher.mock.calls[0][0]);
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      'http://searxng:8080/search',
    );
    expect(requestUrl.searchParams.get('q')).toBe('agent commons');
    expect(requestUrl.searchParams.get('format')).toBe('json');
    expect(requestUrl.searchParams.get('safesearch')).toBe('1');
    expect(requestUrl.searchParams.get('time_range')).toBe('month');
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({
      'X-Agent-Commons-Search-Key': 'staging-search-key',
    });
    expect(results).toEqual([
      {
        title: 'Agent Commons',
        url: 'https://agentcommons.io',
        description: 'A commons for agents.',
        publishedAt: '2026-07-23',
      },
    ]);
  });

  it('rejects malformed self-hosted URLs', () => {
    expect(() =>
      resolveWebSearchConfig({
        WEB_SEARCH_PROVIDER: 'searxng',
        SEARXNG_BASE_URL: 'not a URL',
      }),
    ).toThrow(BadRequestException);
  });

  it('surfaces upstream provider errors', async () => {
    const config = resolveWebSearchConfig({
      BRAVE_SEARCH_API_KEY: 'brave-key',
    });
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }));

    await expect(
      executeWebSearch(
        config,
        { query: 'rate limited', count: 5, safeSearch: 'strict' },
        fetcher,
      ),
    ).rejects.toThrow(/429/);
  });

  it('uses a user-supplied Tavily key without platform search configuration', async () => {
    const config = resolveAccountWebSearchConfig({
      provider: 'tavily',
      credentials: { apiKey: 'tvly-user-key' },
      settings: { searchDepth: 'basic' },
    });
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'Current source',
              url: 'https://example.com/current',
              content: 'Fresh result',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await executeWebSearch(
      config,
      { query: 'latest models', count: 5, safeSearch: 'moderate' },
      fetcher,
    );

    expect(fetcher.mock.calls[0][0].toString()).toBe(
      'https://api.tavily.com/search',
    );
    expect(fetcher.mock.calls[0][1].method).toBe('POST');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer tvly-user-key',
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      query: 'latest models',
      max_results: 5,
    });
  });

  it('maps a custom JSON search response through declarative paths', async () => {
    const config = resolveAccountWebSearchConfig({
      provider: 'custom',
      endpointUrl: 'https://search.example.com/query',
      credentials: { apiKey: 'custom-key' },
      settings: {
        resultsPath: 'data.hits',
        titlePath: 'name',
        urlPath: 'link',
        descriptionPath: 'snippet',
      },
    });
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            hits: [
              {
                name: 'Mapped title',
                link: 'https://example.com/mapped',
                snippet: 'Mapped description',
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      executeWebSearch(
        config,
        { query: 'portable search', count: 3, safeSearch: 'strict' },
        fetcher,
      ),
    ).resolves.toEqual([
      {
        title: 'Mapped title',
        url: 'https://example.com/mapped',
        description: 'Mapped description',
      },
    ]);
  });
});
