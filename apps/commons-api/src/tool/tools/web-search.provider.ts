import { BadRequestException } from '@nestjs/common';

export type WebSearchFreshness = 'day' | 'week' | 'month' | 'year';
export type WebSearchSafeSearch = 'off' | 'moderate' | 'strict';
export type WebSearchProvider = 'brave' | 'searxng';

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

export async function executeWebSearch(
  config: WebSearchConfig,
  input: WebSearchInput,
  fetcher: FetchLike = fetch,
): Promise<WebSearchResult[]> {
  const request =
    config.provider === 'brave'
      ? buildBraveRequest(config, input)
      : buildSearxngRequest(config, input);

  let response: Response;
  try {
    response = await fetcher(request.url, {
      headers: request.headers,
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
    config.provider === 'brave' ? data.web?.results : data.results;
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
        : {
            title: item.title,
            url: item.url,
            description: item.content,
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
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': config.braveApiKey!,
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
    headers: {
      Accept: 'application/json',
      ...(config.searxngApiKey
        ? { 'X-Agent-Commons-Search-Key': config.searxngApiKey }
        : {}),
    },
  };
}
