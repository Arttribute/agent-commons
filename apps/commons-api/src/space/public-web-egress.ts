import { lookup } from 'node:dns/promises';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect, isIP } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import * as ipaddr from 'ipaddr.js';

type ResolvedAddress = { address: string; family: number };
export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const systemResolver: AddressResolver = (hostname) => lookup(hostname, { all: true });

/** Restrict capture to ordinary web ports; each network connection pins its checked IP. */
export function validatePublicWebUrl(input: string): URL {
  const url = new URL(input);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password) {
    throw new Error('Web capture requires a public HTTP or HTTPS URL without credentials.');
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (port !== 80 && port !== 443) throw new Error('Web capture permits only ports 80 and 443.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) throw new Error('Web capture cannot access a private network address.');
  return url;
}

function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

/** Reject mixed DNS answers, then connect to the checked address directly. */
export async function resolvePublicIpv4(hostname: string, resolver: AddressResolver = systemResolver): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, '');
  const answers = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolver(host);
  if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address))) {
    throw new Error('Web capture cannot access a private network address.');
  }
  const ipv4 = answers.find((answer) => answer.family === 4 && isIP(answer.address) === 4);
  if (!ipv4) throw new Error('Web capture requires a public IPv4 address.');
  return ipv4.address;
}

/** Chrome's HTTP proxy validates every page request, including redirects and subresources. */
export class PublicWebEgressProxy {
  private readonly tunnels = new Set<Duplex>();
  private readonly server = createServer((request, response) => void this.forwardHttp(request, response));
  private port?: number;
  private starting?: Promise<number>;

  constructor(private readonly resolver: AddressResolver = systemResolver) {
    this.server.on('connect', (request, socket, head) => void this.forwardConnect(request, socket, head));
    this.server.on('upgrade', (request, socket, head) => void this.forwardUpgrade(request, socket, head));
  }

  async listen(): Promise<number> {
    if (this.port) return this.port;
    if (!this.starting) {
      this.starting = new Promise<number>((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(0, '127.0.0.1', () => {
          this.server.off('error', reject);
          this.port = (this.server.address() as AddressInfo).port;
          resolve(this.port);
        });
      });
    }
    try { return await this.starting; }
    finally { this.starting = undefined; }
  }

  async close(): Promise<void> {
    for (const socket of this.tunnels) socket.destroy();
    this.tunnels.clear();
    if (!this.server.listening) return;
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    this.port = undefined;
  }

  private async forwardHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!request.url || request.method === 'CONNECT') throw new Error('Invalid proxy request.');
      const url = validatePublicWebUrl(request.url);
      if (url.protocol !== 'http:') throw new Error('HTTPS requires a CONNECT tunnel.');
      const address = await resolvePublicIpv4(url.hostname, this.resolver);
      const { 'proxy-authorization': _authorization, 'proxy-connection': _connection, ...headers } = request.headers;
      const upstream = httpRequest({
        hostname: address,
        port: Number(url.port || 80),
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: { ...headers, host: url.host, connection: 'close' },
        timeout: 30_000,
      }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on('timeout', () => upstream.destroy(new Error('Web capture request timed out.')));
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.on('aborted', () => upstream.destroy());
      request.pipe(upstream);
    } catch {
      response.writeHead(403);
      response.end('Web capture blocked this network address.');
    }
  }

  private async forwardConnect(request: IncomingMessage, client: Duplex, head: Buffer): Promise<void> {
    try {
      const url = validatePublicWebUrl(`https://${request.url || ''}`);
      if (Number(url.port || 443) !== 443) throw new Error('Invalid HTTPS port.');
      const address = await resolvePublicIpv4(url.hostname, this.resolver);
      const upstream = connect({ host: address, port: 443 });
      this.tunnels.add(client);
      this.tunnels.add(upstream);
      const cleanup = () => { this.tunnels.delete(client); this.tunnels.delete(upstream); };
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.once('close', () => { cleanup(); upstream.destroy(); });
      upstream.once('close', () => { cleanup(); client.destroy(); });
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    }
  }

  private async forwardUpgrade(request: IncomingMessage, client: Duplex, head: Buffer): Promise<void> {
    try {
      const target = (request.url || '').replace(/^ws:/i, 'http:');
      const url = validatePublicWebUrl(target);
      if (url.protocol !== 'http:') throw new Error('Secure WebSockets require CONNECT.');
      const address = await resolvePublicIpv4(url.hostname, this.resolver);
      const upstream = connect({ host: address, port: Number(url.port || 80) });
      this.tunnels.add(client);
      this.tunnels.add(upstream);
      const cleanup = () => { this.tunnels.delete(client); this.tunnels.delete(upstream); };
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.once('close', () => { cleanup(); upstream.destroy(); });
      upstream.once('close', () => { cleanup(); client.destroy(); });
      upstream.once('connect', () => {
        const headers: Record<string, string | string[] | undefined> = { ...request.headers, host: url.host };
        delete headers['proxy-authorization'];
        delete headers['proxy-connection'];
        const lines = [`${request.method || 'GET'} ${url.pathname}${url.search} HTTP/1.1`];
        for (const [name, value] of Object.entries(headers)) {
          if (value !== undefined) lines.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`);
        }
        upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    }
  }
}

/** Fetch the optional tool manifest without redirects or a second DNS resolution. */
export async function fetchPublicJson(urlString: string, resolver: AddressResolver = systemResolver): Promise<unknown | null> {
  const url = validatePublicWebUrl(urlString);
  const address = await resolvePublicIpv4(url.hostname, resolver);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const client = request(url, {
      method: 'GET',
      timeout: 8_000,
      lookup: (_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => callback(null, address, 4),
    }, (response) => {
      if (response.statusCode !== 200) { response.resume(); resolve(null); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1_000_000) { client.destroy(new Error('Tool manifest exceeds 1 MB.')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    client.on('timeout', () => client.destroy(new Error('Tool discovery timed out.')));
    client.on('error', reject);
    client.end();
  });
}
