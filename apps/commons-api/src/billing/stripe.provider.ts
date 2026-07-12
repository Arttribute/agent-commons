import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

/**
 * Thin wrapper around the Stripe SDK. STRIPE_SECRET_KEY is test-mode on staging
 * and live on production; the same code path serves both. Lazily constructed so
 * the app can boot in environments where billing is not configured yet.
 */
@Injectable()
export class StripeProvider {
  private readonly logger = new Logger(StripeProvider.name);
  private client: Stripe | null = null;

  get configured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  get stripe(): Stripe {
    if (!this.client) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
      }
      this.client = new Stripe(key, {
        apiVersion: '2025-02-24.acacia',
        appInfo: { name: 'agent-commons' },
      });
    }
    return this.client;
  }

  get webhookSecret(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    return secret;
  }
}
