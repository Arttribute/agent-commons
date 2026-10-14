import { ReferralController } from './referral.controller';

describe('referral authorization', () => {
  const referrals = { activate: jest.fn(), summary: jest.fn(), reserveInvitation: jest.fn(), completeInvitation: jest.fn() };
  const controller = new ReferralController(referrals as any);
  const app = { principal: { principalId: 'svc_agent_commons', principalType: 'service', scopes: ['agents:read'] }, headers: { 'x-initiator': 'usr_alice', 'x-owner-id': 'usr_alice' } };
  beforeEach(() => jest.clearAllMocks());
  it('rejects user, unrelated service, and management tokens on reward attestations', async () => {
    for (const principal of [
      { principalId: 'usr_alice', principalType: 'user' },
      { principalId: 'svc_other', principalType: 'service', scopes: ['platform:admin'] },
      { principalId: 'management-key', principalType: 'service', scopes: ['platform:admin'] },
    ]) await expect(controller.activate({ principal }, {} as any)).rejects.toMatchObject({ status: 403 });
    expect(referrals.activate).not.toHaveBeenCalled();
  });
  it('attributes invitations to the authenticated delegated user', async () => {
    await controller.invitation(app, { email: 'friend@example.com' });
    expect(referrals.reserveInvitation).toHaveBeenCalledWith('usr_alice', 'friend@example.com');
  });
  it('blocks forged completion reports from users', async () => {
    await expect(controller.complete({ principal: { principalId: 'usr_alice', principalType: 'user' } }, { invitationId: 'x', sent: true })).rejects.toMatchObject({ status: 403 });
    expect(referrals.completeInvitation).not.toHaveBeenCalled();
  });

  it('uses the staging service identity only in the staging API', async () => {
    const previous = process.env.APP_ENV;
    process.env.APP_ENV = 'staging';
    try {
      await expect(controller.activate(app, {} as any)).rejects.toMatchObject({ status: 403 });
      await controller.activate({ ...app, principal: { ...app.principal, principalId: 'svc_agent_commons_staging' } }, {} as any);
      expect(referrals.activate).toHaveBeenCalledTimes(1);
    } finally { if (previous === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous; }
  });
});
