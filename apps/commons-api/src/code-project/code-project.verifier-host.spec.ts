import type { BrowserCheckCapability } from './code-project.types';
import {
  BROWSER_CHECK_CAPABILITIES,
  createVerifierHostHtml,
  normalizeBrowserCheckCapabilities,
  resolveVerifierHostOrigin,
  VERIFIER_FIXTURES,
  VERIFIER_HOST_ORIGIN,
} from './code-project.verifier-host';

describe('CodeProject verifier Commons host', () => {
  it('defaults to no capabilities and normalizes only explicit supported grants', () => {
    expect(normalizeBrowserCheckCapabilities(undefined)).toEqual([]);
    expect(
      normalizeBrowserCheckCapabilities([
        'tasks.read',
        { name: 'agents.read', resourceIds: ['agent-a'] },
        'tasks.read',
        'not-supported' as BrowserCheckCapability,
      ]),
    ).toEqual(['tasks.read', 'agents.read']);
    expect(BROWSER_CHECK_CAPABILITIES).toContain('copilot.prompt');
  });

  it('builds a same-boundary synthetic host with exact context and no host side effects', () => {
    const appUrl =
      'https://preview.example.test/app/?commonsSurface=widget&commonsHostOrigin=' +
      encodeURIComponent(VERIFIER_HOST_ORIGIN);
    const html = createVerifierHostHtml({
      appUrl,
      scenario: {
        name: 'widget-380x480-dark',
        surface: 'widget',
        theme: 'dark',
        width: 380,
        height: 480,
      },
      capabilities: ['tasks.read', 'workflows.read'],
    });

    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain('allow-same-origin');
    expect(html).toContain('scrolling="no"');
    expect(html).toContain('"surface":"widget"');
    expect(html).toContain('"theme":"dark"');
    expect(html).toContain('"width":380');
    expect(html).toContain('"height":480');
    expect(html).toContain('"capabilities":["tasks.read","workflows.read"]');
    expect(html).toContain("'tasks.list': 'tasks.read'");
    expect(html).toContain('This app was not granted the');
    expect(html).toContain("method === 'navigation.open'");
    expect(html).toContain("method === 'ui.resize'");
    expect(html).not.toContain('window.open(');
    expect(html).not.toContain('fetch(');
    const script = html.match(/<script>([\s\S]+)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(() => new Function(script as string)).not.toThrow();
  });

  it('keeps every fixture collection small and populated', () => {
    for (const records of Object.values(VERIFIER_FIXTURES)) {
      expect(records.length).toBeGreaterThan(0);
      expect(records.length).toBeLessThanOrEqual(5);
    }
  });

  it('selects an in-memory host origin allowed by frame-ancestors', () => {
    expect(
      resolveVerifierHostOrigin(
        {
          'content-security-policy':
            "default-src 'self'; frame-ancestors https://agentcommons.io https://*.agentcommons.io",
        },
        'https://api.agentcommons.io/v1/previews/example/',
      ),
    ).toBe('https://agentcommons.io');
    expect(
      resolveVerifierHostOrigin(
        {
          'content-security-policy':
            'frame-ancestors https://*.agentcommons.io',
        },
        'https://preview.example.test/',
      ),
    ).toBe('https://verifier.agentcommons.io');
    expect(
      resolveVerifierHostOrigin(
        { 'content-security-policy': 'frame-ancestors *' },
        'http://127.0.0.1:45678/',
      ),
    ).toBe('http://127.0.0.1:41737');
  });
});
