import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { StripeProvider } from './stripe.provider';
import { EntitlementsService } from './entitlements.service';
import {
  DEFAULT_PLAN,
  PLANS,
  PlanKey,
  TOPUP_PACKS,
  planFromKey,
} from './plan-catalog';

interface Principal {
  principalId: string;
  workspaceId?: string | null;
  email?: string | null;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly stripe: StripeProvider,
    private readonly entitlements: EntitlementsService,
  ) {}

  private appEnv(): string {
    return process.env.APP_ENV || process.env.NODE_ENV || 'development';
  }

  private appOrigin(): string {
    // Where Stripe should send the user back to after checkout/portal.
    return (
      process.env.APP_ORIGIN ||
      process.env.CORS_ORIGIN?.split(',')[0]?.trim() ||
      'http://localhost:3000'
    );
  }

  /** Find or create the Stripe customer for a principal. */
  async getOrCreateCustomer(principal: Principal): Promise<string> {
    const existing = await this.db.query.billingCustomer.findFirst({
      where: eq(schema.billingCustomer.principalId, principal.principalId),
    });
    if (existing) return existing.stripeCustomerId;

    const customer = await this.stripe.stripe.customers.create({
      email: principal.email ?? undefined,
      metadata: {
        principalId: principal.principalId,
        workspaceId: principal.workspaceId ?? '',
        env: this.appEnv(),
      },
    });

    await this.db
      .insert(schema.billingCustomer)
      .values({
        principalId: principal.principalId,
        workspaceId: principal.workspaceId ?? null,
        stripeCustomerId: customer.id,
        email: principal.email ?? null,
      })
      .onConflictDoNothing({ target: schema.billingCustomer.principalId });

    // Re-read to be robust against a concurrent insert.
    const row = await this.db.query.billingCustomer.findFirst({
      where: eq(schema.billingCustomer.principalId, principal.principalId),
    });
    return row?.stripeCustomerId ?? customer.id;
  }

  private priceId(env: string | undefined): string {
    const id = env ? process.env[env] : undefined;
    if (!id) {
      throw new BadRequestException(
        'This plan is not available (missing Stripe price configuration).',
      );
    }
    return id;
  }

  /** Create a Checkout Session for a subscription plan. */
  async createSubscriptionCheckout(
    principal: Principal,
    planKey: PlanKey,
  ): Promise<{ url: string }> {
    const plan = PLANS[planKey];
    if (!plan || planKey === 'free') {
      throw new BadRequestException('Invalid subscription plan');
    }
    const existing = await this.db.query.subscription.findFirst({
      where: eq(schema.subscription.principalId, principal.principalId),
      orderBy: desc(schema.subscription.updatedAt),
    });
    if (
      existing &&
      ['active', 'trialing', 'past_due'].includes(existing.status)
    ) {
      // Keep one subscription per principal. Stripe Portal is configured to
      // handle upgrades/downgrades without creating duplicate subscriptions.
      return this.createPortalSession(principal);
    }
    const customerId = await this.getOrCreateCustomer(principal);
    const session = await this.stripe.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.priceId(plan.stripePriceEnv), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${this.appOrigin()}/settings/billing?checkout=success`,
      cancel_url: `${this.appOrigin()}/settings/billing?checkout=cancelled`,
      metadata: {
        principalId: principal.principalId,
        planKey,
        env: this.appEnv(),
      },
    });
    if (!session.url)
      throw new BadRequestException('Failed to create checkout');
    return { url: session.url };
  }

  /** Create a Checkout Session for a one-time credit top-up pack. */
  async createTopupCheckout(
    principal: Principal,
    packKey: string,
  ): Promise<{ url: string }> {
    const pack = TOPUP_PACKS[packKey];
    if (!pack) throw new BadRequestException('Invalid top-up pack');
    const customerId = await this.getOrCreateCustomer(principal);
    const session = await this.stripe.stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: this.priceId(pack.stripePriceEnv), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${this.appOrigin()}/settings/billing?topup=success`,
      cancel_url: `${this.appOrigin()}/settings/billing?topup=cancelled`,
      metadata: {
        principalId: principal.principalId,
        packKey,
        credits: String(pack.credits),
        env: this.appEnv(),
      },
    });
    if (!session.url)
      throw new BadRequestException('Failed to create checkout');
    return { url: session.url };
  }

  /** Create a Billing Portal session so the user can manage/cancel. */
  async createPortalSession(principal: Principal): Promise<{ url: string }> {
    const customerId = await this.getOrCreateCustomer(principal);
    const session = await this.stripe.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${this.appOrigin()}/settings/billing`,
    });
    return { url: session.url };
  }

  /** Recent invoices for the principal (from Stripe), for billing history. */
  async listInvoices(principalId: string, limit = 12) {
    const row = await this.db.query.billingCustomer.findFirst({
      where: eq(schema.billingCustomer.principalId, principalId),
    });
    if (!row || !this.stripe.configured) return [];
    const invoices = await this.stripe.stripe.invoices.list({
      customer: row.stripeCustomerId,
      limit,
    });
    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      created: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      amountPaid: inv.amount_paid,
      amountDue: inv.amount_due,
      currency: inv.currency,
      status: inv.status,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      pdf: inv.invoice_pdf,
    }));
  }

  /** Saved payment methods for the principal (from Stripe), for display. */
  async listPaymentMethods(principalId: string) {
    const row = await this.db.query.billingCustomer.findFirst({
      where: eq(schema.billingCustomer.principalId, principalId),
    });
    if (!row || !this.stripe.configured) {
      return { defaultPaymentMethodId: null, paymentMethods: [] };
    }
    const [customer, methods] = await Promise.all([
      this.stripe.stripe.customers.retrieve(row.stripeCustomerId),
      this.stripe.stripe.paymentMethods.list({
        customer: row.stripeCustomerId,
        type: 'card',
      }),
    ]);
    const defaultPm =
      customer && !('deleted' in customer)
        ? ((customer.invoice_settings?.default_payment_method as string) ??
          null)
        : null;
    return {
      defaultPaymentMethodId: defaultPm,
      paymentMethods: methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? 'card',
        last4: pm.card?.last4 ?? '••••',
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
      })),
    };
  }

  /** Current plan + entitlements for a principal. */
  async getSubscription(principalId: string) {
    const plan = await this.entitlements.getPlan(principalId);
    const row = await this.db.query.subscription.findFirst({
      where: eq(schema.subscription.principalId, principalId),
      orderBy: desc(schema.subscription.updatedAt),
    });
    return {
      planKey: plan.key,
      planName: plan.name,
      monthlyCredits: plan.monthlyCredits,
      entitlements: plan.entitlements,
      status: row?.status ?? (plan.key === DEFAULT_PLAN ? 'free' : 'unknown'),
      currentPeriodEnd: row?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    };
  }

  getCatalog() {
    return {
      creditsPerUsd: Number(process.env.CREDIT_UNITS_PER_USD || 1000),
      plans: Object.values(PLANS).map((plan) => ({
        key: plan.key,
        name: plan.name,
        priceUsd: plan.priceUsd,
        monthlyCredits: plan.monthlyCredits,
        entitlements: plan.entitlements,
      })),
      topups: Object.values(TOPUP_PACKS).map((pack) => ({
        key: pack.key,
        name: pack.name,
        credits: pack.credits,
        priceUsd: pack.priceUsd,
      })),
    };
  }
}
