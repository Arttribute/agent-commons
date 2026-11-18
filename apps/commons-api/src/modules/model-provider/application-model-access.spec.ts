import { APPLICATION_MODEL_ACCESS, applicationAllowsModel, verifyApplicationModelAccess } from './application-model-access';
describe('application-paid model access', () => {
  const claim = { application: 'common-business', access: 'subscription', tenantId: '123456789012345678901234', userId: 'usr_owner' };
  it('accepts an authenticated, scoped application service for its delegated user', () => {
    const access = verifyApplicationModelAccess({ principalType: 'service', scopes: ['common-business:models'] }, claim, 'usr_owner');
    expect(applicationAllowsModel(access, 'openai', 'gpt-6.2-astra')).toBe(true);
    expect(applicationAllowsModel(access, 'openai', 'gpt-5.6-sol')).toBe(true);
    expect(applicationAllowsModel(access, 'anthropic', 'claude-opus-4-6')).toBe(false);
  });
  it.each([{ principalType: 'user', scopes: ['platform:admin'] }, { principalType: 'service', scopes: ['agents:run'] }, undefined])('rejects forged application claims from %p', principal => {
    expect(verifyApplicationModelAccess(principal, claim, 'usr_owner')).toBeUndefined();
  });
  it('rejects a claim for another person and a malformed tenant', () => {
    const principal = { principalType: 'service', scopes: ['platform:admin'] };
    expect(verifyApplicationModelAccess(principal, claim, 'usr_other')).toBeUndefined();
    expect(verifyApplicationModelAccess(principal, { ...claim, tenantId: '../other' }, 'usr_owner')).toBeUndefined();
  });
  it('cannot receive its internal capability through JSON', () => {
    expect(JSON.parse('{"APPLICATION_MODEL_ACCESS":true}')[APPLICATION_MODEL_ACCESS]).toBeUndefined();
  });
});
