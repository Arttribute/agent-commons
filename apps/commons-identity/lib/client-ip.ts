import { isIP } from "node:net";

/**
 * Better Auth reads the caller's address from this header only. The identity
 * app always rewrites it from the proxy headers below, so a value a client
 * sends is never trusted.
 */
export const CLIENT_IP_HEADER = "x-commons-client-ip";

/**
 * Production traffic reaches identity through CloudFront and then the ECS load
 * balancer, so `x-forwarded-for` arrives as "viewer, edge". Better Auth only
 * trusts a single-value header; without one it rate limits every caller from a
 * single shared bucket per path, which lets one busy client exhaust
 * `/oauth2/token` for the whole platform. Resolve the viewer here instead:
 * CloudFront's viewer address first, then the hop the load balancer saw.
 */
export function resolveClientIp(headers: Headers): string | null {
  const viewer = viewerAddressIp(headers.get("cloudfront-viewer-address"));
  if (viewer) return viewer;
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  const peer = hops.at(-1);
  return peer && isIP(peer) ? peer : null;
}

/** CloudFront sends "ip:port" for IPv4 and IPv6 viewers alike. */
function viewerAddressIp(value: string | null): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(":");
  if (separator <= 0) return null;
  const ip = value.slice(0, separator).replace(/^\[|\]$/g, "");
  return isIP(ip) ? ip : null;
}

export function withClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  const ip = resolveClientIp(request.headers);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  else headers.delete(CLIENT_IP_HEADER);
  return new Request(request, { headers });
}
