import type { CreateToolParams, WorkflowDefinition } from './types';

export type WorkflowTemplateName =
  | 'country-weather-brief'
  | 'agent-research-summary'
  | 'multi-agent-field-report'
  | 'workflow-invocation-smoke';

export interface WorkflowTemplateContext {
  ownerId: string;
  prefix: string;
  agentId?: string;
  reviewerAgentId?: string;
  childWorkflowId?: string;
}

export interface WorkflowTemplateTool {
  key: string;
  payload: CreateToolParams;
}

export interface WorkflowTemplateBuild {
  name: string;
  description: string;
  tags: string[];
  category: string;
  tools: WorkflowTemplateTool[];
  buildDefinition: (toolIds: Record<string, string>, ctx: WorkflowTemplateContext) => WorkflowDefinition;
  sampleInput: Record<string, any>;
}

function toolName(prefix: string, name: string) {
  return `${prefix}_${name}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function functionTool(params: {
  name: string;
  displayName: string;
  description: string;
  properties: Record<string, any>;
  required?: string[];
  apiSpec: CreateToolParams['apiSpec'];
  tags: string[];
}): CreateToolParams {
  return {
    name: params.name,
    displayName: params.displayName,
    description: params.description,
    visibility: 'private',
    ownerType: 'user',
    category: 'public-api',
    tags: params.tags,
    schema: {
      type: 'function',
      function: {
        name: params.name,
        description: params.description,
        parameters: {
          type: 'object',
          properties: params.properties,
          required: params.required ?? [],
        },
      },
    },
    apiSpec: params.apiSpec,
  };
}

export function listWorkflowTemplates() {
  return [
    {
      name: 'country-weather-brief',
      description: 'Tool-only workflow using countries.dev and Open-Meteo.',
    },
    {
      name: 'agent-research-summary',
      description: 'Multi-tool workflow with an agent_processor summarization step.',
    },
    {
      name: 'multi-agent-field-report',
      description: 'Multi-tool workflow with two agent_processor nodes.',
    },
    {
      name: 'workflow-invocation-smoke',
      description: 'Parent workflow that invokes another workflow as a workflow node.',
    },
  ] as const;
}

export function buildWorkflowTemplate(
  templateName: WorkflowTemplateName,
  ctx: WorkflowTemplateContext,
): WorkflowTemplateBuild {
  switch (templateName) {
    case 'country-weather-brief':
      return countryWeatherBrief(ctx);
    case 'agent-research-summary':
      return agentResearchSummary(ctx);
    case 'multi-agent-field-report':
      return multiAgentFieldReport(ctx);
    case 'workflow-invocation-smoke':
      return workflowInvocationSmoke(ctx);
  }
}

function sharedTools(ctx: WorkflowTemplateContext) {
  const countryLookup = functionTool({
    name: toolName(ctx.prefix, 'country_lookup'),
    displayName: 'countries.dev country search',
    description: 'Look up country metadata by country name using countries.dev.',
    tags: ['template', 'countries-dev', 'public-api'],
    properties: {
      country: {
        type: 'string',
        description: 'Country name, for example "Finland" or "Kenya".',
      },
    },
    required: ['country'],
    apiSpec: {
      method: 'GET',
      baseUrl: 'https://countries.dev',
      path: '/name/{country}',
      authType: 'none',
    },
  });

  const weatherForecast = functionTool({
    name: toolName(ctx.prefix, 'open_meteo_weather'),
    displayName: 'Open-Meteo current weather',
    description: 'Get current weather for latitude and longitude using Open-Meteo.',
    tags: ['template', 'open-meteo', 'public-api', 'weather'],
    properties: {
      latitude: { type: 'number', description: 'Latitude in decimal degrees.' },
      longitude: { type: 'number', description: 'Longitude in decimal degrees.' },
    },
    required: ['latitude', 'longitude'],
    apiSpec: {
      method: 'GET',
      baseUrl: 'https://api.open-meteo.com',
      path: '/v1/forecast',
      queryParams: {
        latitude: '{latitude}',
        longitude: '{longitude}',
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m',
        timezone: 'auto',
      },
      authType: 'none',
    },
  });

  const openLibrarySearch = functionTool({
    name: toolName(ctx.prefix, 'open_library_search'),
    displayName: 'Open Library search',
    description: 'Search books and authors using Open Library.',
    tags: ['template', 'open-library', 'public-api', 'books'],
    properties: {
      query: { type: 'string', description: 'Book, author, or topic search query.' },
      limit: { type: 'number', description: 'Maximum result count.' },
    },
    required: ['query'],
    apiSpec: {
      method: 'GET',
      baseUrl: 'https://openlibrary.org',
      path: '/search.json',
      queryParams: {
        q: '{query}',
        limit: '{limit}',
        fields: 'key,title,author_name,first_publish_year',
      },
      authType: 'none',
    },
  });

  const exchangeRate = functionTool({
    name: toolName(ctx.prefix, 'frankfurter_exchange_rate'),
    displayName: 'Frankfurter exchange rate',
    description: 'Get a current exchange rate from USD to another currency using Frankfurter.',
    tags: ['template', 'frankfurter', 'public-api', 'exchange-rate'],
    properties: {
      to: { type: 'string', description: 'Target ISO 4217 currency code, for example "JPY".' },
    },
    required: ['to'],
    apiSpec: {
      method: 'GET',
      baseUrl: 'https://api.frankfurter.dev',
      path: '/v2/rates',
      queryParams: {
        base: 'USD',
        quotes: '{to}',
      },
      authType: 'none',
    },
  });

  return { countryLookup, weatherForecast, openLibrarySearch, exchangeRate };
}

function countryWeatherDefinition(toolIds: Record<string, string>): WorkflowDefinition {
  return {
    nodes: [
      { id: 'input', type: 'input', position: { x: 0, y: 80 } },
      { id: 'country', type: 'tool', toolId: toolIds.countryLookup, position: { x: 240, y: 20 } },
      { id: 'weather', type: 'tool', toolId: toolIds.weatherForecast, position: { x: 520, y: 20 } },
      { id: 'output', type: 'output', position: { x: 820, y: 80 } },
    ],
    edges: [
      {
        id: 'input-country',
        source: 'input',
        target: 'country',
        mapping: { country: 'country' },
      },
      {
        id: 'country-weather',
        source: 'country',
        target: 'weather',
        mapping: {
          '0.latlng.0': 'latitude',
          '0.latlng.1': 'longitude',
        },
      },
      {
        id: 'country-output',
        source: 'country',
        target: 'output',
        mapping: {
          '0.name': 'country',
          '0.capital': 'capital',
          '0.region': 'region',
          '0.population': 'population',
        },
      },
      {
        id: 'weather-output',
        source: 'weather',
        target: 'output',
        mapping: {
          'current.temperature_2m': 'temperatureC',
          'current.relative_humidity_2m': 'humidityPercent',
          'current.wind_speed_10m': 'windSpeedKph',
          timezone: 'timezone',
        },
      },
    ],
    startNodeId: 'input',
    endNodeId: 'output',
  } as WorkflowDefinition;
}

function countryWeatherBrief(ctx: WorkflowTemplateContext): WorkflowTemplateBuild {
  const tools = sharedTools(ctx);
  return {
    name: `${ctx.prefix} Country Weather Brief`,
    description: 'Tool-only workflow: country metadata plus current Open-Meteo weather.',
    category: 'template',
    tags: ['template', 'tool-workflow', 'public-api'],
    tools: [
      { key: 'countryLookup', payload: tools.countryLookup },
      { key: 'weatherForecast', payload: tools.weatherForecast },
    ],
    buildDefinition: (toolIds) => countryWeatherDefinition(toolIds),
    sampleInput: { country: 'Finland' },
  };
}

function agentResearchSummary(ctx: WorkflowTemplateContext): WorkflowTemplateBuild {
  const tools = sharedTools(ctx);
  return {
    name: `${ctx.prefix} Agent Research Summary`,
    description: 'Multi-tool workflow with an agent_processor that summarizes country and book-search data.',
    category: 'template',
    tags: ['template', 'agent-processor', 'public-api'],
    tools: [
      { key: 'countryLookup', payload: tools.countryLookup },
      { key: 'openLibrarySearch', payload: tools.openLibrarySearch },
    ],
    buildDefinition: (toolIds, buildCtx): WorkflowDefinition => ({
      nodes: [
        { id: 'input', type: 'input', position: { x: 0, y: 100 } },
        { id: 'country', type: 'tool', toolId: toolIds.countryLookup, position: { x: 240, y: 20 } },
        { id: 'books', type: 'tool', toolId: toolIds.openLibrarySearch, position: { x: 240, y: 180 } },
        {
          id: 'analyst',
          type: 'agent_processor',
          position: { x: 560, y: 100 },
          config: {
            agentId: buildCtx.agentId,
            prompt:
              'Create a concise research note from the country metadata and book search results. Include practical context and cite only the data available in the input.',
          },
        },
        { id: 'output', type: 'output', position: { x: 860, y: 100 } },
      ],
      edges: [
        { id: 'input-country', source: 'input', target: 'country', mapping: { country: 'country' } },
        { id: 'input-books', source: 'input', target: 'books', mapping: { query: 'query', limit: 'limit' } },
        { id: 'country-analyst', source: 'country', target: 'analyst', mapping: { '0': 'countryData' } },
        { id: 'books-analyst', source: 'books', target: 'analyst', mapping: { docs: 'books' } },
        { id: 'analyst-output', source: 'analyst', target: 'output', mapping: { result: 'summary' } },
      ],
      startNodeId: 'input',
      endNodeId: 'output',
    } as WorkflowDefinition),
    sampleInput: { country: 'Kenya', query: 'Kenyan history', limit: 5 },
  };
}

function multiAgentFieldReport(ctx: WorkflowTemplateContext): WorkflowTemplateBuild {
  const tools = sharedTools(ctx);
  return {
    name: `${ctx.prefix} Multi-Agent Field Report`,
    description: 'Multi-agent, multi-tool workflow with a researcher agent and reviewer agent.',
    category: 'template',
    tags: ['template', 'multi-agent', 'multi-tool', 'public-api'],
    tools: [
      { key: 'countryLookup', payload: tools.countryLookup },
      { key: 'weatherForecast', payload: tools.weatherForecast },
      { key: 'exchangeRate', payload: tools.exchangeRate },
    ],
    buildDefinition: (toolIds, buildCtx): WorkflowDefinition => ({
      nodes: [
        { id: 'input', type: 'input', position: { x: 0, y: 120 } },
        { id: 'country', type: 'tool', toolId: toolIds.countryLookup, position: { x: 230, y: 20 } },
        { id: 'weather', type: 'tool', toolId: toolIds.weatherForecast, position: { x: 500, y: 20 } },
        { id: 'exchange-rate', type: 'tool', toolId: toolIds.exchangeRate, position: { x: 230, y: 240 } },
        {
          id: 'researcher',
          type: 'agent_processor',
          position: { x: 760, y: 80 },
          config: {
            agentId: buildCtx.agentId,
            prompt:
              'Draft a compact field report from the country, weather, and exchange-rate data. Use clear sections and do not invent facts.',
          },
        },
        {
          id: 'reviewer',
          type: 'agent_processor',
          position: { x: 1060, y: 80 },
          config: {
            agentId: buildCtx.reviewerAgentId ?? buildCtx.agentId,
            prompt:
              'Review the draft field report for clarity, unsupported claims, and operational usefulness. Return the improved final report.',
          },
        },
        { id: 'output', type: 'output', position: { x: 1360, y: 120 } },
      ],
      edges: [
        { id: 'input-country', source: 'input', target: 'country', mapping: { country: 'country' } },
        { id: 'country-weather', source: 'country', target: 'weather', mapping: { '0.latlng.0': 'latitude', '0.latlng.1': 'longitude' } },
        { id: 'country-exchange-rate', source: 'country', target: 'exchange-rate', mapping: { '0.currencies.0.code': 'to' } },
        { id: 'country-researcher', source: 'country', target: 'researcher', mapping: { '0': 'countryData' } },
        { id: 'weather-researcher', source: 'weather', target: 'researcher', mapping: { current: 'weather' } },
        { id: 'exchange-rate-researcher', source: 'exchange-rate', target: 'researcher', mapping: { '0': 'exchangeRate' } },
        { id: 'researcher-reviewer', source: 'researcher', target: 'reviewer', mapping: { result: 'draftReport' } },
        { id: 'reviewer-output', source: 'reviewer', target: 'output', mapping: { result: 'finalReport' } },
      ],
      startNodeId: 'input',
      endNodeId: 'output',
    } as WorkflowDefinition),
    sampleInput: { country: 'Japan' },
  };
}

function workflowInvocationSmoke(ctx: WorkflowTemplateContext): WorkflowTemplateBuild {
  return {
    name: `${ctx.prefix} Workflow Invocation Smoke`,
    description: 'Parent workflow template that expects a child workflowId and invokes it as a workflow node.',
    category: 'template',
    tags: ['template', 'workflow-invocation'],
    tools: [],
    buildDefinition: (_toolIds, buildCtx): WorkflowDefinition => ({
      nodes: [
        { id: 'input', type: 'input', position: { x: 0, y: 80 } },
        {
          id: 'child-workflow',
          type: 'workflow',
          position: { x: 280, y: 80 },
          config: {
            workflowId: buildCtx.childWorkflowId,
            timeoutMs: 90_000,
          },
        },
        { id: 'output', type: 'output', position: { x: 620, y: 80 } },
      ],
      edges: [
        { id: 'input-child', source: 'input', target: 'child-workflow' },
        { id: 'child-output', source: 'child-workflow', target: 'output', mapping: { result: 'childResult', executionId: 'childExecutionId' } },
      ],
      startNodeId: 'input',
      endNodeId: 'output',
    } as WorkflowDefinition),
    sampleInput: { country: 'Finland' },
  };
}
