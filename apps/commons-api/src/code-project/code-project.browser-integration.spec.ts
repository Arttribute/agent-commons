import { once } from 'node:events';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CodeProjectBuilder } from './code-project.builder';
import {
  PublicCodeProjectController,
  PublicUiPluginHostController,
} from './code-project.controller';
import type { BuiltAsset } from './code-project.types';
import { CodeProjectVerifier } from './code-project.verifier';
import { chromium, type Browser } from 'playwright';

const describeBrowser =
  process.env.RUN_BROWSER_INTEGRATION === '1' ? describe : describe.skip;

describeBrowser('generated Commons app browser integration', () => {
  jest.setTimeout(180_000);

  it('builds and verifies native page and widget surfaces in the opaque Commons host', async () => {
    const builder = new CodeProjectBuilder();
    const verifier = new CodeProjectVerifier();
    const build = await builder.build({
      name: 'Commons team pulse',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Users } from 'lucide-react';
import { AppShell, Badge, Card, PageHeader, commons, useCommonsContext } from '@agent-commons/ui';

function App() {
  const { surface } = useCommonsContext();
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    commons.agents.list({ limit: 2 })
      .then((response) => {
        if (mounted) setAgents(response.items || []);
      })
      .catch((reason) => {
        if (mounted) setError(reason instanceof Error ? reason.message : 'Could not load agents');
      });
    return () => { mounted = false; };
  }, []);

  return (
    <AppShell className="h-full overflow-hidden">
      <PageHeader
        eyebrow="Agent Commons"
        title="Team pulse"
        description={surface === 'page' ? 'A native, responsive view of agents available in this workspace.' : undefined}
        actions={<Badge>Live fixture</Badge>}
      />
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users aria-hidden="true" className="h-4 w-4" />
          <h2 className="m-0 text-sm font-semibold">Available agents</h2>
        </div>
        {error ? <p role="alert" className="m-0 text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-2" aria-live="polite">
          {agents.length === 0 && !error ? <p className="m-0 text-sm text-muted-foreground">Loading agents…</p> : null}
          {agents.map((agent) => (
            <article key={agent.agentId} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card p-3">
              <div className="min-w-0">
                <h3 className="m-0 truncate text-sm font-semibold">{agent.name}</h3>
                <p className="m-0 truncate text-xs text-muted-foreground">{agent.description}</p>
              </div>
              <Badge>{agent.status}</Badge>
            </article>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}

createRoot(document.getElementById('root')).render(<App />);`,
        },
      ],
    });

    const previousFrameAncestors = process.env.PLUGIN_FRAME_ANCESTORS;
    process.env.PLUGIN_FRAME_ANCESTORS = 'http://127.0.0.1:41737';
    let preview:
      | Awaited<ReturnType<typeof startProductionPreviewServer>>
      | undefined;

    try {
      preview = await startProductionPreviewServer(build.assets);
      const previewResponse = await fetch(preview.url);
      expect(previewResponse.status).toBe(200);
      expect(previewResponse.headers.get('access-control-allow-origin')).toBe(
        '*',
      );
      expect(previewResponse.headers.get('x-frame-options')).toBeNull();
      const productionCsp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        "connect-src 'none'",
        "frame-src 'none'",
        "frame-ancestors 'self' http://127.0.0.1:41737",
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ].join('; ');
      expect(preview.productionPolicies).toContain(productionCsp);
      expect(previewResponse.headers.get('content-security-policy')).toBe(
        productionCsp,
      );
      expect(await previewResponse.text()).toContain(
        'name="agent-commons-runtime" content="2"',
      );

      const result = await verifier.verify(
        preview.url,
        [],
        [{ type: 'page' }, { type: 'widget', width: 380, height: 480 }],
        ['agents.read', 'tasks.read'],
      );

      expect({
        passed: result.passed,
        consoleErrors: result.consoleErrors,
        pageErrors: result.pageErrors,
        actionErrors: result.actionErrors,
        embeddingErrors: result.embeddingErrors,
        qualityErrors: result.qualityErrors,
        accessibilityViolations: result.accessibilityViolations,
        requestFailures: result.requestFailures,
        checks: result.checks.map((check) => ({
          viewport: check.viewport,
          passed: check.passed,
          bodyText: check.bodyText,
          stylesheets: check.stylesheets,
          bridgeCalls: check.bridgeCalls,
        })),
      }).toEqual({
        passed: true,
        consoleErrors: [],
        pageErrors: [],
        actionErrors: [],
        embeddingErrors: [],
        qualityErrors: [],
        accessibilityViolations: [],
        requestFailures: [],
        checks: expect.arrayContaining([
          expect.objectContaining({ passed: true }),
        ]),
      });
      expect(result.verifiedSurfaces).toEqual([
        { type: 'page' },
        { type: 'widget', width: 380, height: 480 },
      ]);
      expect(result.grantedCapabilities).toEqual(['agents.read', 'tasks.read']);
      expect(result.verifiedCapabilities).toEqual(['agents.read']);
      expect(result.checks).toHaveLength(5);
      expect(
        result.checks.map(({ surface, theme, width, height }) => ({
          surface,
          theme,
          width,
          height,
        })),
      ).toEqual([
        { surface: 'page', theme: 'light', width: 1440, height: 900 },
        { surface: 'page', theme: 'light', width: 390, height: 844 },
        { surface: 'page', theme: 'dark', width: 1440, height: 900 },
        { surface: 'widget', theme: 'light', width: 380, height: 480 },
        { surface: 'widget', theme: 'dark', width: 380, height: 480 },
      ]);
      expect(result.checks.every((check) => check.passed)).toBe(true);
      expect(
        result.checks.every(
          (check) =>
            check.bridgeCalls.length === 1 &&
            check.bridgeCalls[0]?.method === 'agents.list' &&
            check.bridgeCalls[0]?.outcome === 'fixture',
        ),
      ).toBe(true);
      expect(
        result.checks.every(
          (check) =>
            !check.horizontalOverflow &&
            !check.verticalOverflow &&
            check.clippedContainers.length === 0 &&
            check.stylesheets > 0 &&
            !/^(?:serif|times(?: new roman)?)$/i.test(check.fontFamily) &&
            !['', 'transparent', 'rgba(0, 0, 0, 0)'].includes(
              check.backgroundColor,
            ),
        ),
      ).toBe(true);
      expect(
        result.checks.find(
          (check) => check.surface === 'widget' && check.theme === 'light',
        )?.backgroundColor,
      ).not.toBe(
        result.checks.find(
          (check) => check.surface === 'widget' && check.theme === 'dark',
        )?.backgroundColor,
      );
      expect(result.consoleErrors).toEqual([]);
      expect(result.pageErrors).toEqual([]);
      expect(result.actionErrors).toEqual([]);
      expect(result.embeddingErrors).toEqual([]);
      expect(result.qualityErrors).toEqual([]);
      expect(result.accessibilityViolations).toEqual([]);
      expect(result.requestFailures).toEqual([]);
      expect(result.screenshots).toHaveLength(5);
      expect(
        result.screenshots.every((screenshot) => screenshot.content.length > 0),
      ).toBe(true);
    } finally {
      if (previousFrameAncestors === undefined) {
        delete process.env.PLUGIN_FRAME_ANCESTORS;
      } else {
        process.env.PLUGIN_FRAME_ANCESTORS = previousFrameAncestors;
      }
      await preview?.close();
    }
  });

  it('rejects a bundled CSS orientation lock without loosening the opaque-frame CSP', async () => {
    const builder = new CodeProjectBuilder();
    const verifier = new CodeProjectVerifier();
    const build = await builder.build({
      name: 'Orientation lock fixture',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, Card } from '@agent-commons/ui';
import './orientation.css';
function App() { return <AppShell><Card className="orientation-lock p-4"><h1 className="m-0 text-lg font-semibold">Orientation check</h1><p className="text-sm">This app must work in either orientation.</p></Card></AppShell>; }
createRoot(document.getElementById('root')).render(<App />);`,
        },
        {
          path: 'src/orientation.css',
          content:
            '@media (orientation: landscape) { .orientation-lock { transform: rotate(90deg); } }',
        },
      ],
    });

    const previousFrameAncestors = process.env.PLUGIN_FRAME_ANCESTORS;
    process.env.PLUGIN_FRAME_ANCESTORS = 'http://127.0.0.1:41737';
    let preview:
      | Awaited<ReturnType<typeof startProductionPreviewServer>>
      | undefined;

    try {
      preview = await startProductionPreviewServer(build.assets);
      const result = await verifier.verify(
        preview.url,
        [],
        [{ type: 'widget', width: 380, height: 480 }],
      );

      expect(result.passed).toBe(false);
      expect(result.consoleErrors).toEqual([]);
      expect(result.requestFailures).toEqual([]);
      expect(result.accessibilityViolations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'css-orientation-lock',
            impact: 'serious',
            nodes: 1,
          }),
        ]),
      );
      expect(result.checks.every((check) => !check.passed)).toBe(true);
    } finally {
      if (previousFrameAncestors === undefined) {
        delete process.env.PLUGIN_FRAME_ANCESTORS;
      } else {
        process.env.PLUGIN_FRAME_ANCESTORS = previousFrameAncestors;
      }
      await preview?.close();
    }
  });

  it('rejects root content clipped by the fixed widget viewport', async () => {
    const builder = new CodeProjectBuilder();
    const verifier = new CodeProjectVerifier();
    const build = await builder.build({
      name: 'Overflowing widget fixture',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, Card } from '@agent-commons/ui';
function App() { return <AppShell><Card style={{ height: '900px' }}><h1>Clipped widget</h1><p>This content cannot fit the requested widget height.</p></Card></AppShell>; }
createRoot(document.getElementById('root')).render(<App />);`,
        },
      ],
    });

    const previousFrameAncestors = process.env.PLUGIN_FRAME_ANCESTORS;
    process.env.PLUGIN_FRAME_ANCESTORS = 'http://127.0.0.1:41737';
    let preview:
      | Awaited<ReturnType<typeof startProductionPreviewServer>>
      | undefined;

    try {
      preview = await startProductionPreviewServer(build.assets);
      const result = await verifier.verify(
        preview.url,
        [],
        [{ type: 'widget', width: 380, height: 240 }],
      );

      expect(result.passed).toBe(false);
      expect(result.checks).toHaveLength(2);
      expect(
        result.checks.every(
          (check) =>
            check.surface === 'widget' &&
            !check.verticalOverflow &&
            check.clippedContainers.some(
              (container) =>
                container.selector === '.ac-app-shell' && container.vertical,
            ) &&
            !check.passed,
        ),
      ).toBe(true);
      expect(result.qualityErrors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /\.ac-app-shell clips content vertically \(\d+px > \d+px\)/,
          ),
        ]),
      );
    } finally {
      if (previousFrameAncestors === undefined) {
        delete process.env.PLUGIN_FRAME_ANCESTORS;
      } else {
        process.env.PLUGIN_FRAME_ANCESTORS = previousFrameAncestors;
      }
      await preview?.close();
    }
  });

  it('allows a deliberate nested widget scroll region', async () => {
    const builder = new CodeProjectBuilder();
    const verifier = new CodeProjectVerifier();
    const build = await builder.build({
      name: 'Scrollable widget fixture',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, Card } from '@agent-commons/ui';
function App() { return <AppShell><section className="h-full overflow-auto" aria-label="Activity feed" tabIndex={0}><Card style={{ height: '900px' }}><h1>Scrollable activity</h1><p>The user can intentionally scroll this nested feed.</p></Card></section></AppShell>; }
createRoot(document.getElementById('root')).render(<App />);`,
        },
      ],
    });

    const previousFrameAncestors = process.env.PLUGIN_FRAME_ANCESTORS;
    process.env.PLUGIN_FRAME_ANCESTORS = 'http://127.0.0.1:41737';
    let preview:
      | Awaited<ReturnType<typeof startProductionPreviewServer>>
      | undefined;

    try {
      preview = await startProductionPreviewServer(build.assets);
      const result = await verifier.verify(
        preview.url,
        [],
        [{ type: 'widget', width: 380, height: 240 }],
      );

      expect({
        passed: result.passed,
        qualityErrors: result.qualityErrors,
        accessibilityViolations: result.accessibilityViolations,
        checks: result.checks.map((check) => ({
          viewport: check.viewport,
          passed: check.passed,
          verticalOverflow: check.verticalOverflow,
          clippedContainers: check.clippedContainers,
        })),
      }).toEqual({
        passed: true,
        qualityErrors: [],
        accessibilityViolations: [],
        checks: expect.arrayContaining([
          expect.objectContaining({ passed: true }),
        ]),
      });
      expect(
        result.checks.every(
          (check) =>
            check.surface === 'widget' &&
            !check.verticalOverflow &&
            check.clippedContainers.length === 0 &&
            check.passed,
        ),
      ).toBe(true);
    } finally {
      if (previousFrameAncestors === undefined) {
        delete process.env.PLUGIN_FRAME_ANCESTORS;
      } else {
        process.env.PLUGIN_FRAME_ANCESTORS = previousFrameAncestors;
      }
      await preview?.close();
    }
  });

  it('relays only exact parent and opaque-child messages for pinned v1 and v2 manifests', async () => {
    const builder = new CodeProjectBuilder();
    const runtimeV2 = await builder.build({
      name: 'Pinned relay app',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, Badge, Card, commons, useCommonsContext } from '@agent-commons/ui';

function App() {
  const context = useCommonsContext();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    commons.agents.list({ limit: 1 }).then((response) => setAgents(response.items || []));
  }, []);

  return (
    <AppShell className="h-full overflow-hidden p-4">
      <Card className="grid gap-3 p-4">
        <Badge>Manifest v2</Badge>
        <h1 className="m-0 text-lg font-semibold">Pinned relay app</h1>
        <p className="m-0 text-sm text-muted-foreground" data-testid="plugin-id">{context.pluginId || 'Waiting for Commons'}</p>
        <p className="m-0 text-sm" data-testid="agent-name">{agents[0]?.name || 'Loading agent'}</p>
      </Card>
    </AppShell>
  );
}

createRoot(document.getElementById('root')).render(<App />);`,
        },
      ],
    });
    const legacyV1 = legacyManifestV1Assets();
    const previews = [
      {
        schemaVersion: '2' as const,
        slug: 'relay-runtime-v2',
        deploymentId: '123e4567-e89b-12d3-a456-426614174002',
        assets: runtimeV2.assets,
      },
      {
        schemaVersion: '1' as const,
        slug: 'relay-legacy-v1',
        deploymentId: '123e4567-e89b-12d3-a456-426614174001',
        assets: legacyV1,
      },
    ];

    const previousFrameAncestors = process.env.PLUGIN_FRAME_ANCESTORS;
    let relay:
      | Awaited<ReturnType<typeof startPublicPluginRelayServer>>
      | undefined;
    let commons:
      | Awaited<ReturnType<typeof startCommonsRelayHarness>>
      | undefined;
    let browser: Browser | undefined;

    try {
      relay = await startPublicPluginRelayServer(previews);
      commons = await startCommonsRelayHarness({
        pluginOrigin: relay.origin,
        entries: relay.entries,
      });
      process.env.PLUGIN_FRAME_ANCESTORS = commons.origin;

      const hostUrl = publicPluginHostUrl({
        pluginOrigin: relay.origin,
        entryUrl: relay.entries['2'],
        parentOrigin: commons.origin,
        schemaVersion: '2',
      });
      const hostResponse = await fetch(hostUrl);
      expect(hostResponse.status).toBe(200);
      expect(hostResponse.headers.get('access-control-allow-origin')).toBe('*');
      expect(hostResponse.headers.get('x-frame-options')).toBeNull();
      expect(hostResponse.headers.get('content-security-policy')).toBe(
        [
          "default-src 'none'",
          "script-src 'unsafe-inline'",
          "style-src 'unsafe-inline'",
          `frame-src ${relay.origin}`,
          `frame-ancestors ${commons.origin}`,
          "connect-src 'none'",
          "img-src 'none'",
          "font-src 'none'",
          "form-action 'none'",
          "base-uri 'none'",
          "object-src 'none'",
        ].join('; '),
      );
      expect(await hostResponse.text()).toContain('sandbox="allow-scripts"');

      browser = await launchIntegrationBrowser();
      const context = await browser.newContext({
        viewport: { width: 900, height: 700 },
        colorScheme: 'light',
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const requestFailures: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) =>
        requestFailures.push(
          `${request.method()} ${request.url()}: ${request.failure()?.errorText || 'failed'}`,
        ),
      );
      await page.goto(commons.url, { waitUntil: 'domcontentloaded' });

      for (const schemaVersion of ['2', '1'] as const) {
        await page.evaluate(
          (version) => (globalThis as any).__loadManifest(version),
          schemaVersion,
        );
        const outer = page.frameLocator('#plugin');
        const generated = outer.frameLocator('#app');
        await generated
          .locator('[data-testid="plugin-id"]')
          .waitFor({ state: 'visible', timeout: 15_000 });
        expect(
          await generated.locator('[data-testid="plugin-id"]').innerText(),
        ).toBe(`trusted-v${schemaVersion}`);
        expect(await outer.locator('#app').getAttribute('sandbox')).toBe(
          'allow-scripts',
        );
        expect(
          await generated
            .locator('body')
            .evaluate(() => (globalThis as any).origin),
        ).toBe('null');

        if (schemaVersion === '2') {
          await generated
            .locator('[data-testid="agent-name"]')
            .getByText('Trusted relay agent')
            .waitFor({ state: 'visible', timeout: 15_000 });
        } else {
          await page.waitForFunction(() =>
            (globalThis as any).__relay.accepted.some(
              (message: any) =>
                message.data?.type === 'commons:navigate' &&
                message.data?.path === '/studio/agents',
            ),
          );
        }

        const accepted = await page.evaluate(
          () => (globalThis as any).__relay.accepted,
        );
        expect(accepted.length).toBeGreaterThan(0);
        expect(
          accepted.every(
            (message: any) =>
              message.fromPlugin === true && message.origin === relay?.origin,
          ),
        ).toBe(true);
        expect(
          accepted.some(
            (message: any) => message.data?.type === 'commons:ready',
          ),
        ).toBe(true);
        if (schemaVersion === '2') {
          expect(
            accepted.some(
              (message: any) => message.data?.method === 'agents.list',
            ),
          ).toBe(true);
        }

        await page.evaluate((version) => {
          (globalThis as any).__sendRelaySpoofs(version);
        }, schemaVersion);
        await page.waitForFunction(
          () => (globalThis as any).__relay.attackAcks.length === 2,
        );
        await page.waitForTimeout(150);

        expect(
          await generated.locator('[data-testid="plugin-id"]').innerText(),
        ).toBe(`trusted-v${schemaVersion}`);
        const afterSpoof = await page.evaluate(
          () => (globalThis as any).__relay,
        );
        expect([...afterSpoof.attackAcks].sort()).toEqual(
          [
            'expected-parent-origin-wrong-source',
            'opaque-child-origin-wrong-source',
          ].sort(),
        );
        expect(
          afterSpoof.accepted.some(
            (message: any) =>
              message.data?.marker === 'forged-parent-context' ||
              message.data?.marker === 'forged-opaque-child',
          ),
        ).toBe(false);
      }

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(requestFailures).toEqual([]);
      await context.close();
    } finally {
      try {
        await browser?.close();
      } finally {
        await Promise.allSettled([commons?.close(), relay?.close()]);
        if (previousFrameAncestors === undefined) {
          delete process.env.PLUGIN_FRAME_ANCESTORS;
        } else {
          process.env.PLUGIN_FRAME_ANCESTORS = previousFrameAncestors;
        }
      }
    }
  });
});

async function startProductionPreviewServer(assets: BuiltAsset[]) {
  const slug = 'native-verifier';
  const deploymentId = '123e4567-e89b-12d3-a456-426614174000';
  const rootPath = `/v1/previews/${slug}/deployments/${deploymentId}/`;
  const byPath = new Map(assets.map((asset) => [asset.path, asset]));
  const productionPolicies: string[] = [];
  const controller = new PublicCodeProjectController({
    publicAsset: async (
      requestedSlug: string,
      requestedPath: string | undefined,
      requestedDeploymentId: string | undefined,
    ) => {
      if (requestedSlug !== slug || requestedDeploymentId !== deploymentId) {
        throw new Error('Unexpected preview deployment request');
      }
      const asset = byPath.get(requestedPath || 'index.html');
      if (!asset) throw new Error(`Unknown built asset: ${requestedPath}`);
      return {
        bytes:
          typeof asset.content === 'string'
            ? Buffer.from(asset.content)
            : Buffer.from(asset.content),
        contentType: asset.contentType,
        cacheControl: asset.cacheControl,
      };
    },
  } as any);

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url || '/',
      `http://${request.headers.host || '127.0.0.1'}`,
    );
    if (!requestUrl.pathname.startsWith(rootPath)) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }

    const path = decodeURIComponent(requestUrl.pathname.slice(rootPath.length));
    const adapter = responseAdapter(
      response,
      requestUrl.origin,
      (policy) => productionPolicies.push(policy),
      false,
    );
    const controllerRequest = {
      originalUrl: `${requestUrl.pathname}${requestUrl.search}`,
    } as any;
    try {
      if (!path) {
        await controller.deploymentIndex(
          slug,
          deploymentId,
          controllerRequest,
          adapter as any,
        );
      } else {
        await controller.deploymentAsset(
          slug,
          deploymentId,
          path,
          controllerRequest,
          adapter as any,
        );
      }
    } catch (error: any) {
      if (!response.headersSent) response.statusCode = 500;
      response.end(error?.message || String(error));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}${rootPath}`,
    origin: `http://127.0.0.1:${address.port}`,
    productionPolicies,
    close: () => closeServer(server),
  };
}

function legacyManifestV1Assets(): BuiltAsset[] {
  return [
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Legacy pinned relay app</title>
    <style>
      :root { color-scheme: light dark; font-family: Arial, sans-serif; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body { display: grid; place-items: center; padding: 1rem; background: Canvas; color: CanvasText; }
      main { width: min(100%, 28rem); padding: 1rem; border: 1px solid GrayText; border-radius: .75rem; }
      h1, p { margin: 0; }
      p { margin-top: .75rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Manifest v1 compatibility</h1>
      <p data-testid="plugin-id">Waiting for Commons</p>
    </main>
    <script>
      (() => {
        const hostOrigin = new URLSearchParams(location.search).get('commonsHostOrigin');
        let navigated = false;
        addEventListener('message', (event) => {
          if (event.source !== parent || event.origin !== hostOrigin) return;
          if (event.data?.type !== 'commons:context') return;
          document.querySelector('[data-testid="plugin-id"]').textContent = event.data.pluginId;
          if (!navigated) {
            navigated = true;
            parent.postMessage({ type: 'commons:navigate', path: '/studio/agents' }, hostOrigin);
          }
        });
        parent.postMessage({ type: 'commons:ready' }, hostOrigin);
      })();
    </script>
  </body>
</html>`,
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'no-cache, no-store, must-revalidate',
    },
  ];
}

async function startPublicPluginRelayServer(
  previews: Array<{
    schemaVersion: '1' | '2';
    slug: string;
    deploymentId: string;
    assets: BuiltAsset[];
  }>,
) {
  const byDeployment = new Map(
    previews.map((preview) => [
      `${preview.slug}:${preview.deploymentId}`,
      new Map(preview.assets.map((asset) => [asset.path, asset])),
    ]),
  );
  const previewController = new PublicCodeProjectController({
    publicAsset: async (
      slug: string,
      path: string | undefined,
      deploymentId: string | undefined,
    ) => {
      const assets = byDeployment.get(`${slug}:${deploymentId}`);
      const asset = assets?.get(path || 'index.html');
      if (!asset) {
        throw new Error(`Unknown pinned preview asset: ${slug}/${path || ''}`);
      }
      return {
        bytes:
          typeof asset.content === 'string'
            ? Buffer.from(asset.content)
            : Buffer.from(asset.content),
        contentType: asset.contentType,
        cacheControl: asset.cacheControl,
      };
    },
  } as any);
  const hostController = new PublicUiPluginHostController();

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url || '/',
      `http://${request.headers.host || '127.0.0.1'}`,
    );
    try {
      if (requestUrl.pathname === '/v1/ui-plugin-host') {
        await hostController.host(
          { query: Object.fromEntries(requestUrl.searchParams) } as any,
          responseAdapter(
            response,
            requestUrl.origin,
            () => undefined,
            false,
          ) as any,
        );
        return;
      }

      const match = requestUrl.pathname.match(
        /^\/v1\/previews\/([^/]+)\/deployments\/([0-9a-f-]+)\/(.*)$/i,
      );
      if (!match) {
        response.statusCode = 404;
        response.end('Not found');
        return;
      }
      const [, slug, deploymentId, rawPath] = match;
      const adapter = responseAdapter(
        response,
        requestUrl.origin,
        () => undefined,
        true,
      );
      const controllerRequest = {
        originalUrl: `${requestUrl.pathname}${requestUrl.search}`,
      } as any;
      if (!rawPath) {
        await previewController.deploymentIndex(
          slug,
          deploymentId,
          controllerRequest,
          adapter as any,
        );
      } else {
        await previewController.deploymentAsset(
          slug,
          deploymentId,
          decodeURIComponent(rawPath),
          controllerRequest,
          adapter as any,
        );
      }
    } catch (error: any) {
      if (!response.headersSent) response.statusCode = 500;
      response.end(error?.message || String(error));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  const entries = Object.fromEntries(
    previews.map((preview) => [
      preview.schemaVersion,
      `${origin}/v1/previews/${preview.slug}/deployments/${preview.deploymentId}/`,
    ]),
  ) as Record<'1' | '2', string>;

  return {
    origin,
    entries,
    close: () => closeServer(server),
  };
}

async function startCommonsRelayHarness(args: {
  pluginOrigin: string;
  entries: Record<'1' | '2', string>;
}) {
  const config = JSON.stringify(args).replace(/</g, '\\u003c');
  const attacker = `<!doctype html><meta charset="utf-8" /><script>
    addEventListener('message', (event) => {
      const target = parent.frames['plugin'];
      target.postMessage(event.data.payload, '*');
      parent.postMessage({ type: 'attacker:sent', label: event.data.label }, '*');
    });
  </script>`;
  const harness = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Commons plugin relay integration host</title>
    <style>
      html, body, #plugin { width: 100%; height: 100%; margin: 0; border: 0; }
      .attacker { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    </style>
  </head>
  <body>
    <iframe id="plugin" name="plugin" title="Plugin under test" sandbox="allow-scripts allow-same-origin"></iframe>
    <iframe id="parent-attacker" class="attacker" title="Parent source attacker" src="/attacker"></iframe>
    <iframe id="opaque-attacker" class="attacker" title="Opaque source attacker" sandbox="allow-scripts" src="/attacker"></iframe>
    <script>
      (() => {
        const config = ${config};
        const plugin = document.getElementById('plugin');
        const parentAttacker = document.getElementById('parent-attacker');
        const opaqueAttacker = document.getElementById('opaque-attacker');
        let schemaVersion = '2';
        window.__pluginOrigin = config.pluginOrigin;
        window.__relay = { accepted: [], all: [], attackAcks: [] };

        addEventListener('message', (event) => {
          const data = event.data;
          const fromPlugin = event.source === plugin.contentWindow;
          window.__relay.all.push({ origin: event.origin, fromPlugin, data });
          if (data?.type === 'attacker:sent') {
            window.__relay.attackAcks.push(data.label);
            return;
          }
          if (!fromPlugin || event.origin !== config.pluginOrigin) return;
          window.__relay.accepted.push({ origin: event.origin, fromPlugin, data });

          if (data?.type === 'commons:ready') {
            plugin.contentWindow.postMessage({
              type: 'commons:context',
              pluginId: 'trusted-v' + schemaVersion,
              surface: 'widget',
              theme: schemaVersion === '2' ? 'dark' : 'light',
              viewport: { width: 380, height: 480 },
              capabilities: schemaVersion === '2' ? ['agents.read'] : [],
            }, config.pluginOrigin);
            return;
          }
          if (data?.jsonrpc === '2.0' && data.method === 'agents.list') {
            plugin.contentWindow.postMessage({
              jsonrpc: '2.0',
              id: data.id,
              result: {
                items: [{
                  agentId: 'trusted-relay-agent',
                  name: 'Trusted relay agent',
                  description: 'Returned through the exact public host relay.',
                  status: 'online',
                }],
                total: 1,
              },
            }, config.pluginOrigin);
          }
        });

        window.__loadManifest = (version) => {
          schemaVersion = version;
          window.__relay = { accepted: [], all: [], attackAcks: [] };
          const url = new URL('/v1/ui-plugin-host', config.pluginOrigin);
          url.searchParams.set('entry', config.entries[version]);
          url.searchParams.set('commonsSurface', 'widget');
          url.searchParams.set('commonsHostOrigin', location.origin);
          url.searchParams.set('commonsTheme', version === '2' ? 'dark' : 'light');
          plugin.src = url.toString();
        };

        window.__sendRelaySpoofs = (version) => {
          parentAttacker.contentWindow.postMessage({
            label: 'expected-parent-origin-wrong-source',
            payload: {
              type: 'commons:context',
              pluginId: 'spoofed-v' + version,
              marker: 'forged-parent-context',
            },
          }, location.origin);
          opaqueAttacker.contentWindow.postMessage({
            label: 'opaque-child-origin-wrong-source',
            payload: {
              type: 'forged-child-message',
              marker: 'forged-opaque-child',
            },
          }, '*');
        };
      })();
    </script>
  </body>
</html>`;
  const server = createServer((request, response) => {
    const requestUrl = new URL(
      request.url || '/',
      `http://${request.headers.host || '127.0.0.1'}`,
    );
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.statusCode = 200;
    response.end(requestUrl.pathname === '/attacker' ? attacker : harness);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    url: `${origin}/`,
    close: () => closeServer(server),
  };
}

function publicPluginHostUrl(args: {
  pluginOrigin: string;
  entryUrl: string;
  parentOrigin: string;
  schemaVersion: '1' | '2';
}) {
  const url = new URL('/v1/ui-plugin-host', args.pluginOrigin);
  url.searchParams.set('entry', args.entryUrl);
  url.searchParams.set('commonsSurface', 'widget');
  url.searchParams.set('commonsHostOrigin', args.parentOrigin);
  url.searchParams.set(
    'commonsTheme',
    args.schemaVersion === '2' ? 'dark' : 'light',
  );
  return url;
}

async function launchIntegrationBrowser() {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_PATH;
  return chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: [
      '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessForNavigations',
    ],
  });
}

function responseAdapter(
  response: ServerResponse,
  localAssetOrigin: string,
  onProductionCsp: (policy: string) => void,
  allowOpaqueLoopbackAssets = true,
) {
  const adapter = {
    removeHeader(name: string) {
      response.removeHeader(name);
      return adapter;
    },
    setHeader(name: string, value: string) {
      if (name.toLocaleLowerCase() === 'content-security-policy') {
        onProductionCsp(value);
      }
      if (
        allowOpaqueLoopbackAssets &&
        name.toLocaleLowerCase() === 'content-security-policy'
      ) {
        // A sandboxed document has an opaque origin. Chromium consequently
        // classifies its temporary loopback stylesheet fetch as connect-src.
        // Production stays `connect-src 'none'`; this opt-in local harness
        // permits only its ephemeral asset origin and asserts the unmodified
        // production policy above before running the browser.
        response.setHeader(
          name,
          value.replace(
            "connect-src 'none'",
            `connect-src ${localAssetOrigin}`,
          ),
        );
      } else {
        response.setHeader(name, value);
      }
      return adapter;
    },
    type(contentType: string) {
      response.setHeader('Content-Type', contentType);
      return adapter;
    },
    status(code: number) {
      response.statusCode = code;
      return adapter;
    },
    send(body: string | Buffer | Uint8Array) {
      response.end(body);
      return adapter;
    },
    redirect(code: number, location: string) {
      response.statusCode = code;
      response.setHeader('Location', location);
      response.end();
      return adapter;
    },
  };
  return adapter;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}
