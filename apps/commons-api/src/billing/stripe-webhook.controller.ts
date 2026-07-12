import {
  Controller,
  Post,
  Req,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { CreditService } from '~/credit/credit.service';
import { Public } from '~/modules/auth';
import { StripeProvider } from './stripe.provider';
import { EntitlementsService } from './entitlements.service';
import { PLANS, planKeyFromPriceId } from './plan-catalog';

/**
 * Stripe webhook receiver. This is the single writer of subscription state and
 * the only place purchases are turned into credit grants.
 *
 * Idempotency has two layers:
 *   1. stripe_webhook_event is insert-first (PK = Stripe event id); a duplicate
 *      delivery short-circuits.
 *   2. every credit grant uses a deterministic idempotencyKey derived from the
 *      Stripe object id, so even a re-processed event cannot double-grant.
 */
@Controller('v1/billing')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly stripe: StripeProvider,
    private readonly credits: CreditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Public()
  @Post('webhook')
  async handle(@Req() req: RawBodyRequest<Request>) {
    const sig = req.headers['stripe-signature'];
    if (!sig || !req.rawBody) {
      throw new BadRequestException('Missing signature or body');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.stripe.webhooks.constructEvent(
        req.rawBody,
        sig as string,
        this.stripe.webhookSecret,
      );
    } catch (err: any) {
      this.logger.warn(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Invalid signature');
    }

    // Insert-first idempotency lock. If the event already exists, skip.
    const [locked] = await this.db
      .insert(schema.stripeWebhookEvent)
      .values({
        eventId: event.id,
        type: event.type,
        status: 'processing',
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: schema.stripeWebhookEvent.eventId })
      .returning();

    if (!locked) {
      this.logger.log(`Duplicate webhook ${event.id} (${event.type}) — skipped`);
      return { received: true, duplicate: true };
    }

    try {
      await this.dispatch(event);
      await this.db
        .update(schema.stripeWebhookEvent)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(schema.stripeWebhookEvent.eventId, event.id));
    } catch (err: any) {
      this.logger.error(
        `Webhook ${event.id} (${event.type}) failed: ${err.message}`,
      );
      await this.db
        .update(schema.stripeWebhookEvent)
        .set({ status: 'failed', error: String(err.message).slice(0, 1000) })
        .where(eq(schema.stripeWebhookEvent.eventId, event.id));
      // Surface 500 so Stripe retries.
      throw err;
    }

    return { received: true };
  }

  private async dispatch(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return this.onSubscriptionChanged(
          event.data.object as Stripe.Subscription,
        );
      case 'invoice.paid':
        return this.onInvoicePaid(event.data.object as Stripe.Invoice);
      case 'invoice.payment_failed':
        return this.onInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
        );
      default:
        this.logger.debug(`Unhandled webhook type ${event.type}`);
    }
  }

  /** One-time top-up: grant the pack's credits once, keyed on the session id. */
  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (session.mode !== 'payment') return; // subscriptions handled elsewhere
    if (session.payment_status !== 'paid') return;

    const principalId = session.metadata?.principalId;
    const credits = Number(session.metadata?.credits);
    if (!principalId || !Number.isFinite(credits) || credits <= 0) {
      this.logger.warn(
        `checkout.session.completed ${session.id} missing top-up metadata`,
      );
      return;
    }
    await this.credits.grant({
      principalId,
      principalType: 'user',
      amount: credits,
      eventType: 'credit_topup',
      sourcePlatform: 'agent_commons',
      idempotencyKey: `stripe:${session.id}`,
      description: 'Credit top-up purchase',
      metadata: {
        stripeSessionId: session.id,
        packKey: session.metadata?.packKey,
        amountTotal: session.amount_total,
      },
      createdBy: 'stripe',
    });
    this.logger.log(`Granted ${credits} top-up credits to ${principalId}`);
  }

  /** Upsert the local subscription mirror. */
  private async onSubscriptionChanged(sub: Stripe.Subscription) {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const customer = await this.db.query.billingCustomer.findFirst({
      where: eq(schema.billingCustomer.stripeCustomerId, customerId),
    });
    if (!customer) {
      this.logger.warn(`Subscription ${sub.id} for unknown customer ${customerId}`);
      return;
    }

    const priceId = sub.items.data[0]?.price?.id ?? null;
    const planKey = planKeyFromPriceId(priceId) ?? 'free';
    const status = sub.status === 'canceled' ? 'canceled' : sub.status;
    // Period bounds live on the subscription in this API version.
    const periodStart = (sub as any).current_period_start as number | undefined;
    const periodEnd = (sub as any).current_period_end as number | undefined;

    const values = {
      principalId: customer.principalId,
      workspaceId: customer.workspaceId,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerId,
      planKey,
      status,
      stripePriceId: priceId,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000) : null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      updatedAt: new Date(),
    };

    await this.db
      .insert(schema.subscription)
      .values(values)
      .onConflictDoUpdate({
        target: schema.subscription.stripeSubscriptionId,
        set: values,
      });
    this.entitlements.invalidate(customer.principalId);
    this.logger.log(
      `Subscription ${sub.id} -> ${planKey}/${status} for ${customer.principalId}`,
    );
  }

  /** Recurring subscription payment: grant the plan's monthly credits once per invoice. */
  private async onInvoicePaid(invoice: Stripe.Invoice) {
    const line: any = invoice.lines?.data?.[0];
    const priceId: string | null =
      line?.price?.id ?? line?.pricing?.price_details?.price ?? null;
    const planKey = planKeyFromPriceId(priceId);
    // Only subscription invoices grant plan credits; skip one-off invoices.
    if (!planKey || planKey === 'free') return;

    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;
    if (!customerId) return;
    const customer = await this.db.query.billingCustomer.findFirst({
      where: eq(schema.billingCustomer.stripeCustomerId, customerId),
    });
    if (!customer) return;

    const plan = PLANS[planKey];
    const periodEnd = line?.period?.end as number | undefined;
    const expiresAt = periodEnd
      ? new Date(periodEnd * 1000 + 3 * 86400_000) // +3d grace
      : undefined;

    await this.credits.grant({
      principalId: customer.principalId,
      principalType: 'user',
      amount: plan.monthlyCredits,
      eventType: 'subscription_grant',
      sourcePlatform: 'agent_commons',
      idempotencyKey: `stripe:invoice:${invoice.id}`,
      description: `${plan.name} monthly credits`,
      metadata: { stripeInvoiceId: invoice.id, planKey },
      createdBy: 'stripe',
      expiresAt,
    });
    this.logger.log(
      `Granted ${plan.monthlyCredits} ${plan.name} credits to ${customer.principalId}`,
    );
  }

  private async onInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const subId =
      typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;
    if (!subId) return;
    const [updated] = await this.db
      .update(schema.subscription)
      .set({ status: 'past_due', updatedAt: new Date() })
      .where(eq(schema.subscription.stripeSubscriptionId, subId))
      .returning();
    if (updated) this.entitlements.invalidate(updated.principalId);
  }
}
