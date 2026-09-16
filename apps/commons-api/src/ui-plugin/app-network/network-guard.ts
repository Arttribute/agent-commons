import { BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

/**
 * Commons apps may reach public services only. Every outbound connection made
 * on an app's behalf resolves its host and refuses loopback, private,
 * link-local, carrier-grade NAT, multicast and reserved ranges, so an app
 * cannot use Commons servers to probe internal infrastructure.
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) {
    const normalized = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return (
      normalized === '::' ||
      normalized === '::1' ||
      /^f[cd][0-9a-f]{2}:/.test(normalized) ||
      /^fe[89ab][0-9a-f]:/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('64:ff9b:') ||
      normalized.startsWith('2001:db8:')
    );
  }
  return true;
}

function isPrivateIPv4(address: string) {
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function privateNetworkAllowed() {
  return (
    process.env.COMMONS_APPS_ALLOW_PRIVATE_NETWORK === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * A `lookup` for node:http(s) and database drivers. Validation happens on the
 * address actually used for the socket, which closes DNS rebinding gaps
 * between a pre-flight check and the connection.
 */
export function guardedLookup(
  hostname: string,
  options: any,
  callback: (...args: any[]) => void,
) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : (options ?? {});
  dnsLookup(hostname, { ...opts, all: true }, (error, addresses) => {
    if (error) return cb(error);
    const list =
      (addresses as unknown as Array<{ address: string; family: number }>) ??
      [];
    if (!list.length) return cb(new Error(`Could not resolve ${hostname}`));
    if (!privateNetworkAllowed()) {
      const blocked = list.find((entry) => isPrivateAddress(entry.address));
      if (blocked) {
        return cb(
          Object.assign(
            new Error(`${hostname} resolves to a private network address`),
            { code: 'COMMONS_APP_PRIVATE_NETWORK' },
          ),
        );
      }
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

/** Pre-flight check used before handing a host to a third-party driver. */
export async function assertPublicHostname(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (privateNetworkAllowed()) return;
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    throw new BadRequestException('Private network hosts are not allowed');
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new BadRequestException('Private network hosts are not allowed');
    }
    return;
  }
  await new Promise<void>((resolve, reject) =>
    guardedLookup(host, { all: true }, (error: Error | null) =>
      error
        ? reject(
            new BadRequestException(
              (error as any).code === 'COMMONS_APP_PRIVATE_NETWORK'
                ? error.message
                : `Could not resolve ${host}`,
            ),
          )
        : resolve(),
    ),
  );
}

/** HTTPS request that connects only to public addresses and never follows redirects. */
export function guardedHttpsRequest(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
  options: {
    maxResponseBytes: number;
    timeoutMs: number;
    returnHeaders?: string[];
  },
) {
  if (url.protocol !== 'https:') {
    return Promise.reject(
      new BadRequestException('Only https requests are allowed'),
    );
  }
  return new Promise<{
    status: number;
    headers: Record<string, string>;
    body: unknown;
  }>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method,
        headers,
        lookup: guardedLookup as any,
        timeout: options.timeoutMs,
      },
      (response) => {
        const status = response.statusCode ?? 502;
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({
            status,
            headers: {},
            body: { error: 'Redirects are not followed for app requests' },
          });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > options.maxResponseBytes) {
            request.destroy(
              new BadRequestException('The external response is too large'),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const contentType = String(response.headers['content-type'] ?? '');
          let parsed: unknown = text;
          if (contentType.includes('json')) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
          }
          const returned: Record<string, string> = {};
          for (const name of options.returnHeaders ?? []) {
            const value = response.headers[name];
            if (typeof value === 'string') returned[name] = value.slice(0, 300);
          }
          resolve({ status, headers: returned, body: parsed });
        });
        response.on('error', reject);
      },
    );
    request.on('timeout', () =>
      request.destroy(
        new BadRequestException('The external service timed out'),
      ),
    );
    request.on('error', (error: any) => {
      if (error instanceof BadRequestException) return reject(error);
      reject(
        new BadRequestException(
          error?.code === 'COMMONS_APP_PRIVATE_NETWORK'
            ? error.message
            : 'The external service could not be reached',
        ),
      );
    });
    if (body) request.write(body);
    request.end();
  });
}
