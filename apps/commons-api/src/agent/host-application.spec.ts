import { hostApplicationFromContext } from './host-application';

describe('host application context', () => {
  it('keeps safe navigation back to the authenticated host', () => {
    expect(hostApplicationFromContext(JSON.stringify({ hostApplication: { name: 'Common Business', url: 'https://example.com/dashboard?copilotSession=session' } }))).toEqual({ name: 'Common Business', url: 'https://example.com/dashboard?copilotSession=session' });
  });
  it.each([undefined, 'plain context', '{}', '{"hostApplication":{"name":"Business","url":"javascript:alert(1)"}}', '{"hostApplication":{"name":"Business","url":"https://user:pass@example.com"}}'])('ignores unsafe or ordinary contexts: %s', (input) => {
    expect(hostApplicationFromContext(input)).toBeUndefined();
  });
});
