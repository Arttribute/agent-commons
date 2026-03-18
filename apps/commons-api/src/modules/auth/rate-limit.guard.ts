import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  /** Maximum requests allowed within the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Key to identify the caller (default: agentId from body, then IP) */
  keyStrategy?: 'agent' | 'ip' | 'user';
}

/** Decorate a controller method to set rate-limit options */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface BucketEntry {
  count: number;
  windowStart: number;
}

/**
 * In-process sliding-window rate limiter guard.
 *
 * Uses a Map<key, BucketEntry> in memory. Works well for single-process
 * deployments (Cloud Run single instance). For multi-instance deployments,
 * replace with Redis-backed counting (e.g. @nestjs/throttler + redis store).
 *
 * Defaults (when no @RateLimit decorator is present):
 *   - 120 tool calls per agent per minute
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, BucketEntry>();

  // Clean stale buckets every 5 minutes to prevent memory leaks
  private readonly cleanupTimer = setInterval(() => this.cleanStaleBuckets(), 300_000);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts: RateLimitOptions = this.reflector.getAllAndOverride(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? { limit: 120, windowMs: 60_000, keyStrategy: 'agent' };

    const req = context.switchToHttp().getRequest<Request>();
    const key = this.resolveKey(req, opts.keyStrategy ?? 'agent');

    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= opts.windowMs) {
      // Start new window
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    bucket.count++;

    if (bucket.count > opts.limit) {
      const retryAfterSec = Math.ceil((opts.windowMs - (now - bucket.windowStart)) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Retry after ${retryAfterSec}s.`,
          retryAfter: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveKey(req: Request, strategy: string): string {
    switch (strategy) {
      case 'agent': {
        // Body may contain metadata.agentId (tool calls) or agentId directly
        const body = (req as any).body ?? {};
        const agentId = body.metadata?.agentId ?? body.agentId;
        return agentId ? `agent:${agentId}` : `ip:${req.ip}`;
      }
      case 'user': {
        const initiator = req.headers['x-initiator'] as string;
        return initiator ? `user:${initiator}` : `ip:${req.ip}`;
      }
      case 'ip':
      default:
        return `ip:${req.ip}`;
    }
  }

  private cleanStaleBuckets(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      // Remove buckets older than 10 minutes
      if (now - bucket.windowStart > 600_000) {
        this.buckets.delete(key);
      }
    }
  }
}
