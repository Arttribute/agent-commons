import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  Public,
  RateLimit,
  resolveCallerId,
  type ApiKeyPrincipal,
} from '~/modules/auth';
import { EventRegistrationService } from './event-registration.service';

function caller(req: Request) {
  const principal = (req as any).principal as ApiKeyPrincipal | undefined;
  const id = resolveCallerId(req);
  if (!id || principal?.principalType === 'agent')
    throw new UnauthorizedException('Sign in to manage registrations');
  return id;
}
@Controller({ version: '1', path: 'projects/:projectId/events' })
export class ProjectEventController {
  constructor(private readonly events: EventRegistrationService) {}
  @Get(':eventId/discounts') discounts(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('eventId') event: string,
  ) {
    return this.events
      .discounts(caller(req), id, event)
      .then((data) => ({ data }));
  }
  @Post(':eventId/discounts') discount(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('eventId') event: string,
    @Body() body: unknown,
  ) {
    return this.events
      .saveDiscount(caller(req), id, event, body)
      .then((data) => ({ data }));
  }
  @Get() list(@Req() req: Request, @Param('projectId') id: string) {
    return this.events.list(caller(req), id).then((data) => ({ data }));
  }
  @Post() create(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: unknown,
  ) {
    return this.events.save(caller(req), id, body).then((data) => ({ data }));
  }
  @Get('paystack') account(
    @Req() req: Request,
    @Param('projectId') id: string,
  ) {
    return this.events
      .paymentAccount(caller(req), id)
      .then((data) => ({ data }));
  }
  @Post('paystack') connect(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: unknown,
  ) {
    return this.events
      .connectPaystack(caller(req), id, body)
      .then((data) => ({ data }));
  }
  @Patch(':eventId') update(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('eventId') event: string,
    @Body() body: unknown,
  ) {
    return this.events
      .save(caller(req), id, body, event)
      .then((data) => ({ data }));
  }
  @Get(':eventId/registrations') @Header('Cache-Control', 'no-store') bookings(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('eventId') event: string,
    @Query('offset') offset?: string,
  ) {
    return this.events
      .registrations(caller(req), id, event, offset ? Number(offset) : 0)
      .then((data) => ({ data }));
  }
}
@Public()
@Controller({ version: '1', path: 'public-events' })
export class PublicEventController {
  constructor(private readonly events: EventRegistrationService) {}
  @Post(':slug/quote')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 20, windowMs: 60000, keyStrategy: 'ip' })
  quote(@Param('slug') slug: string, @Body() body: unknown) {
    return this.events.quote(slug, body).then((data) => ({ data }));
  }
  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 120, windowMs: 60000, keyStrategy: 'ip' })
  get(@Param('slug') slug: string) {
    return this.events.publicEvent(slug).then((data) => ({ data }));
  }
  @Post(':slug/checkout')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 20, windowMs: 60000, keyStrategy: 'ip' })
  checkout(@Param('slug') slug: string, @Body() body: unknown) {
    return this.events.checkout(slug, body).then((data) => ({ data }));
  }
  @Get(':slug/payments/:reference')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 120, windowMs: 60000, keyStrategy: 'ip' })
  status(@Param('slug') slug: string, @Param('reference') ref: string) {
    return this.events.status(slug, ref).then((data) => ({ data }));
  }
  @Post(':slug/payments/:reference/verify')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 12, windowMs: 60000, keyStrategy: 'ip' })
  verify(@Param('slug') slug: string, @Param('reference') ref: string) {
    return this.events.verify(slug, ref).then((data) => ({ data }));
  }
}
@Public()
@Controller({ version: '1', path: 'event-payments/paystack' })
export class EventPaymentWebhookController {
  constructor(private readonly events: EventRegistrationService) {}
  @Post(':accountId')
  @HttpCode(200)
  @RateLimit({ limit: 180, windowMs: 60000, keyStrategy: 'ip' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Param('accountId') id: string,
    @Headers('x-paystack-signature') legacy?: string,
    @Headers('paystack-signature') modern?: string,
  ) {
    return this.events.webhook(id, req.rawBody || Buffer.alloc(0), {
      legacy,
      modern,
    });
  }
}
