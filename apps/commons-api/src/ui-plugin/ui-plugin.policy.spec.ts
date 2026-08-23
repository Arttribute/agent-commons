import { verificationCoversManifest } from './ui-plugin.policy';

describe('UI plugin verification coverage policy', () => {
  it('requires every requested surface, including the exact widget size', () => {
    const verification = {
      verifiedSurfaces: [
        { type: 'page' },
        { type: 'widget', width: 380, height: 480 },
      ],
      verifiedCapabilities: [],
    };

    expect(
      verificationCoversManifest(verification, {
        surfaces: [
          { type: 'page' },
          { type: 'widget', width: 380, height: 480 },
        ],
      }),
    ).toBe(true);
    expect(
      verificationCoversManifest(verification, {
        surfaces: [{ type: 'widget', width: 520, height: 480 }],
      }),
    ).toBe(false);
    expect(
      verificationCoversManifest(verification, {
        surfaces: [{ type: 'widget', width: 380, height: 720 }],
      }),
    ).toBe(false);
  });

  it('normalizes default and bounded widget dimensions consistently', () => {
    expect(
      verificationCoversManifest(
        {
          verifiedSurfaces: [{ type: 'widget' }],
          verifiedCapabilities: [],
        },
        { surfaces: [{ type: 'widget', width: 380, height: 480 }] },
      ),
    ).toBe(true);
    expect(
      verificationCoversManifest(
        {
          verifiedSurfaces: [{ type: 'widget', width: 9_000, height: 10 }],
          verifiedCapabilities: [],
        },
        { surfaces: [{ type: 'widget', width: 520, height: 240 }] },
      ),
    ).toBe(true);
  });

  it('requires every declared capability to have been exercised', () => {
    const manifest = {
      surfaces: [{ type: 'page' as const }],
      capabilities: [
        { name: 'tasks.read', resourceIds: ['task-1'] },
        { name: 'workflows.execute' },
      ],
    };

    expect(
      verificationCoversManifest(
        {
          verifiedSurfaces: [{ type: 'page' }],
          verifiedCapabilities: ['tasks.read'],
        },
        manifest,
      ),
    ).toBe(false);
    expect(
      verificationCoversManifest(
        {
          verifiedSurfaces: [{ type: 'page' }],
          verifiedCapabilities: [
            'workflows.execute',
            'tasks.read',
            'extra.read',
          ],
        },
        manifest,
      ),
    ).toBe(true);
  });

  it('fails closed for malformed persisted manifests and verification JSON', () => {
    expect(verificationCoversManifest({}, { surfaces: [] })).toBe(false);
    expect(
      verificationCoversManifest(
        { verifiedSurfaces: [{ type: 'page' }] },
        { surfaces: null },
      ),
    ).toBe(false);
    expect(
      verificationCoversManifest(
        { verifiedSurfaces: [{ type: 'page' }] },
        { surfaces: [{ type: 'page' }], capabilities: null },
      ),
    ).toBe(false);
    expect(
      verificationCoversManifest(
        { verifiedSurfaces: [{ type: 'widget', width: '380' }] },
        { surfaces: [{ type: 'widget' }] },
      ),
    ).toBe(false);
  });
});
