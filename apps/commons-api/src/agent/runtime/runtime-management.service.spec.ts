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

  it('stores only the documented Slack and Discord credentials', () => {
    const result = (service as any).updateChannelSecrets(
      {},
      {
        slack: {
          enabled: true,
          credentials: {
            botToken: 'xoxb-secret',
            appToken: 'xapp-secret',
            signingSecret: 'not-used-in-socket-mode',
          },
        },
        discord: {
          enabled: true,
          credentials: { botToken: 'discord-secret' },
        },
      },
    );

    expect(Object.keys(result.value.slack)).toEqual(['botToken', 'appToken']);
    expect(Object.keys(result.value.discord)).toEqual(['botToken']);
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
    jest.spyOn(channelService as any, 'getAgent').mockResolvedValue({
      runtimeType: 'openclaw',
      runtimeConfig: { channels: { whatsapp: { enabled: true } } },
    });
    jest.spyOn(channelService as any, 'ensureReady').mockResolvedValue({});

    await expect(
      channelService.channelAction('agent-1', 'whatsapp', 'status'),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      channelService.channelAction('agent-1', 'whatsapp', 'status'),
    ).rejects.toThrow('WhatsApp setup is taking longer than expected');
  });

  it('returns a cold runtime state promptly for client-side retry', async () => {
    const computers = {
      runtimeChannelAction: jest
        .fn()
        .mockResolvedValue({ status: 'starting', runtimeStatus: 'starting' }),
    };
    const channelService = new RuntimeManagementService(
      {} as any,
      computers as any,
      encryption as any,
    );
    jest.spyOn(channelService as any, 'getAgent').mockResolvedValue({
      runtimeType: 'hermes',
      runtimeConfig: { channels: { whatsapp: { enabled: true } } },
    });
    jest.spyOn(channelService as any, 'ensureReady').mockResolvedValue({});

    await expect(
      channelService.channelAction('agent-1', 'whatsapp', 'connect'),
    ).resolves.toEqual({ status: 'starting', runtimeStatus: 'starting' });
    expect(computers.runtimeChannelAction).toHaveBeenCalledTimes(1);
  });

  it('forwards pairing approvals and test messages to any managed channel', async () => {
    const computers = {
      runtimeChannelAction: jest
        .fn()
        .mockResolvedValue({ output: { status: 'approved' } }),
    };
    const channelService = new RuntimeManagementService(
      {} as any,
      computers as any,
      encryption as any,
    );
    jest.spyOn(channelService as any, 'getAgent').mockResolvedValue({
      runtimeType: 'openclaw',
      runtimeConfig: { channels: { telegram: { enabled: true } } },
    });
    jest.spyOn(channelService as any, 'ensureReady').mockResolvedValue({});

    await channelService.channelAction('agent-1', 'telegram', 'approve', {
      pairingCode: 'abc12def',
    });
    expect(computers.runtimeChannelAction).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram',
        action: 'approve',
        pairingCode: 'ABC12DEF',
      }),
    );

    await channelService.channelAction('agent-1', 'telegram', 'test', {
      target: '123456789',
      message: 'connected',
    });
    expect(computers.runtimeChannelAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'test',
        target: '123456789',
        message: 'connected',
      }),
    );
  });

  it('rejects malformed pairing codes before contacting the runtime', async () => {
    const computers = { runtimeChannelAction: jest.fn() };
    const channelService = new RuntimeManagementService(
      {} as any,
      computers as any,
      encryption as any,
    );
    jest.spyOn(channelService as any, 'getAgent').mockResolvedValue({
      runtimeType: 'hermes',
      runtimeConfig: { channels: { discord: { enabled: true } } },
    });

    await expect(
      channelService.channelAction('agent-1', 'discord', 'approve', {
        pairingCode: 'bad code',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(computers.runtimeChannelAction).not.toHaveBeenCalled();
  });

  it('reuses an active assigned computer without starting it again', async () => {
    const activeComputer = { computerId: 'computer-1', status: 'running' };
    const computers = {
      getConfig: jest.fn().mockResolvedValue({ enabled: true }),
      getAssignedComputer: jest.fn().mockResolvedValue(activeComputer),
      startComputer: jest.fn(),
    };
    const runtimeService = new RuntimeManagementService(
      {} as any,
      computers as any,
      encryption as any,
    );
    jest.spyOn(runtimeService as any, 'getAgent').mockResolvedValue({
      runtimeType: 'openclaw',
      runtimeStatus: 'ready',
    });

    await expect(runtimeService.ensureReady('agent-1')).resolves.toBe(
      activeComputer,
    );
    expect(computers.startComputer).not.toHaveBeenCalled();
  });
});
