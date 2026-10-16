import { CreditController } from './credit.controller';

describe('CreditController delegated self-service', () => {
  const credits = {
    getSummary: jest.fn().mockResolvedValue({}),
    gift: jest.fn().mockResolvedValue({}),
    claimCampaign: jest.fn().mockResolvedValue({}),
  };
  const controller = new CreditController(credits as any);

  beforeEach(() => jest.clearAllMocks());

  it('attributes a service-proxied summary to the delegated user', async () => {
    await controller.summary({
      principal: {
        principalId: 'commons-app-service',
        principalType: 'service',
        scopes: ['legacy:delegate', 'platform:admin'],
      },
      headers: { 'x-owner-id': 'user-1' },
    });

    expect(credits.getSummary).toHaveBeenCalledWith('user-1');
  });

  it('treats delegated campaign claims as self-service, not admin grants', async () => {
    await controller.claimCampaign(
      {
        principal: {
          principalId: 'commons-app-service',
          principalType: 'service',
          scopes: ['legacy:delegate', 'platform:admin'],
        },
        headers: { 'x-initiator': 'user-1' },
      },
      { campaignKey: 'launch-builder-bonus' },
    );

    expect(credits.claimCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        principalId: 'user-1',
        sourcePlatform: 'agent_commons',
        selfService: true,
      }),
    );
  });

  it('debits the signed-in user for a service-proxied gift', async () => {
    await controller.gift(
      {
        principal: {
          principalId: 'commons-app-service',
          principalType: 'service',
          scopes: ['legacy:delegate'],
        },
        headers: { 'x-initiator': 'usr_sender' },
      },
      {
        recipientPrincipalId: 'usr_recipient',
        amount: 50,
        idempotencyKey: 'gift-1',
      },
    );
    expect(credits.gift).toHaveBeenCalledWith(
      expect.objectContaining({
        senderPrincipalId: 'usr_sender',
        recipientPrincipalId: 'usr_recipient',
        amount: 50,
      }),
    );
  });

  it('allows a scoped source service to verify an external reward', async () => {
    await controller.claimCampaign(
      {
        principal: {
          principalId: 'commonlab-service',
          principalType: 'service',
          scopes: ['credits:write'],
        },
        headers: {},
      },
      {
        campaignKey: 'commonlab-course-completion',
        principalId: 'user-1',
        sourcePlatform: 'commonlab',
        eventId: 'course-1',
      },
    );

    expect(credits.claimCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        principalId: 'user-1',
        sourcePlatform: 'commonlab',
        selfService: false,
      }),
    );
  });
});

describe('operations grant environment binding', () => {
  const grant = jest.fn().mockResolvedValue({ entryId: 'entry_test' });
  const controller = new CreditController({ grant } as any);
  const previous = process.env.APP_ENV;
  beforeEach(() => {
    process.env.APP_ENV = 'production';
    jest.clearAllMocks();
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  });
  const request = (env: string) => ({
    principal: {
      principalId: 'svc_ops',
      principalType: 'service',
      workspaceId: `ops:${env}`,
      scopes: ['credits:write'],
    },
  });
  const body = {
    principalId: 'usr_recipient',
    amount: 1000000,
    eventType: 'ops_credit_grant',
    idempotencyKey: 'test-ops-grant',
  };
  it('rejects staging credentials on production', async () => {
    await expect(
      controller.grant(request('staging'), body),
    ).rejects.toMatchObject({ status: 403 });
    expect(grant).not.toHaveBeenCalled();
  });
  it('allows a production-bound grant', async () => {
    await expect(
      controller.grant(request('production'), body),
    ).resolves.toEqual({ data: { entryId: 'entry_test' } });
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000000,
        principalId: 'usr_recipient',
      }),
    );
  });
});
