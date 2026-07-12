import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import { PlanKey } from './plan-catalog';

interface Caller {
  principalId: string;
  workspaceId?: string | null;
  email?: string | null;
}

function caller(req: Request): Caller {
  const principal = (req as any).principal as ApiKeyPrincipal | undefined;
  const principalId = resolveCallerId(req);
  if (!principalId) {
    throw new ForbiddenException('Authentication required');
  }
  return {
    principalId,
    workspaceId: principal?.workspaceId ?? null,
    // The commons-app proxy forwards the user's email in a header when known.
    email: (req.headers['x-user-email'] as string) || null,
  };
}

@Controller('v1/billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Current plan, status, entitlements. */
  @Get('subscription')
  async getSubscription(@Req() req: Request) {
    const data = await this.billing.getSubscription(caller(req).principalId);
    return { data };
  }

  /** Entitlements only (used by the frontend to pre-gate UI). */
  @Get('entitlements')
  async getEntitlements(@Req() req: Request) {
    const data = await this.entitlements.getEntitlements(
      caller(req).principalId,
    );
    return { data };
  }

  /** Start a subscription checkout for a plan. */
  @Post('checkout/subscription')
  async subscriptionCheckout(
    @Req() req: Request,
    @Body() body: { planKey: PlanKey },
  ) {
    const data = await this.billing.createSubscriptionCheckout(
      caller(req),
      body.planKey,
    );
    return { data };
  }

  /** Start a one-time credit top-up checkout. */
  @Post('checkout/topup')
  async topupCheckout(
    @Req() req: Request,
    @Body() body: { packKey: string },
  ) {
    const data = await this.billing.createTopupCheckout(
      caller(req),
      body.packKey,
    );
    return { data };
  }

  /** Open the Stripe billing portal. */
  @Post('portal')
  async portal(@Req() req: Request) {
    const data = await this.billing.createPortalSession(caller(req));
    return { data };
  }
}
