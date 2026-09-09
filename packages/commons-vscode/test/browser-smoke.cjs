/** Run with Playwright installed, or COMMONS_PLAYWRIGHT_PATH pointing at its module. */
const { chromium } = require(process.env.COMMONS_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const path = require('node:path');
(async () => {
  const { build } = require('esbuild');
  await build({
    entryPoints: ['src/view.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: '.test-build/view.cjs',
  });
  const { html } = require(path.resolve('.test-build/view.cjs'));
  const testTheme =
    ':root{--vscode-sideBar-background:#181818;--vscode-editor-background:#202020;--vscode-foreground:#e2e2e2;--vscode-descriptionForeground:#929292;--vscode-widget-border:#333;--vscode-list-hoverBackground:#252525;--vscode-button-background:#e5e5e5;--vscode-button-foreground:#181818;--vscode-button-hoverBackground:#fff;--vscode-focusBorder:#999;--vscode-textCodeBlock-background:#242424;--vscode-font-family:system-ui;--vscode-font-size:13px;}';
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(html('test-nonce', origin, origin + '/sidebar.css', origin + '/sidebar.js'));
    }
    if (req.url === '/favicon.ico') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(
      (req.url.endsWith('.css') ? testTheme : '') +
        (await fs.readFile(path.join('media', req.url.slice(1)), 'utf8'))
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const browser = await chromium.launch({
    executablePath: process.env.COMMONS_BROWSER_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.sent = [];
    window.acquireVsCodeApi = () => ({
      postMessage: (m) => window.sent.push(m),
      getState: () => ({}),
      setState: () => {},
    });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  const state = {
    type: 'state',
    account: { authenticated: false },
    sessions: [],
    folder: 'my-project',
    mode: 'ask',
  };
  const update = async () => {
    await page.evaluate((s) => window.postMessage(s, '*'), state);
    await page.waitForTimeout(100);
  };
  await update();
  assert.equal(await page.locator('#welcome').isVisible(), true);
  await page.screenshot({ path: '/tmp/commons-chat-signin.png' });
  await page.locator('#signin button').click();
  assert.equal((await page.evaluate(() => window.sent.at(-1))).action, 'login');
  state.account = { authenticated: true, name: 'Alex Morgan', email: 'alex@example.com' };
  state.sessions = [
    {
      sessionId: 'one',
      title: 'Improve the search experience',
      createdAt: new Date().toISOString(),
      root: '/work/my-project',
    },
    { sessionId: 'two', title: 'Explore this project', createdAt: new Date().toISOString() },
  ];
  await update();
  await page.screenshot({ path: '/tmp/commons-chat-empty.png' });
  await page.locator('#prompt').fill('Please fix search');
  await page.locator('#prompt').press('Enter');
  assert.deepEqual(await page.evaluate(() => window.sent.at(-1)), {
    type: 'send',
    prompt: 'Please fix search',
  });
  await page.locator('#history-toggle').click();
  await page.locator('#search').fill('Improve');
  assert.equal(await page.locator('#session-list .session-row').count(), 1);
  await page.locator('#local-filter').click();
  assert.equal(await page.locator('#session-list .session-row').count(), 1);
  await page.locator('#session-list .session-open').click();
  assert.equal((await page.evaluate(() => window.sent.at(-1))).id, 'one');
  await page.locator('#home').click();
  state.current = {
    sessionId: 'one',
    title: 'Improve the search experience',
    messages: [
      {
        id: 'u',
        role: 'user',
        content: 'Make the search input faster and easier to use.',
        attachments: ['search.tsx'],
      },
      {
        id: 'a',
        role: 'assistant',
        content:
          'Updated the search experience.\n\n- Added **keyboard navigation** to results.\n- Kept the input focused while results update.\n\nValidation: the search tests pass.',
        timestamp: new Date().toISOString(),
        activities: [
          {
            id: 'tool',
            label: 'read file',
            status: 'done',
            detail: 'src/search.tsx\nRead 84 lines',
          },
        ],
        changes: [
          {
            id: 'change',
            path: '/work/my-project/src/search.tsx',
            added: 18,
            removed: 7,
            preview: '− setQuery(event.target.value)\n+ updateSearch(event.target.value)',
          },
        ],
      },
    ],
  };
  await update();
  await page.screenshot({ path: '/tmp/commons-chat-conversation.png' });
  await page.locator('.change-row summary').click();
  await page.locator('[data-diff]').click();
  assert.equal((await page.evaluate(() => window.sent.at(-1))).type, 'diff');
  await page.locator('.activity-group summary').first().click();
  state.current.messages[1].content += '\n\nReady for review.';
  state.busy = true;
  await update();
  assert.equal(await page.locator('.activity-group').getAttribute('open'), '');
  state.approval = {
    id: 'approve',
    tool: 'write_file',
    message: 'Change src/search.tsx\n− old\n+ new',
  };
  await update();
  await page.locator('#allow').click();
  assert.deepEqual(await page.evaluate(() => window.sent.at(-1)), {
    type: 'approve',
    id: 'approve',
    allow: true,
  });
  state.busy = false;
  state.approval = undefined;
  state.current.messages[1].content =
    '<img src=x onerror="window.pwned=1">\n\n[unsafe](javascript:alert(1))';
  await update();
  assert.equal(await page.locator('.message img').count(), 0);
  assert.equal(await page.locator('.message a').count(), 0);
  await page.locator('#account-toggle').click();
  await page.screenshot({ path: '/tmp/commons-chat-account.png' });
  assert.equal(await page.locator('#account-email').textContent(), 'alex@example.com');
  for (const width of [280, 390, 700]) {
    await page.setViewportSize({ width, height: 820 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true
    );
  }
  await page.locator('#home').click();
  for (const width of [280, 390, 700]) {
    await page.setViewportSize({ width, height: 820 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true
    );
  }
  await page.setViewportSize({ width: 390, height: 820 });
  await page.evaluate(() => {
    const theme = {
      '--vscode-sideBar-background': '#fafafa',
      '--vscode-editor-background': '#ffffff',
      '--vscode-foreground': '#262626',
      '--vscode-descriptionForeground': '#757575',
      '--vscode-widget-border': '#dedede',
      '--vscode-list-hoverBackground': '#f0f0f0',
      '--vscode-button-background': '#333333',
      '--vscode-button-foreground': '#ffffff',
    };
    for (const [key, value] of Object.entries(theme))
      document.documentElement.style.setProperty(key, value);
  });
  state.current.messages[1].content =
    'Review [search.tsx](src/search.tsx:12) for the updated behavior.';
  await update();
  await page.locator('.file-link').click();
  assert.deepEqual(await page.evaluate(() => window.sent.at(-1)), {
    type: 'openFile',
    path: 'src/search.tsx:12',
  });
  await page.screenshot({ path: '/tmp/commons-chat-light.png' });
  assert.deepEqual(errors, []);
  await browser.close();
  server.close();
  console.log(
    'PASS: browser sign-in, composer, history, account, disclosures, approvals, diff actions, output escaping, and responsive layout'
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
