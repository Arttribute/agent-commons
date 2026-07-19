import { CreditController } from './credit.controller';

describe('CreditController delegated self-service', () => {
  const credits = {
    getSummary: jest.fn().mockResolvedValue({}),
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
