import { readWalletActivity } from './wallet-activity';

const wallet = '0x8071880e5f621f18c83fe5c4e5e2cfaa5be0e508';
const other = '0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab';
const arcUsdc = '0x3600000000000000000000000000000000000000';

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('wallet activity', () => {
  it('lists USDC transfers once and keeps outgoing native activity', async () => {
    const fetcher = jest.fn((url: string) => {
      if (url.includes('/token-transfers'))
        return json({
          items: [
            {
              transaction_hash: '0xaaa',
              timestamp: '2026-09-17T09:17:57.000000Z',
              method: 'transfer',
              from: { hash: other },
              to: { hash: '0x8071880E5F621f18c83FE5C4e5e2CfAa5BE0e508' },
              token: { address_hash: arcUsdc, symbol: 'USDC' },
              total: { value: '10000000', decimals: '6' },
            },
            {
              transaction_hash: '0xspam',
              timestamp: '2026-09-17T09:18:00.000000Z',
              method: 'transfer',
              from: { hash: other },
              to: { hash: wallet },
              token: { address_hash: '0x' + '9'.repeat(40), symbol: 'USDC' },
              total: { value: '1', decimals: '6' },
            },
          ],
        });
      return json({
        items: [
          {
            hash: '0xAAA',
            timestamp: '2026-09-17T09:17:57.000000Z',
            method: 'transfer',
            status: 'ok',
            value: '10000000000000000000',
            from: { hash: other },
            to: { hash: wallet },
          },
          {
            hash: '0xbbb',
            timestamp: '2026-09-17T10:00:00.000000Z',
            method: 'approve',
            status: 'error',
            value: '0',
            from: { hash: wallet },
            to: { hash: arcUsdc },
          },
          {
            hash: '0xccc',
            timestamp: '2026-09-17T08:00:00.000000Z',
            method: 'poke',
            status: 'ok',
            value: '0',
            from: { hash: other },
            to: { hash: wallet },
          },
        ],
      });
    });

    const activity = await readWalletActivity(
      wallet,
      '5042002',
      fetcher as any,
    );

    expect(fetcher.mock.calls[0][0]).toBe(
      `https://explorer.testnet.arc.io/api/v2/addresses/${wallet}/token-transfers?type=ERC-20&token=${arcUsdc}`,
    );
    expect(activity.supported).toBe(true);
    expect(activity.items).toEqual([
      expect.objectContaining({
        hash: '0xbbb',
        kind: 'call',
        direction: 'out',
        status: 'failed',
      }),
      expect.objectContaining({
        hash: '0xaaa',
        kind: 'token',
        direction: 'in',
        asset: 'USDC',
        amount: '10',
        status: 'success',
      }),
    ]);
  });

  it('reports networks without an activity index as unsupported', async () => {
    const fetcher = jest.fn();
    const activity = await readWalletActivity(wallet, '296', fetcher);
    expect(activity).toEqual({
      address: wallet,
      chainId: '296',
      supported: false,
      items: [],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces index failures instead of returning empty history', async () => {
    const fetcher = jest.fn(() => json({}, 502));
    await expect(
      readWalletActivity(wallet, '84532', fetcher as any),
    ).rejects.toThrow('Activity index returned 502');
  });
});
