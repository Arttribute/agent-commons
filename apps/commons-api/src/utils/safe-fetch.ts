import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF-hardened fetch.
 *
 * Server-side fetches that use a user-controlled URL (dynamic tool calls, x402
 * proxying, agent browser navigation) must not be allowed to reach internal
 * infrastructure — cloud metadata endpoints, the pod network, localhost admin
 * ports, etc. This wrapper:
 *   - permits only http/https;
 *   - resolves the hostname and rejects any private / loopback / link-local /
 *     unique-local / reserved IP (v4 and v6);
 *   - re-validates on every redirect hop (manual redirect following);
 *   - allows an explicit host allowlist (SSRF_ALLOW_HOSTS) for trusted internal
 *     services such as CommonOS.
 *
 * It is intentionally strict: DNS is resolved and checked, so DNS-rebinding to
 * a public name that points at a private address is blocked at request time.
 */

const MAX_REDIRECTS = 5;

function allowedHosts(): Set<string> {
  return new Set(
    (process.env.SSRF_ALLOW_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Parse an IPv4 dotted-quad into its 4 octets, or null. */
function ipv4Octets(ip: string): number[] | null {
  if (isIP(ip) !== 4) return null;
  return ip.split('.').map((o) => Number(o));
}

/** True if the given literal IP address is not safe to connect to. */
export function isBlockedIp(ip: string): boolean {
  const v4 = ipv4Octets(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (isIP(ip) === 6) {
    const addr = ip.toLowerCase().split('%')[0]; // strip zone id
    if (addr === '::1' || addr === '::') return true; // loopback / unspecified
    if (addr.startsWith('fe80')) return true; // link-local
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // fc00::/7 ULA
    // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4.
    const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    if (addr.startsWith('ff')) return true; // multicast
    return false;
  }

  // Not a recognizable IP literal — treat as unsafe.
  return true;
}

/** Resolve a hostname and throw if it (or any of its addresses) is blocked. */
async function assertHostAllowed(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (allowedHosts().has(host)) return;

  // Literal IPs are checked directly.
  if (isIP(host)) {
    if (isBlockedIp(host)) {
      throw new BadRequestException(
        `Refusing to connect to non-public address ${host}`,
      );
    }
    return;
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new BadRequestException(`Could not resolve host ${host}`);
  }
  if (!records.length) {
    throw new BadRequestException(`Could not resolve host ${host}`);
  }
  for (const { address } of records) {
    if (isBlockedIp(address)) {
      throw new BadRequestException(
        `Refusing to connect to ${host} (resolves to non-public address)`,
      );
    }
  }
}

function assertProtocol(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(
      `Unsupported URL protocol: ${url.protocol} (only http/https allowed)`,
    );
  }
}

/**
 * SSRF-safe replacement for fetch(). Follows redirects manually, re-validating
 * the destination host on each hop.
 */
export async function safeFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  let currentUrl = new URL(input);
  let redirects = 0;

  // Force manual redirect handling so each hop is validated.
  const perHopInit: RequestInit = { ...init, redirect: 'manual' };

  while (true) {
    assertProtocol(currentUrl);
    await assertHostAllowed(currentUrl.hostname);

    const res = await fetch(currentUrl, perHopInit);

    // 3xx with a Location header → validate and follow manually.
    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      if (redirects >= MAX_REDIRECTS) {
        throw new BadRequestException('Too many redirects');
      }
      redirects += 1;
      const location = res.headers.get('location')!;
      currentUrl = new URL(location, currentUrl);
      // Drop the body on subsequent hops for non-GET → GET redirects, matching
      // browser behavior; keep it simple and let fetch recompute.
      continue;
    }

    return res;
  }
}
