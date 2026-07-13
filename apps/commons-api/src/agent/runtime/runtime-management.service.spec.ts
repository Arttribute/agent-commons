import { BadRequestException } from '@nestjs/common';
import { RuntimeManagementService } from './runtime-management.service';

describe('RuntimeManagementService channel configuration', () => {
  const encryption = {
    encrypt: jest.fn((value: string) => ({
      iv: `iv-${value}`,
      tag: `tag-${value}`,
      encryptedValue: `cipher-${value}`,
    })),
  };
  const service = new RuntimeManagementService(
    {} as any,
    {} as any,
    encryption as any,
  );

  beforeEach(() => encryption.encrypt.mockClear());

  it('returns credential metadata without returning stored secrets', () => {
    const config = (service as any).publicConfig({
      runtimeType: 'hermes',
      runtimeConfig: {
        channels: {
          telegram: {
            enabled: true,
            dmPolicy: 'allowlist',
            allowFrom: ['123'],
          },
        },
      },
      runtimeSecrets: {
        telegram: { botToken: 'enc:iv:tag:ciphertext' },
      },
    });

    expect(config.channels.telegram).toMatchObject({
      configured: true,
      configuredFields: ['botToken'],
      setupMethod: 'credentials',
    });
    expect(JSON.stringify(config)).not.toContain('ciphertext');
  });

  it('encrypts only recognized credential fields', () => {
    const result = (service as any).updateChannelSecrets(
      {},
      {
        telegram: {
          enabled: true,
          credentials: {
            botToken: 'telegram-secret',
            arbitrarySecret: 'must-not-be-stored',
          },
        },
      },
    );

    expect(result).toEqual({
      changed: true,
      value: {
        telegram: {
          botToken:
            'enc:iv-telegram-secret:tag-telegram-secret:cipher-telegram-secret',
        },
      },
    });
  });

  it('rejects enabled credential channels until required fields exist', () => {
    expect(() =>
      (service as any).validateChannelConfiguration(
        'hermes',
        { telegram: { enabled: true } },
        {},
      ),
    ).toThrow(BadRequestException);
  });
});
