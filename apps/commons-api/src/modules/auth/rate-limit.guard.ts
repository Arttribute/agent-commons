import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';

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
 * Distributed fixed-window limiter backed by Postgres. A memory fallback is
 * available only for local development or emergency rollback.
 *
 * Defaults (when no @RateLimit decorator is present):
 *   - 120 tool calls per agent per minute
 */
@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly buckets = new Map<string, BucketEntry>();

  // Clean stale buckets every 5 minutes to prevent memory leaks
  private readonly cleanupTimer = setInterval(
    () => this.cleanStaleBuckets(),
    300_000,
  );

  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts: RateLimitOptions = this.reflector.getAllAndOverride(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? { limit: 120, windowMs: 60_000, keyStrategy: 'agent' };

    const req = context.switchToHttp().getRequest<Request>();
    // Infrastructure liveness must not depend on Postgres. If the limiter's
    // store is unavailable, keeping /health reachable allows ECS to replace
    // the task instead of deadlocking a rollout on the same dependency.
    if (req.path === '/health') return true;
    // Route scoping prevents a restrictive endpoint (for example gifts) from
    // consuming the caller's allowance for unrelated reads in the same minute.
    const routeScope = `${context.getClass().name}:${context.getHandler().name}`;
    const key = `${routeScope}:${this.resolveKey(req, opts.keyStrategy ?? 'agent')}`;

    const now = Date.now();
    if (process.env.DISTRIBUTED_RATE_LIMIT_ENABLED !== 'false') {
      const windowStartMs = Math.floor(now / opts.windowMs) * opts.windowMs;
      // Raw sql fragments do not have Drizzle column encoders attached. The
      // postgres.js driver accepts ISO strings here, but not Date instances.
      const windowStart = new Date(windowStartMs).toISOString();
      const expiresAt = new Date(
        windowStartMs + Math.max(opts.windowMs * 2, 600_000),
      ).toISOString();
      const rows = (await this.db.execute(sql`
        insert into api_rate_limit_bucket (bucket_key, window_start, request_count, expires_at)
        values (${key}, ${windowStart}, 1, ${expiresAt})
        on conflict (bucket_key, window_start)
        do update set request_count = api_rate_limit_bucket.request_count + 1
        returning request_count
      `)) as any;
      const count = Number(rows?.[0]?.request_count ?? 1);
      if (count > opts.limit) {
        const retryAfterSec = Math.ceil(
          (windowStartMs + opts.windowMs - now) / 1000,
        );
        throw this.limitError(retryAfterSec);
      }
      return true;
    }

    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= opts.windowMs) {
      // Start new window
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    bucket.count++;

    if (bucket.count > opts.limit) {
      const retryAfterSec = Math.ceil(
        (opts.windowMs - (now - bucket.windowStart)) / 1000,
      );
      throw this.limitError(retryAfterSec);
    }

    return true;
  }

  private limitError(retryAfterSec: number) {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry after ${retryAfterSec}s.`,
        retryAfter: retryAfterSec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private resolveKey(req: Request, strategy: string): string {
    // Never key on caller-supplied body fields or headers — they are
    // trivially rotated to evade the limiter. The authenticated principal
    // (attached by ApiKeyGuard, which runs first) is the identity we trust;
    // unauthenticated traffic degrades to per-IP buckets.
    const principal = (req as any).principal as
      | { principalId?: string }
      | undefined;
    if (strategy !== 'ip' && principal?.principalId) {
      return `${strategy}:${principal.principalId}`;
    }
    return `ip:${req.ip}`;
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
