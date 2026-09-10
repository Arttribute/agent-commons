import { readSettlement } from './x402-settlement';

describe('x402 settlement receipts', () => {
  it.each([402, 500, 200])(
    'preserves a %i response without claiming settlement',
    (status) => {
      const response = new Response('payment response', { status });
      const parse = jest.fn(() => {
        throw new Error('Payment response header not found');
      });
      expect(readSettlement(response, parse)).toBeUndefined();
      expect(parse).not.toHaveBeenCalled();
      expect(response.status).toBe(status);
      expect(response.bodyUsed).toBe(false);
    },
  );
  it('parses a supplied receipt with case-insensitive headers', () => {
    const receipt = { success: true, transaction: '0xtest' };
    const response = new Response('ok', {
      headers: { 'payment-response': JSON.stringify(receipt) },
    });
    expect(
      readSettlement(response, (get) => JSON.parse(get('PAYMENT-RESPONSE')!)),
    ).toEqual(receipt);
  });
  it('does not conceal malformed receipts as successful payments', () => {
    const response = new Response('ok', {
      headers: { 'PAYMENT-RESPONSE': 'invalid' },
    });
    expect(() =>
      readSettlement(response, (get) => JSON.parse(get('PAYMENT-RESPONSE')!)),
    ).toThrow();
  });
});
