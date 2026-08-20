import { getEmbeddingError } from './code-project.verifier';

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
    expect(
      getEmbeddingError({ 'x-frame-options': 'SAMEORIGIN' }),
    ).toContain('X-Frame-Options is SAMEORIGIN');
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
});
