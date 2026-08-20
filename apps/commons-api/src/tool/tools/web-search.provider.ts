import { BadRequestException } from '@nestjs/common';

export type WebSearchFreshness = 'day' | 'week' | 'month' | 'year';
export type WebSearchSafeSearch = 'off' | 'moderate' | 'strict';
export type WebSearchProvider = 'brave' | 'searxng' | 'tavily' | 'custom';

export type WebSearchInput = {
  query: string;
  count: number;
  freshness?: WebSearchFreshness;
  safeSearch: WebSearchSafeSearch;
};

export type WebSearchResult = {
  title: string;
  url: string;
  description?: string;
  publishedAt?: string;
};

export type WebSearchConfig = {
  provider: WebSearchProvider;
  costUsdPerCall: number;
  braveApiKey?: string;
  searxngBaseUrl?: string;
  searxngApiKey?: string;
  apiKey?: string;
  endpointUrl?: string;
  settings?: Record<string, unknown>;
};

type FetchLike = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

const NOT_CONFIGURED_MESSAGE =
  'webSearch is not configured. Set BRAVE_SEARCH_API_KEY, or set ' +
  'WEB_SEARCH_PROVIDER=searxng and SEARXNG_BASE_URL for self-hosted search.';

function parseCost(value: string | undefined, fallback: number): number {
  const cost = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(cost) || cost < 0) {
    throw new BadRequestException(
      'The configured web search cost must be a non-negative number.',
    );
  }
  return cost;
}

export function resolveWebSearchConfig(
  env: NodeJS.ProcessEnv = process.env,
): WebSearchConfig {
  const requestedProvider = env.WEB_SEARCH_PROVIDER?.trim().toLowerCase();
  if (
    requestedProvider &&
    requestedProvider !== 'brave' &&
    requestedProvider !== 'searxng'
  ) {
    throw new BadRequestException(
      'WEB_SEARCH_PROVIDER must be either "brave" or "searxng".',
    );
  }

  const provider: WebSearchProvider | undefined = requestedProvider
    ? (requestedProvider as WebSearchProvider)
    : env.BRAVE_SEARCH_API_KEY
    ? 'brave'
    : env.SEARXNG_BASE_URL
    ? 'searxng'
    : undefined;

  if (!provider) {
    throw new BadRequestException(NOT_CONFIGURED_MESSAGE);
  }

  if (provider === 'brave') {
    if (!env.BRAVE_SEARCH_API_KEY) {
      throw new BadRequestException(NOT_CONFIGURED_MESSAGE);
    }
    return {
      provider,
      braveApiKey: env.BRAVE_SEARCH_API_KEY,
      costUsdPerCall: parseCost(env.BRAVE_SEARCH_COST_USD_PER_CALL, 0.005),
    };
  }

  if (!env.SEARXNG_BASE_URL) {
    throw new BadRequestException(NOT_CONFIGURED_MESSAGE);
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(env.SEARXNG_BASE_URL);
  } catch {
    throw new BadRequestException('SEARXNG_BASE_URL must be a valid URL.');
  }
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new BadRequestException('SEARXNG_BASE_URL must use http or https.');
  }

  return {
    provider,
    searxngBaseUrl: baseUrl.toString(),
    searxngApiKey: env.SEARXNG_API_KEY,
    // A self-hosted instance has no per-query vendor fee by default. Operators
    // can set this to their measured infrastructure cost for credit metering.
    costUsdPerCall: parseCost(env.SEARXNG_SEARCH_COST_USD_PER_CALL, 0),
  };
}

export function resolveAccountWebSearchConfig(input: {
  provider: string;
  endpointUrl?: string;
  settings?: Record<string, unknown>;
  credentials?: Record<string, string>;
}): WebSearchConfig {
  if (!['brave', 'searxng', 'tavily', 'custom'].includes(input.provider)) {
    throw new BadRequestException(
      `Unsupported web search provider "${input.provider}"`,
    );
  }
  const provider = input.provider as WebSearchProvider;
  const apiKey = input.credentials?.apiKey;
  if ((provider === 'brave' || provider === 'tavily') && !apiKey) {
    throw new BadRequestException(`${provider} requires an API key`);
  }
  if ((provider === 'searxng' || provider === 'custom') && !input.endpointUrl) {
    throw new BadRequestException(`${provider} requires an endpoint URL`);
  }
  return {
    provider,
    costUsdPerCall: 0,
    braveApiKey: provider === 'brave' ? apiKey : undefined,
    searxngBaseUrl: provider === 'searxng' ? input.endpointUrl : undefined,
    searxngApiKey: provider === 'searxng' ? apiKey : undefined,
    apiKey,
    endpointUrl: input.endpointUrl,
    settings: input.settings ?? {},
  };
}

export async function executeWebSearch(
  config: WebSearchConfig,
  input: WebSearchInput,
  fetcher: FetchLike = fetch,
): Promise<WebSearchResult[]> {
  const request = buildSearchRequest(config, input);

  let response: Response;
  try {
    response = await fetcher(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new BadRequestException(
        `webSearch provider "${config.provider}" timed out.`,
      );
    }
    throw error;
  }

  if (!response.ok) {
    throw new BadRequestException(
      `webSearch provider "${config.provider}" returned ${response.status} ${response.statusText}`,
    );
  }

  const data: any = await response.json();
  const rawResults =
    config.provider === 'brave'
      ? data.web?.results
      : config.provider === 'custom'
      ? readPath(data, String(config.settings?.resultsPath || 'results'))
      : data.results;
  if (!Array.isArray(rawResults)) return [];

  return rawResults
    .map((item: any) =>
      config.provider === 'brave'
        ? {
            title: item.title,
            url: item.url,
            description: item.description,
            publishedAt: item.age,
          }
        : config.provider === 'custom'
        ? {
            title: readPath(
              item,
              String(config.settings?.titlePath || 'title'),
            ),
            url: readPath(item, String(config.settings?.urlPath || 'url')),
            description: readPath(
              item,
              String(config.settings?.descriptionPath || 'description'),
            ),
            publishedAt: readPath(
              item,
              String(config.settings?.publishedAtPath || 'publishedAt'),
            ),
          }
        : {
            title: item.title,
            url: item.url,
            description: item.content ?? item.description,
            publishedAt: item.publishedDate ?? item.published_date,
          },
    )
    .filter(
      (item: WebSearchResult) =>
        typeof item.title === 'string' &&
        item.title.trim().length > 0 &&
        typeof item.url === 'string' &&
        item.url.trim().length > 0,
    )
    .slice(0, input.count);
}

function buildSearchRequest(config: WebSearchConfig, input: WebSearchInput) {
  if (config.provider === 'brave') return buildBraveRequest(config, input);
  if (config.provider === 'searxng') return buildSearxngRequest(config, input);
  if (config.provider === 'tavily') return buildTavilyRequest(config, input);
  return buildCustomRequest(config, input);
}

function buildBraveRequest(config: WebSearchConfig, input: WebSearchInput) {
  const freshnessMap = {
    day: 'pd',
    week: 'pw',
    month: 'pm',
    year: 'py',
  } as const;
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', input.query);
  url.searchParams.set('count', String(input.count));
  url.searchParams.set('safesearch', input.safeSearch);
  if (input.freshness) {
    url.searchParams.set('freshness', freshnessMap[input.freshness]);
  }
  return {
    url,
    init: {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': config.braveApiKey!,
      },
    },
  };
}

function buildSearxngRequest(config: WebSearchConfig, input: WebSearchInput) {
  const safeSearchMap = {
    off: '0',
    moderate: '1',
    strict: '2',
  } as const;
  const baseUrl = config.searxngBaseUrl!.replace(/\/+$/, '');
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set('q', input.query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', 'general');
  url.searchParams.set('safesearch', safeSearchMap[input.safeSearch]);
  if (input.freshness) {
    url.searchParams.set('time_range', input.freshness);
  }
  return {
    url,
    init: {
      headers: {
        Accept: 'application/json',
        ...(config.searxngApiKey
          ? { 'X-Agent-Commons-Search-Key': config.searxngApiKey }
          : {}),
      },
    },
  };
}

function buildTavilyRequest(config: WebSearchConfig, input: WebSearchInput) {
  return {
    url: new URL('https://api.tavily.com/search'),
    init: {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        query: input.query,
        max_results: input.count,
        search_depth: config.settings?.searchDepth || 'basic',
        ...(input.freshness ? { time_range: input.freshness } : {}),
      }),
    },
  };
}

function buildCustomRequest(config: WebSearchConfig, input: WebSearchInput) {
  const method = String(config.settings?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    throw new BadRequestException('Custom search method must be GET or POST');
  }
  const url = new URL(config.endpointUrl!);
  const queryField = String(config.settings?.queryField || 'q');
  const countField = String(config.settings?.countField || 'count');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.apiKey) {
    const header = String(config.settings?.apiKeyHeader || 'Authorization');
    const prefix = String(config.settings?.apiKeyPrefix ?? 'Bearer ');
    headers[header] = `${prefix}${config.apiKey}`;
  }
  if (method === 'GET') {
    url.searchParams.set(queryField, input.query);
    url.searchParams.set(countField, String(input.count));
    return { url, init: { headers } };
  }
  headers['Content-Type'] = 'application/json';
  return {
    url,
    init: {
      method,
      headers,
      body: JSON.stringify({
        [queryField]: input.query,
        [countField]: input.count,
        freshness: input.freshness,
        safeSearch: input.safeSearch,
      }),
    },
  };
}

function readPath(value: any, path: string) {
  return path
    .split('.')
    .reduce((current, segment) => current?.[segment], value);
}
