import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
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

  it('returns a useful service error when channel setup times out', async () => {
    const computers = {
      runtimeChannelAction: jest
        .fn()
        .mockRejectedValue(new Error('runtime channel command timed out')),
    };
    const channelService = new RuntimeManagementService(
      {} as any,
      computers as any,
      encryption as any,
    );
    jest
      .spyOn(channelService as any, 'getAgent')
      .mockResolvedValue({ runtimeType: 'openclaw' });
    jest.spyOn(channelService as any, 'ensureReady').mockResolvedValue({});

    await expect(
      channelService.channelAction('agent-1', 'whatsapp', 'status'),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      channelService.channelAction('agent-1', 'whatsapp', 'status'),
    ).rejects.toThrow('WhatsApp setup is taking longer than expected');
  });
});
