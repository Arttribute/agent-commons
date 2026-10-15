import { Body, Controller, ForbiddenException, Get, Post, Req, Version } from '@nestjs/common';
import { RateLimit, resolveCallerId } from '~/modules/auth';
import { ReferralService, type ReferralActivation } from './referral.service';

@Controller('referrals')
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

  private user(req: any) {
    const id = resolveCallerId(req) ?? req.principal?.principalId;
    if (!id?.startsWith('usr_')) throw new ForbiddenException('Sign in to invite friends.');
    return id as string;
  }

  private appService(req: any) {
    // Only the web app's authenticated signup callback can attest activation
    // or delivery. User tokens, API keys and other product services cannot.
    if (!this.isAppService(req)) {
      throw new ForbiddenException('Agent Commons service authentication required.');
    }
  }

  private isAppService(req: any) {
    const expected = process.env.REFERRAL_APP_SERVICE_PRINCIPAL || (process.env.APP_ENV === 'staging' ? 'svc_agent_commons_staging' : 'svc_agent_commons');
    return req.principal?.principalType === 'service' && req.principal?.principalId === expected;
  }

  @Get()
  @Version('1')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
  async summary(@Req() req: any) {
    const trustedApp = this.isAppService(req);
    const email = trustedApp && typeof req.headers['x-referral-email'] === 'string' ? req.headers['x-referral-email'] : undefined;
    return { data: await this.referrals.summary(this.user(req), email) };
  }

  @Post('activate')
  @Version('1')
  @RateLimit({ limit: 120, windowMs: 60_000, keyStrategy: 'user' })
  async activate(@Req() req: any, @Body() body: ReferralActivation) {
    this.appService(req);
    return { data: await this.referrals.activate(body) };
  }

  @Post('invitations')
  @Version('1')
  @RateLimit({ limit: 5, windowMs: 60_000, keyStrategy: 'user' })
  async invitation(@Req() req: any, @Body() body: { email?: unknown }) {
    this.appService(req);
    return { data: await this.referrals.reserveInvitation(this.user(req), body.email) };
  }

  @Post('invitations/complete')
  @Version('1')
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'user' })
  async complete(@Req() req: any, @Body() body: { invitationId: string; sent: boolean }) {
    this.appService(req);
    return { data: await this.referrals.completeInvitation(this.user(req), body.invitationId, body.sent === true) };
  }
}
