import {
  PublicCodeProjectController,
  PublicUiPluginHostController,
} from './code-project.controller';

describe('public code project security headers', () => {
  const originalPluginFrameAncestors = process.env.PLUGIN_FRAME_ANCESTORS;
  const publicAsset = jest.fn();
  const previewController = new PublicCodeProjectController({
    publicAsset,
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PLUGIN_FRAME_ANCESTORS = 'https://commons.example';
  });

  afterAll(() => {
    if (originalPluginFrameAncestors === undefined) {
      delete process.env.PLUGIN_FRAME_ANCESTORS;
    } else {
      process.env.PLUGIN_FRAME_ANCESTORS = originalPluginFrameAncestors;
    }
  });

  it('uses the strict CSP for runtime-v2 HTML previews', async () => {
    publicAsset.mockResolvedValue({
      bytes: Buffer.from(
        '<!doctype html><meta name="agent-commons-runtime" content="2" />',
      ),
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'public, max-age=60',
    });
    const response = responseMock();

    await previewController.asset(
      'weather',
      'index.html',
      {} as any,
      response.value as any,
    );

    expect(response.headers.get('Content-Security-Policy')).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        "connect-src 'none'",
        "frame-src 'none'",
        "frame-ancestors 'self' https://commons.example",
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ].join('; '),
    );
  });

  it('keeps the compatibility CSP for legacy HTML previews', async () => {
    publicAsset.mockResolvedValue({
      bytes: Buffer.from('<!doctype html><title>Legacy preview</title>'),
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'public, max-age=60',
    });
    const response = responseMock();

    await previewController.asset(
      'legacy',
      'index.html',
      {} as any,
      response.value as any,
    );

    expect(response.headers.get('Content-Security-Policy')).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://esm.sh",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src https://esm.sh",
        "frame-src 'none'",
        "frame-ancestors 'self' https://commons.example",
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ].join('; '),
    );
  });

  describe('plugin outer host', () => {
    const hostController = new PublicUiPluginHostController();
    const immutableEntry =
      'https://preview.example/v1/previews/weather/deployments/' +
      '123e4567-e89b-12d3-a456-426614174000/';

    it('accepts an immutable preview URL and renders a nested opaque-origin sandbox', () => {
      const response = responseMock();

      hostController.host(
        {
          query: {
            entry: `${immutableEntry}?untrusted=1#fragment`,
            commonsHostOrigin: 'https://commons.example',
            commonsSurface: 'widget',
            commonsTheme: 'dark',
          },
        } as any,
        response.value as any,
      );

      expect(response.value.status).toHaveBeenCalledWith(200);
      expect(response.headers.get('Content-Security-Policy')).toContain(
        'frame-src https://preview.example',
      );
      expect(response.headers.get('Content-Security-Policy')).toContain(
        'frame-ancestors https://commons.example',
      );

      const html = response.value.send.mock.calls[0][0] as string;
      const sandbox = html.match(/<iframe[^>]+sandbox="([^"]+)"/)?.[1];
      expect(sandbox).toBe('allow-scripts');
      expect(sandbox).not.toContain('allow-same-origin');
      expect(html).toContain('commonsSurface=widget');
      expect(html).toContain('commonsTheme=dark');
      expect(html).toContain('commonsHostOrigin=https%3A%2F%2Fpreview.example');
      expect(html).not.toContain('untrusted=1');
      expect(html).not.toContain('#fragment');
    });

    it.each([
      ['a mutable preview URL', 'https://preview.example/v1/previews/weather/'],
      ['a deployment asset URL', `${immutableEntry}index.html`],
      [
        'a credentialed URL',
        immutableEntry.replace('https://', 'https://user:secret@'),
      ],
      ['a non-HTTP URL', 'javascript:alert(1)'],
    ])('rejects %s', (_label, entry) => {
      const response = responseMock();

      hostController.host(
        {
          query: {
            entry,
            commonsHostOrigin: 'https://commons.example',
          },
        } as any,
        response.value as any,
      );

      expect(response.value.status).toHaveBeenCalledWith(400);
      expect(response.value.send).toHaveBeenCalledWith(
        'Invalid plugin host request',
      );
    });

    it('requires an exact configured parent origin', () => {
      const accepted = responseMock();
      const rejected = responseMock();

      hostController.host(
        {
          query: {
            entry: immutableEntry,
            commonsHostOrigin: 'https://commons.example',
          },
        } as any,
        accepted.value as any,
      );
      hostController.host(
        {
          query: {
            entry: immutableEntry,
            commonsHostOrigin: 'https://commons.example.evil.test',
          },
        } as any,
        rejected.value as any,
      );

      expect(accepted.value.status).toHaveBeenCalledWith(200);
      expect(rejected.value.status).toHaveBeenCalledWith(400);
    });
  });
});

function responseMock() {
  const headers = new Map<string, string | number | readonly string[]>();
  const value = {
    removeHeader: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
    type: jest.fn(),
    send: jest.fn(),
    redirect: jest.fn(),
  };
  value.setHeader.mockImplementation(
    (name: string, header: string | number | readonly string[]) => {
      headers.set(name, header);
      return value;
    },
  );
  value.status.mockReturnValue(value);
  value.type.mockReturnValue(value);
  value.send.mockReturnValue(value);
  value.redirect.mockReturnValue(value);
  return { headers, value };
}
