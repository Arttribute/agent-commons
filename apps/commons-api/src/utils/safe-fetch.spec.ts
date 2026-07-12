import { isBlockedIp } from './safe-fetch';

describe('isBlockedIp', () => {
  it('blocks IPv4 private, loopback, link-local and metadata ranges', () => {
    for (const ip of [
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata
      '0.0.0.0',
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it('allows public IPv4 addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });

  it('blocks IPv6 loopback, link-local, ULA and mapped-private', () => {
    for (const ip of [
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      '::ffff:10.0.0.1', // IPv4-mapped private
      '::ffff:169.254.169.254',
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it('allows public IPv6 and mapped-public', () => {
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('treats non-IP strings as unsafe', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('')).toBe(true);
  });
});
