import {
  CodeProjectVerifier,
  countCssOrientationLocks,
  getEmbeddingError,
  hasDefaultSerifFont,
  isAllowedPreviewRequest,
  sanitizedBrowserEnvironment,
} from './code-project.verifier';
import { chromium } from 'playwright';

describe('code project embedding policy', () => {
  it('accepts an explicit cross-origin frame policy', () => {
    expect(
      getEmbeddingError({
        'access-control-allow-origin': '*',
        'content-security-policy':
          "default-src 'self'; frame-ancestors https://agentcommons.io https://*.agentcommons.io",
      }),
    ).toBeNull();
  });

  it('rejects X-Frame-Options even when the page otherwise loads', () => {
    expect(getEmbeddingError({ 'x-frame-options': 'SAMEORIGIN' })).toContain(
      'X-Frame-Options is SAMEORIGIN',
    );
  });

  it('rejects CORS that cannot load modules from an opaque sandbox', () => {
    expect(
      getEmbeddingError({
        'access-control-allow-origin': 'https://www.agentcommons.io',
      }),
    ).toContain('Access-Control-Allow-Origin: *');
    expect(
      getEmbeddingError({
        'access-control-allow-origin': '*',
        'access-control-allow-credentials': 'true',
      }),
    ).toContain('must not allow credentialed');
  });

  it('rejects self-only and disabled CSP embedding', () => {
    expect(
      getEmbeddingError({
        'access-control-allow-origin': '*',
        'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
      }),
    ).toContain("frame-ancestors 'self'");
    expect(
      getEmbeddingError({
        'access-control-allow-origin': '*',
        'content-security-policy': "frame-ancestors 'none'",
      }),
    ).toContain("frame-ancestors 'none'");
  });

  it('does not mistake a sans-serif fallback for default serif type', () => {
    expect(hasDefaultSerifFont('Arial, sans-serif')).toBe(false);
    expect(hasDefaultSerifFont('"Space Grotesk Variable", sans-serif')).toBe(
      false,
    );
    expect(hasDefaultSerifFont('serif')).toBe(true);
    expect(hasDefaultSerifFont('"Times New Roman", serif')).toBe(true);
  });

  it('detects quarter-turn orientation locks without fetching CSS in-browser', () => {
    expect(
      countCssOrientationLocks([
        `
          @media screen and (orientation: portrait) {
            .app { transform: rotate(90deg); }
          }
          @media (orientation: landscape) {
            .other { rotate: -0.25turn; }
          }
        `,
      ]),
    ).toBe(2);
    expect(
      countCssOrientationLocks([
        '@media (orientation: portrait) { main { transform: matrix(0, 1, -1, 0, 0, 0); } }',
      ]),
    ).toBe(1);
  });

  it('does not confuse ordinary responsive CSS or overwritten rotations with an orientation lock', () => {
    expect(
      countCssOrientationLocks([
        `
          .icon { transform: rotate(90deg); }
          @media (min-width: 700px) { .menu { transform: rotate(90deg); } }
          @media (orientation: landscape) {
            .logo { transform: rotate(180deg); }
            .reset { transform: rotate(90deg); transform: none; }
            .balanced { transform: rotate(90deg) rotate(-90deg); }
          }
        `,
      ]),
    ).toBe(0);
  });

  it('allows only the pinned preview path and its assets', () => {
    const root =
      'https://api.agentcommons.io/v1/previews/pulse/deployments/deploy-1/';
    expect(isAllowedPreviewRequest(root, root)).toBe(true);
    expect(
      isAllowedPreviewRequest(
        `${root}assets/index-abc.js?commonsTheme=dark`,
        root,
      ),
    ).toBe(true);
    expect(
      isAllowedPreviewRequest(
        'https://api.agentcommons.io/v1/previews/pulse/deployments/deploy-2/',
        root,
      ),
    ).toBe(false);
    expect(
      isAllowedPreviewRequest('https://api.agentcommons.io/v1/agents', root),
    ).toBe(false);
    expect(isAllowedPreviewRequest('https://example.com/collect', root)).toBe(
      false,
    );
    expect(
      isAllowedPreviewRequest(
        'https://user:secret@api.agentcommons.io/v1/previews/pulse/deployments/deploy-1/',
        root,
      ),
    ).toBe(false);
  });

  it('does not expose API credentials to the Chromium child process', () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousOauthSecret = process.env.OAUTH_ENCRYPTION_KEY;
    process.env.DATABASE_URL = 'postgres://secret';
    process.env.OAUTH_ENCRYPTION_KEY = 'secret-key';
    try {
      const environment = sanitizedBrowserEnvironment();
      expect(environment.DATABASE_URL).toBeUndefined();
      expect(environment.OAUTH_ENCRYPTION_KEY).toBeUndefined();
      expect(environment.HOME).toBe('/tmp');
    } finally {
      restoreEnvironment('DATABASE_URL', previousDatabaseUrl);
      restoreEnvironment('OAUTH_ENCRYPTION_KEY', previousOauthSecret);
    }
  });

  it('rejects excess browser verification work and launches without no-sandbox flags', async () => {
    const previousMaximum = process.env.CODE_PROJECT_VERIFY_MAX_CONCURRENCY;
    process.env.CODE_PROJECT_VERIFY_MAX_CONCURRENCY = '1';
    let rejectLaunch: (reason: Error) => void = () => undefined;
    const launch = jest.spyOn(chromium, 'launch').mockReturnValue(
      new Promise((_, reject) => {
        rejectLaunch = reject;
      }) as any,
    );
    const verifier = new CodeProjectVerifier();
    const first = verifier.verify('https://preview.example.com/project/');
    const firstResult = expect(first).rejects.toThrow('launch stopped');

    try {
      await Promise.resolve();
      await expect(
        verifier.verify('https://preview.example.com/project/'),
      ).rejects.toThrow('capacity is full');
      const launchOptions = launch.mock.calls[0]?.[0];
      expect(launchOptions?.args).not.toContain('--no-sandbox');
      expect(launchOptions?.args).not.toContain('--disable-setuid-sandbox');
      expect(launchOptions?.env?.DATABASE_URL).toBeUndefined();
    } finally {
      rejectLaunch(new Error('launch stopped'));
      await firstResult;
      launch.mockRestore();
      restoreEnvironment(
        'CODE_PROJECT_VERIFY_MAX_CONCURRENCY',
        previousMaximum,
      );
    }
  });
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
