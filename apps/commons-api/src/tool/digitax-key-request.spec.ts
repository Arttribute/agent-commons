import {
  digitaxRequestTarget,
  requestDigiTaxWithKey,
} from './digitax-key-request';
import { ToolKeyController } from './tool-key.controller';

describe('DigiTax vault credential use', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  it('restricts credential use to supported provider endpoints', () => {
    expect(
      digitaxRequestTarget({
        method: 'GET',
        path: '/items?after=item_1&page_size=20',
      }),
    ).toBe('https://api.digitax.tech/ke/v2/items?after=item_1&page_size=20');
    for (const path of [
      'https://evil.example/items',
      '//evil.example/items',
      '/items/../sales',
      '/items%2F..%2Fsales',
      '/items#x',
      '/items?redirect=https://evil.example',
      '/stock/adjust',
    ])
      expect(() => digitaxRequestTarget({ method: 'GET', path })).toThrow();
    expect(() =>
      digitaxRequestTarget({
        method: 'POST',
        path: '/sales?after=x',
        body: {},
      }),
    ).toThrow();
  });
  it('does not return a key or upstream error diagnostics and never follows redirects', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ message: 'private-key' }), {
          status: 401,
        }),
    ) as any;
    expect(
      await requestDigiTaxWithKey('private-key', {
        method: 'GET',
        path: '/etims-info',
      }),
    ).toEqual({ status: 401, ambiguous: false });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.digitax.tech/ke/v2/etims-info',
      expect.objectContaining({
        redirect: 'error',
        headers: expect.objectContaining({ 'X-API-Key': 'private-key' }),
      }),
    );
    global.fetch = jest.fn(async () =>
      Response.json({ accidentalEcho: 'private-key' }),
    ) as any;
    expect(
      JSON.stringify(
        await requestDigiTaxWithKey('private-key', {
          method: 'GET',
          path: '/etims-info',
        }),
      ),
    ).not.toContain('private-key');
  });
  it('marks a lost provider response as uncertain instead of confirming a write', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('connection lost');
    }) as any;
    expect(
      await requestDigiTaxWithKey('key', {
        method: 'POST',
        path: '/sales',
        body: {},
      }),
    ).toEqual({ status: 502, ambiguous: true });
  });
  it('checks the authenticated key owner before decrypting or contacting the provider', async () => {
    const vault = {
      getKeyMetadata: jest.fn(async () => {
        throw new Error('not found');
      }),
      getDecryptedKey: jest.fn(),
    };
    const controller = new ToolKeyController(vault as any);
    await expect(
      controller.requestDigiTax(
        'another-key',
        { method: 'GET', path: '/etims-info' },
        {
          principal: { principalType: 'user', principalId: 'user-a' },
          headers: { 'x-initiator': 'user-b' },
        } as any,
      ),
    ).rejects.toThrow('not found');
    expect(vault.getKeyMetadata).toHaveBeenCalledWith('another-key', {
      ownerId: 'user-a',
      ownerType: 'user',
    });
    expect(vault.getDecryptedKey).not.toHaveBeenCalled();
  });
  it('allows a trusted service to use the actual delegated owner and refuses unrelated credentials', async () => {
    const vault = {
      getKeyMetadata: jest.fn(async () => ({
        keyName: 'google',
        keyType: 'api-key',
      })),
      getDecryptedKey: jest.fn(),
    };
    const controller = new ToolKeyController(vault as any);
    await expect(
      controller.requestDigiTax('key', { method: 'GET', path: '/etims-info' }, {
        principal: { principalType: 'service', principalId: 'common-business' },
        headers: { 'x-initiator': 'owner-a' },
      } as any),
    ).rejects.toThrow('not enabled');
    expect(vault.getKeyMetadata).toHaveBeenCalledWith('key', {
      ownerId: 'owner-a',
      ownerType: 'user',
    });
    expect(vault.getDecryptedKey).not.toHaveBeenCalled();
  });
});
