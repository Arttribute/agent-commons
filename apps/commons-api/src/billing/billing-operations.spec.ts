import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

describe('staff billing inspection', () => {
  const inspectCustomer = jest.fn().mockResolvedValue({ customerId: 'cus_test' });
  const controller = new BillingController({ inspectCustomer } as any, {} as any);
  const principal = { principalType: 'service', principalId: 'svc_ops', workspaceId: 'ops:staging', scopes: ['ops:read'] };
  const previousEnv = process.env.APP_ENV;
  beforeEach(() => { process.env.APP_ENV = 'staging'; jest.clearAllMocks(); });
  afterAll(() => { if (previousEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previousEnv; });
  it.each([
    undefined,
    { ...principal, principalType: 'user' },
    { ...principal, scopes: ['credits:write'] },
    { ...principal, workspaceId: 'ops:production' },
  ])('rejects unauthorized or mismatched callers', async candidate => {
    await expect(controller.operations({ principal: candidate } as any, 'usr_test')).rejects.toMatchObject({ status: 403 });
    expect(inspectCustomer).not.toHaveBeenCalled();
  });
  it('permits an explicitly scoped service in the same environment', async () => {
    await expect(controller.operations({ principal } as any, 'usr_test')).resolves.toEqual({ data: { customerId: 'cus_test' } });
    expect(inspectCustomer).toHaveBeenCalledWith('usr_test');
  });
  it('rejects malformed recipients before contacting Stripe', async () => {
    await expect(controller.operations({ principal } as any, '../users')).rejects.toMatchObject({ status: 400 });
  });
  it('projects only display-safe billing fields', async () => {
    const list = (data: any[]) => jest.fn().mockResolvedValue({ data, has_more: false });
    const provider = { configured: true, stripe: {
      subscriptions: { list: list([{ id:'sub_test',status:'active',cancel_at_period_end:false,current_period_end:1793000000,
        items:{data:[{price:{id:'price_test',nickname:'Plus',unit_amount:1234,currency:'usd',recurring:{interval:'month',interval_count:1}},quantity:2}]},secret:'excluded' }]) },
      invoices: { list: list([{ id:'in_test',number:'INV-1',created:1792000000,amount_paid:2468,amount_due:2468,total:2468,currency:'usd',status:'paid',lines:{data:[{description:'Plus',amount:2468,currency:'usd'}],has_more:false},customer_address:{private:'excluded'} }]) },
      checkout: { sessions: { list: list([{ id:'cs_test',mode:'payment',amount_total:500,currency:'usd',payment_status:'paid',created:1792000000 }]) } },
      customers: { retrieve: jest.fn().mockResolvedValue({invoice_settings:{}}) },
      paymentMethods: { list: list([]) },
    }};
    const service = new BillingService({ query:{billingCustomer:{findFirst:jest.fn().mockResolvedValue({stripeCustomerId:'cus_test'})}}} as any,provider as any,{} as any);
    const result = await service.inspectCustomer('usr_test');
    expect(result.subscriptions[0].items[0]).toMatchObject({amount:1234,quantity:2,interval:'month'});
    expect(result.invoices[0].amountPaid).toBe(2468);
    expect(result.topups[0].amount).toBe(500);
    expect(JSON.stringify(result)).not.toContain('excluded');
  });
});
