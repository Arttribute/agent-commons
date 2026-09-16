import { buildTargetUrl } from './app-network.service';
import { isPrivateAddress } from './network-guard';

describe('buildTargetUrl', () => {
  const connection = {
    name: 'Weather',
    baseUrl: 'https://api.example.com/v2',
    pathPrefixes: ['/forecast'],
  };

  it('keeps requests under the base URL and allowed prefixes', () => {
    expect(
      buildTargetUrl(connection, '/forecast/daily', {
        q: 'Nairobi',
        days: 3,
      }).toString(),
    ).toBe('https://api.example.com/v2/forecast/daily?q=Nairobi&days=3');
  });

  it('rejects traversal, other prefixes and absolute URLs', () => {
    expect(() =>
      buildTargetUrl(connection, '/forecast/../../admin', {}),
    ).toThrow();
    expect(() => buildTargetUrl(connection, '/forecasts', {})).toThrow(
      'does not allow',
    );
    expect(() => buildTargetUrl(connection, '//evil.test/x', {})).toThrow();
    expect(() => buildTargetUrl(connection, 'https://evil.test', {})).toThrow();
    expect(() =>
      buildTargetUrl(connection, '/forecast', { q: { a: 1 } }),
    ).toThrow('scalar');
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '104.16.0.1', '2606:4700::1111'])(
    'allows %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});
