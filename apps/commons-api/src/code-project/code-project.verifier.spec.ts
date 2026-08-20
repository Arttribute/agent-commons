import { getEmbeddingError } from './code-project.verifier';

describe('code project embedding policy', () => {
  it('accepts an explicit cross-origin frame policy', () => {
    expect(
      getEmbeddingError({
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

  it('rejects self-only and disabled CSP embedding', () => {
    expect(
      getEmbeddingError({
        'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
      }),
    ).toContain("frame-ancestors 'self'");
    expect(
      getEmbeddingError({
        'content-security-policy': "frame-ancestors 'none'",
      }),
    ).toContain("frame-ancestors 'none'");
  });
});
