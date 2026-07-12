import {
  issueSpaceRtcTicket,
  verifySpaceRtcTicket,
} from './space-rtc-ticket';

describe('space RTC ticket', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, SPACE_RTC_TICKET_SECRET: 'test-secret' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('round-trips a valid ticket', () => {
    const ticket = issueSpaceRtcTicket('space-1', 'user-1');
    const payload = verifySpaceRtcTicket(ticket);
    expect(payload).toMatchObject({ spaceId: 'space-1', userId: 'user-1' });
  });

  it('rejects a tampered ticket', () => {
    const ticket = issueSpaceRtcTicket('space-1', 'user-1');
    // Flip a character in the payload segment.
    const [body, sig] = ticket.split('.');
    const tampered = `${body}x.${sig}`;
    expect(verifySpaceRtcTicket(tampered)).toBeNull();
  });

  it('rejects a ticket signed with a different secret', () => {
    const ticket = issueSpaceRtcTicket('space-1', 'user-1');
    process.env.SPACE_RTC_TICKET_SECRET = 'different-secret';
    expect(verifySpaceRtcTicket(ticket)).toBeNull();
  });

  it('rejects an expired ticket', () => {
    const realNow = Date.now;
    const ticket = issueSpaceRtcTicket('space-1', 'user-1');
    // Jump 6 minutes into the future (TTL is 5m).
    Date.now = () => realNow() + 6 * 60 * 1000;
    try {
      expect(verifySpaceRtcTicket(ticket)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it('rejects malformed input', () => {
    expect(verifySpaceRtcTicket(undefined)).toBeNull();
    expect(verifySpaceRtcTicket('')).toBeNull();
    expect(verifySpaceRtcTicket('garbage')).toBeNull();
  });
});
