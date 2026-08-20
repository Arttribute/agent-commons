import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';
import type { BrowserCheckAction } from './code-project.types';

@Injectable()
export class CodeProjectVerifier {
  async verify(url: string, actions: BrowserCheckAction[] = []) {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const requestFailures: string[] = [];
    const actionErrors: string[] = [];
    const embeddingErrors: string[] = [];
    const checks: Array<{
      viewport: string;
      passed: boolean;
      status: number | null;
      embeddable: boolean;
      title: string;
      bodyText: string;
    }> = [];
    let screenshot: Buffer | null = null;

    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROME_PATH;
    const browser = await chromium.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      for (const viewport of [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'mobile', width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('requestfailed', (request) => {
          requestFailures.push(
            `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
          );
        });

        const navigation = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        const status = navigation?.status() ?? null;
        const embeddingError = getEmbeddingError(
          navigation?.headers() ?? {},
        );
        if (embeddingError) embeddingErrors.push(embeddingError);
        await page
          .waitForLoadState('networkidle', { timeout: 15_000 })
          .catch(() => undefined);
        await page.waitForTimeout(500);

        if (viewport.name === 'desktop') {
          for (const action of actions.slice(0, 12)) {
            try {
              await runAction(page, action);
            } catch (error: any) {
              actionErrors.push(error?.message || String(error));
            }
          }
          screenshot = await page.screenshot({ type: 'png', fullPage: true });
        }

        const title = await page.title();
        const bodyText = (
          (await page.locator('body').innerText()) || ''
        ).trim();
        const rootChildren = await page.locator('#root > *').count();
        checks.push({
          viewport: viewport.name,
          passed:
            status !== null &&
            status >= 200 &&
            status < 300 &&
            !embeddingError &&
            bodyText.length > 0 &&
            rootChildren > 0,
          status,
          embeddable: !embeddingError,
          title,
          bodyText: bodyText.slice(0, 2_000),
        });
        await context.close();
      }
    } finally {
      await browser.close();
    }

    const unique = (values: string[]) => [...new Set(values)].slice(0, 30);
    const errors = unique([
      ...pageErrors,
      ...consoleErrors,
      ...actionErrors,
      ...embeddingErrors,
    ]);
    return {
      passed:
        checks.every((check) => check.passed) &&
        errors.length === 0 &&
        requestFailures.length === 0,
      checkedAt: new Date().toISOString(),
      url,
      checks,
      consoleErrors: unique(consoleErrors),
      pageErrors: unique(pageErrors),
      actionErrors: unique(actionErrors),
      embeddingErrors: unique(embeddingErrors),
      requestFailures: unique(requestFailures),
      screenshot,
    };
  }
}

export function getEmbeddingError(headers: Record<string, string>) {
  const frameOptions = headers['x-frame-options']?.trim();
  if (frameOptions) {
    return `Preview cannot be embedded because X-Frame-Options is ${frameOptions}`;
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
  page: import('playwright').Page,
  action: BrowserCheckAction,
) {
  if (action.type === 'click') {
    if (action.selector)
      await page.locator(action.selector).first().click({ timeout: 10_000 });
    else if (action.text)
      await page.getByText(action.text).first().click({ timeout: 10_000 });
    else throw new Error('click requires selector or text');
    return;
  }
  if (action.type === 'fill') {
    await page
      .locator(action.selector)
      .first()
      .fill(action.value, { timeout: 10_000 });
    return;
  }
  if (action.type === 'press') {
    if (action.selector) {
      await page
        .locator(action.selector)
        .first()
        .press(action.key, { timeout: 10_000 });
    } else {
      await page.keyboard.press(action.key);
    }
    return;
  }
  await page
    .getByText(action.text)
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}
