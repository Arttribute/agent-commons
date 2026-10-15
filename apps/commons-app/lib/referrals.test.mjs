import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERRAL_CODE_PATTERN, referralShares, referralMessage } from './referrals.ts';

test('share composers preserve the complete attributable link and short editable message', () => {
  const url = 'https://staging.agentcommons.io/r/A123456789012345678901';
  for (const share of referralShares(url)) {
    const parsed = new URL(share.href);
    assert.equal(parsed.protocol, 'https:');
    assert.ok(decodeURIComponent(parsed.search).includes(url));
  }
  assert.ok(referralMessage(url).length < 180);
  assert.ok(REFERRAL_CODE_PATTERN.test('A123456789012345678901'));
  assert.equal(REFERRAL_CODE_PATTERN.test('../bad'), false);
});
