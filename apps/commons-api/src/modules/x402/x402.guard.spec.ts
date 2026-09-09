import { X402Guard } from './x402.guard';
const verify = jest.fn(),
  settle = jest.fn();
jest.mock('x402/verify', () => ({
  useFacilitator: () => ({
    verify: (...args: unknown[]) => verify(...args),
    settle: (...args: unknown[]) => settle(...args),
  }),
}));
function setup(network = 'base-sepolia') {
  const guard = new X402Guard({
    getAllAndOverride: () => ({
      amount: 0.001,
      payTo: '0x1111111111111111111111111111111111111111',
      network,
    }),
  } as any);
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  const req = {
    method: 'GET',
    path: '/paid',
    headers: { 'x-payment': Buffer.from('{}').toString('base64') },
  };
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => response,
    }),
  };
  return { guard, response, context };
}
describe('paid access settlement', () => {
  beforeEach(() => {
    verify.mockReset().mockResolvedValue({ isValid: true });
    settle.mockReset();
  });
  it('does not grant access merely because verification passed', async () => {
    settle.mockResolvedValue({ success: false });
    const t = setup();
    expect(await t.guard.canActivate(t.context as any)).toBe(false);
    expect(t.response.status).toHaveBeenCalledWith(402);
  });
  it('waits for settlement and returns its receipt', async () => {
    let complete: (value: unknown) => void = () => {};
    settle.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const t = setup();
    let resolved = false;
    const pending = t.guard.canActivate(t.context as any).then((value) => {
      resolved = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    complete({ success: true, transaction: '0xabc' });
    expect(await pending).toBe(true);
    expect(t.response.setHeader).toHaveBeenCalled();
  });
  it('fails closed on unknown networks', async () => {
    const t = setup('arc-imaginary');
    expect(await t.guard.canActivate(t.context as any)).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
  it('requires a transaction receipt for success', async () => {
    settle.mockResolvedValue({ success: true });
    const t = setup();
    expect(await t.guard.canActivate(t.context as any)).toBe(false);
  });
});
