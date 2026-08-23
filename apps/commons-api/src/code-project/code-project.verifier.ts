import {
  Injectable,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { source as axeSource } from 'axe-core';
import { chromium, type Browser } from 'playwright';
import type {
  BrowserCheckAction,
  BrowserCheckCapability,
  BrowserCheckSurface,
} from './code-project.types';
import {
  createVerifierHostHtml,
  normalizeBrowserCheckCapabilities,
  resolveVerifierHostOrigin,
  type VerifierBridgeCall,
} from './code-project.verifier-host';

type VerificationScenario = {
  name: string;
  surface: 'page' | 'widget';
  theme: 'light' | 'dark';
  width: number;
  height: number;
};

const DEFAULT_VERIFICATION_TIMEOUT_MS = 150_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
const DEFAULT_ACTION_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CONCURRENT_VERIFICATIONS = 2;
let activeVerifications = 0;

@Injectable()
export class CodeProjectVerifier {
  async verify(
    url: string,
    actions: BrowserCheckAction[] = [],
    surfaces: BrowserCheckSurface[] = [{ type: 'page' }],
    capabilities: BrowserCheckCapability[] = [],
  ) {
    const release = acquireVerificationSlot();
    const timeoutMs = verifierTimeoutMs();
    let browser: Browser | undefined;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const operation = this.verifyInBrowser(
      url,
      actions,
      surfaces,
      capabilities,
      (launchedBrowser) => {
        browser = launchedBrowser;
        if (timedOut) void launchedBrowser.close().catch(() => undefined);
      },
      timeoutMs,
    ).finally(release);
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        void browser?.close().catch(() => undefined);
        reject(
          new RequestTimeoutException(
            `Browser verification exceeded its ${timeoutMs}ms deadline`,
          ),
        );
      }, timeoutMs);
      timer.unref?.();
    });

    try {
      return await Promise.race([operation, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
      if (timedOut) await browser?.close().catch(() => undefined);
    }
  }

  private async verifyInBrowser(
    url: string,
    actions: BrowserCheckAction[],
    surfaces: BrowserCheckSurface[],
    capabilities: BrowserCheckCapability[],
    registerBrowser: (browser: Browser) => void,
    timeoutMs: number,
  ) {
    const grantedCapabilities = normalizeBrowserCheckCapabilities(capabilities);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const requestFailures: string[] = [];
    const actionErrors: string[] = [];
    const embeddingErrors: string[] = [];
    const qualityErrors: string[] = [];
    const accessibilityViolations: Array<{
      scenario: string;
      id: string;
      impact: string | null;
      description: string;
      nodes: number;
    }> = [];
    const checks: Array<{
      viewport: string;
      surface: 'page' | 'widget';
      theme: 'light' | 'dark';
      width: number;
      height: number;
      passed: boolean;
      status: number | null;
      embeddable: boolean;
      title: string;
      bodyText: string;
      horizontalOverflow: boolean;
      verticalOverflow: boolean;
      fontFamily: string;
      backgroundColor: string;
      stylesheets: number;
      clippedContainers: Array<{
        selector: string;
        horizontal: boolean;
        vertical: boolean;
        scrollWidth: number;
        clientWidth: number;
        scrollHeight: number;
        clientHeight: number;
      }>;
      bridgeCalls: VerifierBridgeCall[];
    }> = [];
    const screenshots: Array<{ name: string; content: Buffer }> = [];

    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROME_PATH;
    const browser = await chromium.launch({
      headless: true,
      executablePath: executablePath || undefined,
      env: sanitizedBrowserEnvironment(),
      timeout: Math.min(timeoutMs, DEFAULT_NAVIGATION_TIMEOUT_MS),
      args: [
        '--disable-dev-shm-usage',
        ...(isLocalPreviewUrl(url)
          ? [
              '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessForNavigations',
            ]
          : []),
      ],
    });
    registerBrowser(browser);
    try {
      let actionsRun = false;
      for (const scenario of verificationScenarios(surfaces)) {
        const context = await browser.newContext({
          viewport: { width: scenario.width, height: scenario.height },
          colorScheme: scenario.theme,
          reducedMotion: 'reduce',
        });
        context.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);
        context.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS);
        const page = await context.newPage();
        page.on('console', (message) => {
          if (message.type() === 'error') {
            consoleErrors.push(`${scenario.name}: ${message.text()}`);
          }
        });
        page.on('pageerror', (error) =>
          pageErrors.push(`${scenario.name}: ${error.message}`),
        );
        page.on('requestfailed', (request) => {
          requestFailures.push(
            `${scenario.name}: ${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
          );
        });

        const statusUrl = scenarioUrl(url, scenario);
        let status: number | null = null;
        let responseHeaders: Record<string, string> = {};
        try {
          const previewResponse = await context.request.get(statusUrl, {
            timeout: DEFAULT_NAVIGATION_TIMEOUT_MS,
            maxRedirects: 0,
          });
          status = previewResponse.status();
          responseHeaders = previewResponse.headers();
          await previewResponse.dispose();
        } catch (error: any) {
          requestFailures.push(
            `${scenario.name}: GET ${statusUrl}: ${error?.message || String(error)}`,
          );
        }
        const embeddingError = getEmbeddingError(responseHeaders);
        if (embeddingError) {
          embeddingErrors.push(`${scenario.name}: ${embeddingError}`);
        }

        const hostOrigin = resolveVerifierHostOrigin(
          responseHeaders,
          statusUrl,
        );
        const appUrl = scenarioUrl(url, scenario, hostOrigin);
        const hostPath = `/__commons_verify__/${encodeURIComponent(scenario.name)}`;

        await context.route('**/*', (route) => {
          const request = route.request();
          if (
            isSyntheticVerifierHostRequest(
              request.url(),
              request.method(),
              request.resourceType(),
              hostOrigin,
              hostPath,
            )
          ) {
            return route.fulfill({
              status: 200,
              contentType: 'text/html; charset=utf-8',
              body: createVerifierHostHtml({
                appUrl,
                scenario,
                capabilities: grantedCapabilities,
              }),
            });
          }
          if (isAllowedPreviewRequest(request.url(), url)) {
            return route.continue();
          }
          return route.abort('blockedbyclient');
        });
        await page.goto(`${hostOrigin}${hostPath}`, {
          waitUntil: 'domcontentloaded',
          timeout: DEFAULT_NAVIGATION_TIMEOUT_MS,
        });
        const frameElement = await page.locator('#commons-app').elementHandle();
        const appFrame = await frameElement?.contentFrame();
        if (!frameElement || !appFrame) {
          throw new Error(
            `${scenario.name}: Commons verification host did not create the app frame`,
          );
        }
        await appFrame
          .waitForLoadState('networkidle', {
            timeout: DEFAULT_ACTION_TIMEOUT_MS,
          })
          .catch(() => undefined);
        await appFrame
          .locator('#root > *')
          .first()
          .waitFor({
            state: 'attached',
            timeout: DEFAULT_ACTION_TIMEOUT_MS,
          })
          .catch(() => undefined);
        await page.waitForTimeout(500);

        if (!actionsRun && actions.length) {
          for (const action of actions.slice(0, 16)) {
            try {
              await runAction(appFrame, action);
            } catch (error: any) {
              actionErrors.push(
                `${scenario.name}: ${error?.message || String(error)}`,
              );
            }
          }
          actionsRun = true;
          await page.waitForTimeout(200);
        }

        const title = await appFrame.title();
        const bodyText = (
          (await appFrame.locator('body').innerText()) || ''
        ).trim();
        const rootChildren = await appFrame.locator('#root > *').count();
        const visual = await inspectVisualSurface(appFrame);
        const bridgeCalls = await readBridgeCalls(page);
        const rejectedBridgeCalls = bridgeCalls.filter(
          (call) => call.outcome !== 'fixture',
        );

        if (visual.horizontalOverflow) {
          qualityErrors.push(
            `${scenario.name}: document overflows horizontally (${visual.scrollWidth}px > ${scenario.width}px)`,
          );
        }
        if (scenario.surface === 'widget' && visual.verticalOverflow) {
          qualityErrors.push(
            `${scenario.name}: widget outer document scrolls vertically (${visual.scrollHeight}px > ${scenario.height}px); keep scrolling inside deliberate content regions`,
          );
        }
        if (scenario.surface === 'widget') {
          for (const clipped of visual.clippedContainers) {
            const dimensions = [
              clipped.horizontal
                ? `horizontally (${clipped.scrollWidth}px > ${clipped.clientWidth}px)`
                : '',
              clipped.vertical
                ? `vertically (${clipped.scrollHeight}px > ${clipped.clientHeight}px)`
                : '',
            ].filter(Boolean);
            qualityErrors.push(
              `${scenario.name}: ${clipped.selector} clips content ${dimensions.join(' and ')}; let the widget reflow or use a deliberate nested overflow-auto region`,
            );
          }
        }
        if (hasDefaultSerifFont(visual.fontFamily)) {
          qualityErrors.push(
            `${scenario.name}: browser-default serif typography detected`,
          );
        }
        if (
          !visual.backgroundColor ||
          visual.backgroundColor === 'rgba(0, 0, 0, 0)' ||
          visual.backgroundColor === 'transparent'
        ) {
          qualityErrors.push(
            `${scenario.name}: document background is transparent or undefined`,
          );
        }
        if (visual.stylesheets < 1) {
          qualityErrors.push(
            `${scenario.name}: no effective stylesheet loaded`,
          );
        }
        for (const call of rejectedBridgeCalls) {
          qualityErrors.push(
            `${scenario.name}: Commons bridge ${call.method} was ${call.outcome}; declare its least-privilege capability and send it to testCodeProject`,
          );
        }

        await appFrame.addScriptTag({ content: axeSource });
        const violations = await appFrame.evaluate(async () => {
          const axe = (globalThis as any).axe;
          const result = await axe.run((globalThis as any).document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
            },
          });
          return result.violations
            .filter((violation: any) =>
              ['serious', 'critical'].includes(violation.impact),
            )
            .map((violation: any) => ({
              id: violation.id,
              impact: violation.impact,
              description: violation.description,
              nodes: violation.nodes.length,
            }));
        });
        for (const violation of violations) {
          accessibilityViolations.push({
            scenario: scenario.name,
            ...violation,
          });
        }

        const scenarioPassed =
          status !== null &&
          status >= 200 &&
          status < 300 &&
          !embeddingError &&
          bodyText.length > 0 &&
          rootChildren > 0 &&
          !visual.horizontalOverflow &&
          (scenario.surface !== 'widget' || !visual.verticalOverflow) &&
          (scenario.surface !== 'widget' ||
            visual.clippedContainers.length === 0) &&
          !hasDefaultSerifFont(visual.fontFamily) &&
          visual.stylesheets > 0 &&
          rejectedBridgeCalls.length === 0 &&
          violations.length === 0;
        checks.push({
          viewport: scenario.name,
          surface: scenario.surface,
          theme: scenario.theme,
          width: scenario.width,
          height: scenario.height,
          passed: scenarioPassed,
          status,
          embeddable: !embeddingError,
          title,
          bodyText: bodyText.slice(0, 2_000),
          horizontalOverflow: visual.horizontalOverflow,
          verticalOverflow: visual.verticalOverflow,
          fontFamily: visual.fontFamily,
          backgroundColor: visual.backgroundColor,
          stylesheets: visual.stylesheets,
          clippedContainers: visual.clippedContainers,
          bridgeCalls,
        });
        screenshots.push({
          name: scenario.name,
          content: await frameElement.screenshot({
            type: 'png',
          }),
        });
        await context.close();
      }
    } finally {
      await browser.close().catch(() => undefined);
    }

    const unique = (values: string[]) => [...new Set(values)].slice(0, 40);
    const accessibilityErrors = accessibilityViolations.map(
      (violation) =>
        `${violation.scenario}: ${violation.impact} accessibility issue ${violation.id} (${violation.nodes} node${violation.nodes === 1 ? '' : 's'})`,
    );
    const errors = unique([
      ...pageErrors,
      ...consoleErrors,
      ...actionErrors,
      ...embeddingErrors,
      ...qualityErrors,
      ...accessibilityErrors,
    ]);
    const verifiedCapabilities = exercisedCapabilities(checks);
    return {
      schemaVersion: 2,
      passed:
        checks.every((check) => check.passed) &&
        errors.length === 0 &&
        requestFailures.length === 0,
      checkedAt: new Date().toISOString(),
      url,
      verifiedSurfaces: normalizeSurfaces(surfaces),
      grantedCapabilities,
      verifiedCapabilities,
      checks,
      consoleErrors: unique(consoleErrors),
      pageErrors: unique(pageErrors),
      actionErrors: unique(actionErrors),
      embeddingErrors: unique(embeddingErrors),
      qualityErrors: unique(qualityErrors),
      accessibilityViolations: accessibilityViolations.slice(0, 40),
      requestFailures: unique(requestFailures),
      screenshots,
    };
  }
}

function verificationScenarios(
  surfaces: BrowserCheckSurface[],
): VerificationScenario[] {
  const normalized = normalizeSurfaces(surfaces);
  const scenarios: VerificationScenario[] = [];
  if (normalized.some((surface) => surface.type === 'page')) {
    scenarios.push(
      {
        name: 'page-desktop-light',
        surface: 'page',
        theme: 'light',
        width: 1440,
        height: 900,
      },
      {
        name: 'page-mobile-light',
        surface: 'page',
        theme: 'light',
        width: 390,
        height: 844,
      },
      {
        name: 'page-desktop-dark',
        surface: 'page',
        theme: 'dark',
        width: 1440,
        height: 900,
      },
    );
  }
  const widget = normalized.find((surface) => surface.type === 'widget');
  if (widget?.type === 'widget') {
    const width = clamp(widget.width, 280, 520, 380);
    const height = clamp(widget.height, 240, 720, 480);
    scenarios.push(
      {
        name: `widget-${width}x${height}-light`,
        surface: 'widget',
        theme: 'light',
        width,
        height,
      },
      {
        name: `widget-${width}x${height}-dark`,
        surface: 'widget',
        theme: 'dark',
        width,
        height,
      },
    );
  }
  return scenarios;
}

function normalizeSurfaces(surfaces: BrowserCheckSurface[]) {
  const requested =
    Array.isArray(surfaces) && surfaces.length
      ? surfaces
      : [{ type: 'page' as const }];
  const seen = new Set<string>();
  return requested.filter((surface) => {
    if (!surface || !['page', 'widget'].includes(surface.type)) return false;
    if (seen.has(surface.type)) return false;
    seen.add(surface.type);
    return true;
  });
}

function scenarioUrl(
  url: string,
  scenario: VerificationScenario,
  hostOrigin?: string,
) {
  const next = new URL(url);
  next.searchParams.set('commonsSurface', scenario.surface);
  next.searchParams.set('commonsTheme', scenario.theme);
  if (hostOrigin) next.searchParams.set('commonsHostOrigin', hostOrigin);
  return next.toString();
}

async function inspectVisualSurface(frame: import('playwright').Frame) {
  return frame.evaluate(() => {
    const doc = (globalThis as any).document;
    const win = globalThis as any;
    const root = doc.getElementById('root');
    const bodyStyle = win.getComputedStyle(doc.body);
    const htmlStyle = win.getComputedStyle(doc.documentElement);
    const scrollWidth = Math.max(
      doc.documentElement.scrollWidth,
      doc.body.scrollWidth,
      root?.scrollWidth ?? 0,
    );
    const scrollHeight = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
      root?.scrollHeight ?? 0,
    );
    const trackedContainers = [
      doc.documentElement,
      doc.body,
      root,
      ...doc.querySelectorAll('.ac-app-shell'),
    ].filter(Boolean);
    const clippedContainers: Array<{
      selector: string;
      horizontal: boolean;
      vertical: boolean;
      scrollWidth: number;
      clientWidth: number;
      scrollHeight: number;
      clientHeight: number;
    }> = [];
    for (const element of trackedContainers as any[]) {
      const style = win.getComputedStyle(element);
      const clipsHorizontal =
        ['hidden', 'clip'].includes(style.overflowX) &&
        element.clientWidth > 0 &&
        element.scrollWidth > element.clientWidth + 2;
      const clipsVertical =
        ['hidden', 'clip'].includes(style.overflowY) &&
        element.clientHeight > 0 &&
        element.scrollHeight > element.clientHeight + 2;
      if (!clipsHorizontal && !clipsVertical) continue;
      clippedContainers.push({
        selector:
          element === doc.documentElement
            ? 'html'
            : element === doc.body
              ? 'body'
              : element === root
                ? '#root'
                : '.ac-app-shell',
        horizontal: clipsHorizontal,
        vertical: clipsVertical,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
      if (clippedContainers.length === 10) break;
    }
    return {
      scrollWidth,
      scrollHeight,
      horizontalOverflow: scrollWidth > win.innerWidth + 2,
      verticalOverflow: scrollHeight > win.innerHeight + 2,
      fontFamily: bodyStyle.fontFamily || htmlStyle.fontFamily || '',
      backgroundColor:
        bodyStyle.backgroundColor || htmlStyle.backgroundColor || '',
      stylesheets: [...doc.styleSheets].filter((sheet: any) => !sheet.disabled)
        .length,
      clippedContainers,
    };
  });
}

async function readBridgeCalls(page: import('playwright').Page) {
  return page.evaluate(() => {
    const calls = (globalThis as any).__commonsVerifier?.rpcCalls;
    if (!Array.isArray(calls)) return [];
    return calls
      .slice(0, 100)
      .filter(
        (call: any) =>
          call &&
          typeof call.method === 'string' &&
          ['fixture', 'denied', 'invalid', 'rate-limited'].includes(
            call.outcome,
          ),
      )
      .map((call: any) => ({
        method: call.method.slice(0, 120),
        outcome: call.outcome,
      })) as VerifierBridgeCall[];
  });
}

function exercisedCapabilities(
  checks: Array<{ bridgeCalls: VerifierBridgeCall[] }>,
) {
  const byMethod: Record<string, string> = {
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
  return [
    ...new Set(
      checks.flatMap((check) =>
        check.bridgeCalls
          .filter((call) => call.outcome === 'fixture')
          .map((call) => byMethod[call.method])
          .filter((capability): capability is string => Boolean(capability)),
      ),
    ),
  ];
}

function clamp(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value as number)));
}

function isLocalPreviewUrl(value: string) {
  try {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(
      new URL(value).hostname,
    );
  } catch {
    return false;
  }
}

function acquireVerificationSlot() {
  const maximum = verifierMaxConcurrency();
  if (activeVerifications >= maximum) {
    throw new ServiceUnavailableException(
      `Browser verification capacity is full (${maximum} concurrent run${maximum === 1 ? '' : 's'}); retry shortly`,
    );
  }
  activeVerifications += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeVerifications = Math.max(0, activeVerifications - 1);
  };
}

function verifierMaxConcurrency() {
  return boundedInteger(
    process.env.CODE_PROJECT_VERIFY_MAX_CONCURRENCY,
    1,
    8,
    DEFAULT_MAX_CONCURRENT_VERIFICATIONS,
  );
}

function verifierTimeoutMs() {
  return boundedInteger(
    process.env.CODE_PROJECT_VERIFY_TIMEOUT_MS,
    30_000,
    300_000,
    DEFAULT_VERIFICATION_TIMEOUT_MS,
  );
}

function boundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

/**
 * Browser code is attacker-influenced. Give Chromium only the process settings
 * it needs to start, never the API's database, OAuth, storage, or signing
 * credentials inherited from process.env.
 */
export function sanitizedBrowserEnvironment() {
  const environment: Record<string, string> = {
    HOME: '/tmp',
    TMPDIR: '/tmp',
  };
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ', 'FONTCONFIG_PATH']) {
    const value = process.env[key];
    if (value) environment[key] = value;
  }
  return environment;
}

export function isAllowedPreviewRequest(value: string, previewRoot: string) {
  try {
    const request = new URL(value);
    const preview = new URL(previewRoot);
    if (!['http:', 'https:'].includes(request.protocol)) return false;
    if (request.username || request.password) return false;
    if (request.origin !== preview.origin) return false;
    return preview.pathname.endsWith('/')
      ? request.pathname.startsWith(preview.pathname)
      : request.pathname === preview.pathname;
  } catch {
    return false;
  }
}

function isSyntheticVerifierHostRequest(
  value: string,
  method: string,
  resourceType: string,
  hostOrigin: string,
  hostPath: string,
) {
  try {
    const request = new URL(value);
    return (
      method === 'GET' &&
      resourceType === 'document' &&
      request.origin === hostOrigin &&
      request.pathname === hostPath &&
      request.search === '' &&
      request.hash === ''
    );
  } catch {
    return false;
  }
}

export function hasDefaultSerifFont(fontFamily: string) {
  const primaryFamily = fontFamily
    .split(',')[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
    .toLocaleLowerCase();
  return ['serif', 'times', 'times new roman'].includes(primaryFamily);
}

export function getEmbeddingError(headers: Record<string, string>) {
  const frameOptions = headers['x-frame-options']?.trim();
  if (frameOptions) {
    return `Preview cannot be embedded because X-Frame-Options is ${frameOptions}`;
  }
  const allowedOrigin = headers['access-control-allow-origin']?.trim();
  if (allowedOrigin !== '*') {
    return 'Preview assets must use Access-Control-Allow-Origin: * so ES modules load inside the opaque sandbox';
  }
  if (headers['access-control-allow-credentials']?.toLowerCase() === 'true') {
    return 'Public preview assets must not allow credentialed cross-origin requests';
  }
  const policy = headers['content-security-policy'] || '';
  const frameAncestors = policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.toLowerCase().startsWith('frame-ancestors'));
  if (!frameAncestors) return null;
  const sources = frameAncestors.split(/\s+/).slice(1);
  if (
    sources.includes("'none'") ||
    (sources.length === 1 && sources[0] === "'self'")
  ) {
    return `Preview cannot be embedded because CSP is ${frameAncestors}`;
  }
  return null;
}

async function runAction(
  frame: import('playwright').Frame,
  action: BrowserCheckAction,
) {
  if (action.type === 'click') {
    if (action.selector)
      await frame.locator(action.selector).first().click({ timeout: 10_000 });
    else if (action.text)
      await frame.getByText(action.text).first().click({ timeout: 10_000 });
    else throw new Error('click requires selector or text');
    return;
  }
  if (action.type === 'fill') {
    await frame
      .locator(action.selector)
      .first()
      .fill(action.value, { timeout: 10_000 });
    return;
  }
  if (action.type === 'press') {
    if (action.selector) {
      await frame
        .locator(action.selector)
        .first()
        .press(action.key, { timeout: 10_000 });
    } else {
      await frame.locator('body').press(action.key, { timeout: 10_000 });
    }
    return;
  }
  await frame
    .getByText(action.text)
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}
