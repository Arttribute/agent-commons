import type {
  BrowserCheckCapability,
  BrowserCheckCapabilityName,
} from './code-project.types';

export const VERIFIER_HOST_ORIGIN = 'https://commons-verifier.invalid';

export const BROWSER_CHECK_CAPABILITIES: BrowserCheckCapabilityName[] = [
  'agents.read',
  'tasks.read',
  'tasks.write',
  'workflows.read',
  'workflows.execute',
  'library.read',
  'tools.read',
  'copilot.prompt',
];

const CAPABILITY_SET = new Set<BrowserCheckCapabilityName>(
  BROWSER_CHECK_CAPABILITIES,
);

type HostScenario = {
  name: string;
  surface: 'page' | 'widget';
  theme: 'light' | 'dark';
  width: number;
  height: number;
};

type HostConfig = {
  appUrl: string;
  previewOrigin: string;
  scenario: HostScenario;
  capabilities: BrowserCheckCapabilityName[];
  fixtures: typeof VERIFIER_FIXTURES;
};

export type VerifierBridgeCall = {
  method: string;
  outcome: 'fixture' | 'denied' | 'invalid' | 'rate-limited';
};

/**
 * Deliberately small, deterministic and display-safe records. They exercise
 * populated states without requiring authentication or copying user data into
 * generated-app screenshots.
 */
export const VERIFIER_FIXTURES = {
  agents: [
    {
      agentId: 'agent-commons-copilot',
      name: 'Commons Copilot',
      description: 'Coordinates product work across the Commons workspace.',
      modelProvider: 'openai',
      modelId: 'gpt-5',
      status: 'online',
      studioPath: '/studio/agents/agent-commons-copilot',
    },
    {
      agentId: 'agent-customer-ops',
      name: 'Customer operations',
      description: 'Triages customer questions and follow-up work.',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet',
      status: 'idle',
      studioPath: '/studio/agents/agent-customer-ops',
    },
    {
      agentId: 'agent-release-manager',
      name: 'Release manager',
      description: 'Tracks release readiness and engineering hand-offs.',
      modelProvider: 'openai',
      modelId: 'gpt-5-mini',
      status: 'working',
      studioPath: '/studio/agents/agent-release-manager',
    },
  ],
  tasks: [
    {
      taskId: 'task-customer-follow-up',
      title: 'Follow up on enterprise onboarding',
      description: 'Send the revised rollout plan and confirm owners.',
      status: 'in_progress',
      progress: 60,
      priority: 90,
      agentId: 'agent-customer-ops',
      createdAt: '2026-08-18T09:00:00.000Z',
      updatedAt: '2026-08-22T14:30:00.000Z',
      studioPath: '/studio/tasks/task-customer-follow-up',
    },
    {
      taskId: 'task-release-checklist',
      title: 'Complete release checklist',
      description: 'Review browser checks, migrations, and deployment notes.',
      status: 'pending',
      progress: 25,
      priority: 80,
      agentId: 'agent-release-manager',
      scheduledFor: '2026-08-24T08:00:00.000Z',
      createdAt: '2026-08-20T11:00:00.000Z',
      updatedAt: '2026-08-22T17:10:00.000Z',
      studioPath: '/studio/tasks/task-release-checklist',
    },
    {
      taskId: 'task-weekly-summary',
      title: 'Prepare weekly product summary',
      description: 'Summarize wins, blockers, and next steps.',
      status: 'scheduled',
      progress: 0,
      priority: 40,
      agentId: 'agent-commons-copilot',
      nextRunAt: '2026-08-28T07:00:00.000Z',
      isRecurring: true,
      cronExpression: '0 7 * * 5',
      createdAt: '2026-08-12T07:00:00.000Z',
      updatedAt: '2026-08-21T07:00:00.000Z',
      studioPath: '/studio/tasks/task-weekly-summary',
    },
  ],
  workflows: [
    {
      workflowId: 'workflow-customer-intake',
      name: 'Customer intake',
      description: 'Classify a request, assign an owner, and draft a response.',
      status: 'active',
      category: 'customer-ops',
      tags: ['customer', 'triage'],
      nodeCount: 5,
      createdAt: '2026-07-14T10:00:00.000Z',
      updatedAt: '2026-08-21T16:20:00.000Z',
      studioPath: '/studio/workflows/workflow-customer-intake',
    },
    {
      workflowId: 'workflow-release-readiness',
      name: 'Release readiness',
      description: 'Collect checks and prepare a go/no-go summary.',
      status: 'draft',
      category: 'engineering',
      tags: ['release'],
      nodeCount: 7,
      createdAt: '2026-08-02T13:00:00.000Z',
      updatedAt: '2026-08-22T08:45:00.000Z',
      studioPath: '/studio/workflows/workflow-release-readiness',
    },
  ],
  library: [
    {
      itemId: 'library-product-brief',
      name: 'Q3 product brief.pdf',
      description: 'Current product goals, milestones, and launch criteria.',
      kind: 'document',
      mimeType: 'application/pdf',
      sizeBytes: 428_320,
      source: 'upload',
      status: 'ready',
      visibility: 'private',
      isFavorite: true,
      createdAt: '2026-08-10T12:00:00.000Z',
      updatedAt: '2026-08-20T09:15:00.000Z',
      libraryPath: '/library?item=library-product-brief',
    },
    {
      itemId: 'library-customer-notes',
      name: 'Customer research notes',
      description: 'Themes and opportunities from recent conversations.',
      kind: 'document',
      mimeType: 'text/markdown',
      sizeBytes: 18_740,
      source: 'agent',
      status: 'ready',
      visibility: 'private',
      sourceAgentId: 'agent-customer-ops',
      isFavorite: false,
      createdAt: '2026-08-19T15:30:00.000Z',
      updatedAt: '2026-08-22T11:05:00.000Z',
      libraryPath: '/library?item=library-customer-notes',
    },
    {
      itemId: 'library-demo-recording',
      name: 'Release walkthrough.mp4',
      description: 'Short product walkthrough used by the release team.',
      kind: 'media',
      mimeType: 'video/mp4',
      sizeBytes: 8_420_000,
      source: 'session',
      status: 'ready',
      visibility: 'private',
      sourceAgentId: 'agent-release-manager',
      sourceSessionId: 'session-release-demo',
      sessionTitle: 'Release demo',
      isFavorite: false,
      createdAt: '2026-08-22T09:00:00.000Z',
      updatedAt: '2026-08-22T09:00:00.000Z',
      libraryPath: '/library?item=library-demo-recording',
    },
  ],
  tools: [
    {
      toolId: 'tool-web-search',
      name: 'Web search',
      description: 'Find current information from configured search providers.',
      category: 'research',
      status: 'active',
      visibility: 'workspace',
      updatedAt: '2026-08-21T08:00:00.000Z',
      studioPath: '/studio/tools/tool-web-search',
    },
    {
      toolId: 'tool-github',
      name: 'GitHub',
      description: 'Read repositories, issues, and pull-request context.',
      category: 'developer',
      status: 'active',
      visibility: 'workspace',
      updatedAt: '2026-08-20T12:30:00.000Z',
      studioPath: '/studio/tools/tool-github',
    },
    {
      toolId: 'tool-email',
      name: 'Email',
      description: 'Draft and send messages through an approved connection.',
      category: 'communication',
      status: 'needs_setup',
      visibility: 'private',
      updatedAt: '2026-08-18T07:20:00.000Z',
      studioPath: '/studio/tools/tool-email',
    },
  ],
} as const;

export function normalizeBrowserCheckCapabilities(
  capabilities: BrowserCheckCapability[] | undefined,
) {
  const names = (capabilities ?? [])
    .map((capability) =>
      typeof capability === 'string' ? capability : capability?.name,
    )
    .filter((name): name is BrowserCheckCapabilityName =>
      CAPABILITY_SET.has(name as BrowserCheckCapabilityName),
    );
  return [...new Set(names)];
}

/**
 * Run the synthetic host from an origin the preview actually permits in its
 * frame-ancestors policy. Requests for this origin are fulfilled in-memory by
 * Playwright, so no Commons host or authentication is involved.
 */
export function resolveVerifierHostOrigin(
  headers: Record<string, string>,
  previewUrl: string,
) {
  const preview = new URL(previewUrl);
  const policy = headers['content-security-policy'] || '';
  const frameAncestors = policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) =>
      directive.toLocaleLowerCase().startsWith('frame-ancestors'),
    );
  const sources = frameAncestors?.split(/\s+/).slice(1) ?? [];
  const candidates = sources
    .map((source) => verifierOriginFromSource(source, preview))
    .filter((origin): origin is string => Boolean(origin))
    .filter((origin) => origin !== preview.origin);

  if (isLocalHostname(preview.hostname)) {
    const localCandidate = candidates.find((origin) => {
      try {
        return isLocalHostname(new URL(origin).hostname);
      } catch {
        return false;
      }
    });
    if (localCandidate) return localCandidate;
  }
  if (candidates.length) return candidates[0];
  return fallbackVerifierOrigin(preview);
}

function verifierOriginFromSource(source: string, preview: URL) {
  const normalized = source.trim().replace(/^['"]|['"]$/g, '');
  if (!normalized || ['none', 'self'].includes(normalized)) return null;
  if (normalized === '*') return fallbackVerifierOrigin(preview);
  if (normalized === 'http:' || normalized === 'https:') {
    return isLocalHostname(preview.hostname)
      ? localVerifierOrigin(preview)
      : `${normalized}//commons-verifier.invalid`;
  }
  if (!/^https?:\/\//i.test(normalized)) return null;
  const candidate = normalized
    .replace('://*.', '://verifier.')
    .replace(/:\*(?=\/|$)/, isLocalHostname(preview.hostname) ? ':41737' : '');
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function fallbackVerifierOrigin(preview: URL) {
  return isLocalHostname(preview.hostname)
    ? localVerifierOrigin(preview)
    : VERIFIER_HOST_ORIGIN;
}

function localVerifierOrigin(preview: URL) {
  const hostname = preview.hostname === 'localhost' ? 'localhost' : '127.0.0.1';
  const port = preview.port === '41737' ? '41738' : '41737';
  return `http://${hostname}:${port}`;
}

function isLocalHostname(hostname: string) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

export function createVerifierHostHtml(args: {
  appUrl: string;
  scenario: HostScenario;
  capabilities: BrowserCheckCapabilityName[];
}) {
  const config: HostConfig = {
    appUrl: args.appUrl,
    previewOrigin: new URL(args.appUrl).origin,
    scenario: args.scenario,
    capabilities: args.capabilities,
    fixtures: VERIFIER_FIXTURES,
  };
  const runtime = `(${verifierHostRuntime.toString()})(${inlineJson(config)});`;
  const scrolling = args.scenario.surface === 'widget' ? 'no' : 'auto';
  return `<!doctype html>
<html lang="en" data-theme="${args.scenario.theme}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Commons verification host</title>
    <style>
      :root { color-scheme: ${args.scenario.theme}; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { background: ${args.scenario.theme === 'dark' ? '#181715' : '#f7f6f3'}; }
      #commons-app { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
    </style>
  </head>
  <body>
    <iframe
      id="commons-app"
      title="Generated Commons app under verification"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      scrolling="${scrolling}"
    ></iframe>
    <script>${runtime}</script>
  </body>
</html>`;
}

function inlineJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** This function is serialized into the isolated verifier host page. */
function verifierHostRuntime(config: HostConfig) {
  const hostGlobal = globalThis as any;
  const frame = hostGlobal.document.getElementById('commons-app') as any;
  const granted = new Set<string>(config.capabilities);
  const calls: VerifierBridgeCall[] = [];
  const storage = new Map<string, string>();
  const methodCapabilities: Record<string, string> = {
    'agents.list': 'agents.read',
    'tasks.list': 'tasks.read',
    'tasks.create': 'tasks.write',
    'tasks.update': 'tasks.write',
    'workflows.list': 'workflows.read',
    'workflows.execute': 'workflows.execute',
    'library.list': 'library.read',
    'tools.list': 'tools.read',
    'copilot.open': 'copilot.prompt',
  };
  const verifier = {
    rpcCalls: calls,
    contextMessages: 0,
  };
  hostGlobal.__commonsVerifier = verifier;

  function postContext() {
    if (!frame.contentWindow) return;
    verifier.contextMessages += 1;
    frame.contentWindow.postMessage(
      {
        type: 'commons:context',
        pluginId: 'verification-fixture',
        surface: config.scenario.surface,
        theme: config.scenario.theme,
        viewport: {
          width: config.scenario.width,
          height: config.scenario.height,
        },
        capabilities: config.capabilities,
      },
      '*',
    );
  }

  function boundedText(value: unknown, fallback = '', maximum = 300) {
    return typeof value === 'string' && value.trim()
      ? value.trim().slice(0, maximum)
      : fallback;
  }

  function boundedLimit(value: unknown) {
    const number =
      typeof value === 'number' && Number.isFinite(value) ? value : 50;
    return Math.max(1, Math.min(100, Math.round(number)));
  }

  function list(
    records: readonly Record<string, unknown>[],
    params: Record<string, unknown>,
    searchable: string[],
  ) {
    const query = boundedText(params.query, '', 200).toLocaleLowerCase();
    const filtered = query
      ? records.filter((record) =>
          searchable.some((key) =>
            String(record[key] ?? '')
              .toLocaleLowerCase()
              .includes(query),
          ),
        )
      : [...records];
    return {
      items: filtered.slice(0, boundedLimit(params.limit)),
      total: filtered.length,
      fixture: true,
    };
  }

  function resultFor(method: string, params: Record<string, unknown>) {
    if (method === 'agents.list') {
      return list(config.fixtures.agents, params, ['name', 'description']);
    }
    if (method === 'tasks.list') {
      const response = list(config.fixtures.tasks, params, [
        'title',
        'description',
      ]);
      response.items = response.items.filter(
        (task) =>
          (!params.status || task.status === params.status) &&
          (!params.agentId || task.agentId === params.agentId),
      );
      response.total = response.items.length;
      return response;
    }
    if (method === 'tasks.create') {
      return {
        taskId: 'task-verification-preview',
        title: boundedText(params.title, 'Preview task'),
        description: boundedText(params.description, '', 2_000),
        status: 'pending',
        progress: 0,
        priority:
          typeof params.priority === 'number'
            ? Math.max(-100, Math.min(100, params.priority))
            : 50,
        agentId: boundedText(params.agentId, 'agent-commons-copilot', 200),
        studioPath: '/studio/tasks/task-verification-preview',
        simulated: true,
      };
    }
    if (method === 'tasks.update') {
      const current = config.fixtures.tasks[0];
      return {
        ...current,
        taskId: boundedText(params.taskId, current.taskId, 200),
        title: boundedText(params.title, current.title),
        description: boundedText(
          params.description,
          current.description,
          2_000,
        ),
        priority:
          typeof params.priority === 'number'
            ? Math.max(-100, Math.min(100, params.priority))
            : current.priority,
        simulated: true,
      };
    }
    if (method === 'workflows.list') {
      const response = list(config.fixtures.workflows, params, [
        'name',
        'description',
      ]);
      response.items = response.items.filter(
        (workflow) => !params.status || workflow.status === params.status,
      );
      response.total = response.items.length;
      return response;
    }
    if (method === 'workflows.execute') {
      return {
        executionId: 'execution-verification-preview',
        workflowId: boundedText(
          params.workflowId,
          'workflow-release-readiness',
          200,
        ),
        status: 'started',
        startedAt: '2026-08-23T08:00:00.000Z',
        simulated: true,
      };
    }
    if (method === 'library.list') {
      const response = list(config.fixtures.library, params, [
        'name',
        'description',
      ]);
      response.items = response.items.filter((item) => {
        if (params.source && item.source !== params.source) return false;
        if (
          typeof params.favorite === 'boolean' &&
          item.isFavorite !== params.favorite
        )
          return false;
        if (
          params.view &&
          params.view !== 'all' &&
          params.view !== 'documents' &&
          item.kind !== params.view
        )
          return false;
        return true;
      });
      response.total = response.items.length;
      return response;
    }
    if (method === 'tools.list') {
      const response = list(config.fixtures.tools, params, [
        'name',
        'description',
      ]);
      response.items = response.items.filter(
        (tool) =>
          (!params.category || tool.category === params.category) &&
          (!params.visibility || tool.visibility === params.visibility),
      );
      response.total = response.items.length;
      return response;
    }
    if (method === 'copilot.open') {
      return { opened: true, simulated: true };
    }
    if (method === 'navigation.open') {
      const path = boundedText(params.path, '/', 500);
      return { opened: true, path, simulated: true };
    }
    if (method === 'storage.get') {
      const key = boundedText(params.key, '', 120);
      return { value: storage.get(key) ?? null, simulated: true };
    }
    if (method === 'storage.set') {
      const key = boundedText(params.key, '', 120);
      const value = boundedText(params.value, '', 8_000);
      storage.set(key, value);
      return { stored: true, simulated: true };
    }
    if (method === 'storage.remove') {
      const key = boundedText(params.key, '', 120);
      storage.delete(key);
      return { removed: true, simulated: true };
    }
    if (method === 'ui.resize') {
      const width =
        typeof params.width === 'number' ? Math.round(params.width) : 380;
      const height =
        typeof params.height === 'number' ? Math.round(params.height) : 480;
      return {
        width: Math.max(280, Math.min(520, width)),
        height: Math.max(240, Math.min(720, height)),
        simulated: true,
      };
    }
    return undefined;
  }

  hostGlobal.addEventListener('message', (event: any) => {
    if (
      event.source !== frame.contentWindow ||
      event.origin !== 'null' ||
      !event.data ||
      typeof event.data !== 'object'
    )
      return;
    const message = event.data as Record<string, unknown>;
    if (message.type === 'commons:ready') {
      postContext();
      return;
    }
    if (
      message.jsonrpc !== '2.0' ||
      (typeof message.id !== 'string' && typeof message.id !== 'number') ||
      typeof message.method !== 'string'
    )
      return;

    let response: Record<string, unknown>;
    let outcome: VerifierBridgeCall['outcome'] = 'fixture';
    let payloadSize = Number.POSITIVE_INFINITY;
    try {
      payloadSize = JSON.stringify(message).length;
    } catch {}

    if (calls.length >= 100) {
      outcome = 'rate-limited';
      response = {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32029,
          message: 'Verification bridge request limit reached.',
        },
      };
    } else if (payloadSize > 32_000) {
      outcome = 'invalid';
      response = {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32602,
          message: 'Invalid or oversized request parameters.',
        },
      };
    } else {
      const required = methodCapabilities[message.method];
      if (required && !granted.has(required)) {
        outcome = 'denied';
        response = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32001,
            message: `This app was not granted the ${required} capability.`,
          },
        };
      } else {
        const result = resultFor(
          message.method,
          message.params && typeof message.params === 'object'
            ? (message.params as Record<string, unknown>)
            : {},
        );
        if (result === undefined) {
          outcome = 'invalid';
          response = {
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: 'Commons method is unavailable.' },
          };
        } else {
          response = { jsonrpc: '2.0', id: message.id, result };
        }
      }
    }
    calls.push({ method: message.method, outcome });
    frame.contentWindow?.postMessage(response, '*');
  });

  frame.addEventListener('load', postContext);
  frame.src = config.appUrl;
}
