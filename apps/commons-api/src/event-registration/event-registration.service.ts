import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import { EncryptionService } from '~/modules/encryption/encryption.service';
import { ProjectService } from '~/project/project.service';
import {
  checkoutInput,
  eventConfigSchema,
  parse,
  publicEventOrigin,
  referenceSchema,
  slugSchema,
  uuidSchema,
  type EventConfig,
} from './event-policy';
import {
  PaystackService,
  validPaystackSignature,
  type VerifiedCharge,
} from './paystack.service';

type EventRow = {
  event_id: string;
  project_id: string;
  owner_user_id: string;
  slug: string;
  status: string;
  config: EventConfig;
};
type Account = {
  account_id: string;
  project_id: string;
  mode: 'live' | 'test';
  credentials: { encryptedValue: string; iv: string; tag: string };
};
type Registration = {
  registration_id: string;
  event_id: string;
  account_id: string | null;
  reference: string;
  request_hash: string;
  status: string;
  payment_status: string;
  quantity: number;
  amount_minor: string | number;
  currency: string;
  checkout_url: string | null;
  expires_at: Date;
  paid_at: Date | null;
  payment_details?: {
    reason?: string;
    amountMinor?: number;
    currency?: string;
  };
};
const rows = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : (r as { rows?: T[] })?.rows || [];
const uniqueViolation = (e: any) =>
  e?.code === '23505' || e?.cause?.code === '23505';

@Injectable()
export class EventRegistrationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly projects: ProjectService,
    private readonly encryption: EncryptionService,
    private readonly paystack: PaystackService,
  ) {}

  private async owned(ownerId: string, projectId: string, eventId?: string) {
    await this.projects.requireProject(ownerId, projectId);
    if (!eventId) return;
    parse(uuidSchema, eventId);
    const [event] = rows<EventRow>(
      await this.db.execute(
        sql`SELECT * FROM project_event WHERE event_id=${eventId}::uuid AND project_id=${projectId}::uuid`,
      ),
    );
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }
  private privateEvent(e: EventRow) {
    return {
      eventId: e.event_id,
      slug: e.slug,
      status: e.status,
      config: e.config,
      registrationUrl: `${publicEventOrigin(e.config.surface)}/register/${e.slug}`,
    };
  }
  async list(ownerId: string, projectId: string) {
    await this.owned(ownerId, projectId);
    return rows<EventRow>(
      await this.db.execute(
        sql`SELECT * FROM project_event WHERE project_id=${projectId}::uuid ORDER BY created_at DESC`,
      ),
    ).map((e) => this.privateEvent(e));
  }
  async save(ownerId: string, projectId: string, body: any, eventId?: string) {
    const old = await this.owned(ownerId, projectId, eventId);
    const config = parse(eventConfigSchema, body?.config);
    const status = body?.status ?? old?.status ?? 'draft';
    if (!['draft', 'open', 'closed'].includes(status))
      throw new BadRequestException('Choose draft, open or closed');
    const slug = old?.slug ?? parse(slugSchema, body?.slug);
    if (config.pageSlug) {
      const [page] = rows(
        await this.db.execute(
          sql`SELECT page_id FROM project_page WHERE project_id=${projectId}::uuid AND slug=${config.pageSlug} AND deleted_at IS NULL`,
        ),
      );
      if (!page)
        throw new BadRequestException(
          'Choose a page belonging to this project',
        );
    }
    if (
      status === 'open' &&
      config.amountMinor > 0 &&
      !(await this.activeAccount(projectId))
    )
      throw new BadRequestException(
        'Connect Paystack before opening paid registration',
      );
    try {
      const event = await this.db.transaction(async (tx) => {
        if (old) {
          await tx.execute(
            sql`SELECT event_id FROM project_event WHERE event_id=${old.event_id}::uuid FOR UPDATE`,
          );
          if (
            config.capacity !== null &&
            config.capacity < (await this.occupied(tx, old.event_id))
          )
            throw new ConflictException(
              'Capacity cannot be lower than confirmed bookings and active checkouts',
            );
          return rows<EventRow>(
            await tx.execute(
              sql`UPDATE project_event SET config=${JSON.stringify(config)}::jsonb,status=${status},updated_at=now() WHERE event_id=${old.event_id}::uuid RETURNING *`,
            ),
          )[0];
        }
        return rows<EventRow>(
          await tx.execute(
            sql`INSERT INTO project_event (project_id,owner_user_id,slug,status,config) VALUES (${projectId}::uuid,${ownerId},${slug},${status},${JSON.stringify(config)}::jsonb) RETURNING *`,
          ),
        )[0];
      });
      return this.privateEvent(event);
    } catch (e) {
      if (uniqueViolation(e))
        throw new ConflictException(
          'That registration address is already in use',
        );
      throw e;
    }
  }
  private async activeAccount(
    projectId: string,
    connection: Pick<DatabaseService, 'execute'> = this.db,
  ) {
    return rows<Account>(
      await connection.execute(
        sql`SELECT * FROM event_payment_account WHERE project_id=${projectId}::uuid AND active`,
      ),
    )[0];
  }
  async paymentAccount(ownerId: string, projectId: string) {
    await this.owned(ownerId, projectId);
    const a = await this.activeAccount(projectId);
    return a
      ? {
          connected: true,
          accountId: a.account_id,
          mode: a.mode,
          webhookUrl: `${(process.env.EVENT_API_PUBLIC_URL || 'https://api.agentcommons.io').replace(/\/$/, '')}/v1/event-payments/paystack/${a.account_id}`,
        }
      : { connected: false };
  }
  async connectPaystack(ownerId: string, projectId: string, input: any) {
    await this.owned(ownerId, projectId);
    const key = input?.secretKey;
    if (
      typeof key !== 'string' ||
      !/^sk_(live|test)_[a-zA-Z0-9]{16,150}$/.test(key)
    )
      throw new BadRequestException('Enter a valid Paystack secret key');
    const signing = input?.signingSecret || '';
    if (
      typeof signing !== 'string' ||
      (signing && !/^whsec_[a-zA-Z0-9_-]{16,200}$/.test(signing))
    )
      throw new BadRequestException('Enter a valid webhook signing secret');
    // Read-only authentication check. Never return balances or the credential.
    await this.paystack.call(key, '/balance');
    const encrypted = this.encryption.encrypt(JSON.stringify({ key, signing }));
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT project_id FROM project WHERE project_id=${projectId}::uuid FOR UPDATE`,
      );
      await tx.execute(
        sql`UPDATE event_payment_account SET active=false WHERE project_id=${projectId}::uuid AND active`,
      );
      await tx.execute(
        sql`INSERT INTO event_payment_account (project_id,owner_user_id,mode,credentials) VALUES (${projectId}::uuid,${ownerId},${key.startsWith('sk_live_') ? 'live' : 'test'},${JSON.stringify(encrypted)}::jsonb)`,
      );
    });
    return this.paymentAccount(ownerId, projectId);
  }
  private secrets(a: Account): { key: string; signing: string } {
    return JSON.parse(
      this.encryption.decrypt(
        a.credentials.encryptedValue,
        a.credentials.iv,
        a.credentials.tag,
      ),
    );
  }
  private async published(slug: string) {
    parse(slugSchema, slug);
    const [event] = rows<EventRow>(
      await this.db.execute(
        sql`SELECT e.* FROM project_event e JOIN project p ON p.project_id=e.project_id WHERE e.slug=${slug} AND e.status!='draft' AND p.deleted_at IS NULL`,
      ),
    );
    if (!event) throw new NotFoundException('Registration not found');
    return event;
  }
  private async occupied(tx: any, id: string, except?: string) {
    const [result] = rows<{ count: string }>(
      await tx.execute(
        sql`SELECT coalesce(sum(quantity),0)::text AS count FROM event_registration WHERE event_id=${id}::uuid AND (status='confirmed' OR (status='pending' AND expires_at>now())) AND registration_id != ${except || '00000000-0000-0000-0000-000000000000'}::uuid`,
      ),
    );
    return Number(result?.count || 0);
  }
  async publicEvent(slug: string) {
    const e = await this.published(slug);
    const occupied = await this.occupied(this.db, e.event_id);
    return {
      slug: e.slug,
      status: e.status,
      ...e.config,
      available:
        e.config.capacity === null
          ? null
          : Math.max(0, e.config.capacity - occupied),
      registrationUrl: `${publicEventOrigin(e.config.surface)}/register/${e.slug}`,
    };
  }
  private receipt(r: Registration, event: EventRow) {
    return {
      reference: r.reference,
      bookingCode: `AC-${r.reference.slice(-10).toUpperCase()}`,
      status: r.status,
      paymentStatus: r.payment_status,
      quantity: r.quantity,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      paidAt: r.paid_at,
      expiresAt: r.expires_at,
      checkoutUrl:
        r.status === 'pending' && new Date(r.expires_at).getTime() > Date.now()
          ? r.checkout_url
          : null,
      paymentDetails: r.payment_details || null,
      event: {
        slug: event.slug,
        title: event.config.title,
        when: event.config.when,
        location: event.config.location,
      },
    };
  }
  async checkout(slug: string, body: unknown) {
    const event = await this.published(slug);
    const input = checkoutInput(event.config, body);
    let created = false;
    const registration = await this.db.transaction(async (tx) => {
      const [current] = rows<EventRow>(
        await tx.execute(
          sql`SELECT * FROM project_event WHERE event_id=${event.event_id}::uuid FOR UPDATE`,
        ),
      );
      // Revalidate against the locked, current configuration, including the price.
      const valid = checkoutInput(current.config, body);
      const [previous] = rows<Registration>(
        await tx.execute(
          sql`SELECT * FROM event_registration WHERE event_id=${event.event_id}::uuid AND idempotency_key=${valid.idempotencyKey}`,
        ),
      );
      if (previous) {
        if (previous.request_hash !== valid.hash)
          throw new ConflictException(
            'These details changed. Please start a new checkout.',
          );
        if (
          previous.status === 'pending' &&
          new Date(previous.expires_at).getTime() < Date.now()
        )
          throw new ConflictException(
            'Your checkout expired. Please start again.',
          );
        if (previous.status === 'failed')
          throw new ConflictException(
            'That checkout did not finish. Please start again.',
          );
        return previous;
      }
      if (current.status !== 'open')
        throw new ConflictException('Registration is closed');
      const quantity = valid.participants.length;
      if (
        current.config.capacity !== null &&
        (await this.occupied(tx, event.event_id)) + quantity >
          current.config.capacity
      )
        throw new ConflictException(
          'There are not enough places available for this booking',
        );
      const amount = current.config.amountMinor * quantity;
      const account = amount
        ? await this.activeAccount(current.project_id, tx)
        : null;
      if (amount && !account)
        throw new ConflictException('Payments are temporarily unavailable');
      if (
        account?.mode === 'live' &&
        (process.env.EVENT_PAYMENTS_TEST_ONLY === 'true' ||
          process.env.APP_ENV === 'staging')
      )
        throw new ConflictException('Use a test payment account on staging');
      const id = randomUUID(),
        reference = `ac_evt_${randomBytes(24).toString('hex')}`;
      created = true;
      return rows<Registration>(
        await tx.execute(
          sql`INSERT INTO event_registration (registration_id,event_id,account_id,reference,idempotency_key,request_hash,status,payment_status,quantity,amount_minor,currency,contact,participants,agreement_snapshot,expires_at) VALUES (${id}::uuid,${event.event_id}::uuid,${account?.account_id || null}::uuid,${reference},${valid.idempotencyKey},${valid.hash},${amount ? 'pending' : 'confirmed'},${amount ? 'unpaid' : 'free'},${quantity},${amount},${current.config.currency},${JSON.stringify(valid.contact)}::jsonb,${JSON.stringify(valid.participants)}::jsonb,${JSON.stringify({ text: current.config.agreementText, terms: current.config.terms, agreedAt: new Date().toISOString() })}::jsonb,now()+interval '20 minutes') RETURNING *`,
        ),
      )[0];
    });
    if (!created || Number(registration.amount_minor) === 0)
      return this.receipt(registration, event);
    const [account] = rows<Account>(
      await this.db.execute(
        sql`SELECT * FROM event_payment_account WHERE account_id=${registration.account_id}::uuid`,
      ),
    );
    try {
      const result = await this.paystack.initialize(this.secrets(account).key, {
        email: input.contact.email,
        amount: Number(registration.amount_minor),
        currency: registration.currency,
        reference: registration.reference,
        callback_url: `${publicEventOrigin(event.config.surface)}/register/${event.slug}?reference=${registration.reference}`,
        metadata: {
          purpose: 'event_registration',
          eventId: event.event_id,
          registrationId: registration.registration_id,
          eventPaymentAccountId: account.account_id,
        },
      });
      let safe: URL;
      try {
        safe = new URL(result.authorization_url);
      } catch {
        throw new Error('Invalid checkout URL');
      }
      if (
        safe.protocol !== 'https:' ||
        safe.hostname !== 'checkout.paystack.com' ||
        result.reference !== registration.reference
      )
        throw new Error('Unexpected checkout response');
      // Do not regress a booking if a webhook has already confirmed it.
      const [saved] = rows<Registration>(
        await this.db.execute(
          sql`UPDATE event_registration SET checkout_url=${safe.toString()},updated_at=now() WHERE registration_id=${registration.registration_id}::uuid RETURNING *`,
        ),
      );
      return this.receipt(saved, event);
    } catch (e) {
      await this.db.execute(
        sql`UPDATE event_registration SET status='failed',updated_at=now() WHERE registration_id=${registration.registration_id}::uuid AND status='pending'`,
      );
      throw e;
    }
  }
  private async booking(slug: string, reference: string) {
    parse(referenceSchema, reference);
    const event = await this.published(slug);
    const [booking] = rows<Registration>(
      await this.db.execute(
        sql`SELECT * FROM event_registration WHERE event_id=${event.event_id}::uuid AND reference=${reference}`,
      ),
    );
    if (!booking) throw new NotFoundException('Booking not found');
    return { event, booking };
  }
  async status(slug: string, reference: string) {
    const { event, booking } = await this.booking(slug, reference);
    return this.receipt(booking, event);
  }
  async verify(slug: string, reference: string) {
    const { event, booking } = await this.booking(slug, reference);
    if (booking.payment_status !== 'unpaid' || !booking.account_id)
      return this.receipt(booking, event);
    const [account] = rows<Account>(
      await this.db.execute(
        sql`SELECT * FROM event_payment_account WHERE account_id=${booking.account_id}::uuid`,
      ),
    );
    const charge = await this.paystack.verify(
      this.secrets(account).key,
      reference,
    );
    if (charge.status !== 'success') return this.receipt(booking, event);
    return this.fulfill(event, booking, account, charge);
  }
  private async fulfill(
    event: EventRow,
    booking: Registration,
    account: Account,
    charge: VerifiedCharge,
  ) {
    if (
      charge.domain !== account.mode ||
      charge.reference !== booking.reference ||
      charge.metadata?.purpose !== 'event_registration' ||
      charge.metadata?.eventId !== event.event_id ||
      charge.metadata?.registrationId !== booking.registration_id ||
      charge.metadata?.eventPaymentAccountId !== account.account_id ||
      !charge.id
    )
      throw new ConflictException(
        'This payment could not be matched to the booking',
      );
    const amountMatches =
      Number.isSafeInteger(charge.amount) &&
      charge.amount === Number(booking.amount_minor) &&
      charge.currency === booking.currency;
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT event_id FROM project_event WHERE event_id=${event.event_id}::uuid FOR UPDATE`,
      );
      const [current] = rows<Registration>(
        await tx.execute(
          sql`SELECT * FROM event_registration WHERE registration_id=${booking.registration_id}::uuid FOR UPDATE`,
        ),
      );
      if (current.payment_status === 'paid') return current;
      const [latest] = rows<EventRow>(
        await tx.execute(
          sql`SELECT * FROM project_event WHERE event_id=${event.event_id}::uuid`,
        ),
      );
      const space =
        latest.config.capacity === null ||
        (await this.occupied(tx, event.event_id, current.registration_id)) +
          current.quantity <=
          latest.config.capacity;
      const reason = !amountMatches
        ? 'The received payment does not match the booking amount or currency'
        : !space
          ? 'Payment arrived after the hold and all places were taken'
          : null;
      return rows<Registration>(
        await tx.execute(
          sql`UPDATE event_registration SET status=${reason ? 'review' : 'confirmed'},payment_status='paid',paid_at=now(),provider_transaction_id=${String(charge.id)},payment_details=${JSON.stringify({ reason, amountMinor: charge.amount, currency: charge.currency })}::jsonb,updated_at=now() WHERE registration_id=${current.registration_id}::uuid RETURNING *`,
        ),
      )[0];
    });
    return this.receipt(result, event);
  }
  async webhook(
    accountId: string,
    raw: Buffer,
    headers: { legacy?: string; modern?: string },
  ) {
    parse(uuidSchema, accountId);
    const [account] = rows<Account>(
      await this.db.execute(
        sql`SELECT * FROM event_payment_account WHERE account_id=${accountId}::uuid`,
      ),
    );
    if (!account) throw new UnauthorizedException('Unknown payment account');
    const secret = this.secrets(account);
    if (!validPaystackSignature(raw, headers, secret.key, secret.signing))
      throw new UnauthorizedException('Invalid payment signature');
    let event: any;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook');
    }
    if (
      event.event !== 'charge.success' ||
      !referenceSchema.safeParse(event.data?.reference).success
    )
      return { received: true };
    const [booking] = rows<Registration>(
      await this.db.execute(
        sql`SELECT * FROM event_registration WHERE reference=${event.data.reference} AND account_id=${accountId}::uuid`,
      ),
    );
    if (!booking || booking.payment_status === 'paid')
      return { received: true };
    const [config] = rows<EventRow>(
      await this.db.execute(
        sql`SELECT * FROM project_event WHERE event_id=${booking.event_id}::uuid`,
      ),
    );
    const charge = await this.paystack.verify(secret.key, booking.reference);
    if (charge.status === 'success')
      await this.fulfill(config, booking, account, charge);
    return { received: true };
  }
  async registrations(
    ownerId: string,
    projectId: string,
    eventId: string,
    offset = 0,
  ) {
    await this.owned(ownerId, projectId, eventId);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
      throw new BadRequestException('Invalid page');
    const list = rows(
      await this.db.execute(
        sql`SELECT registration_id,reference,status,payment_status,quantity,amount_minor,currency,contact,participants,paid_at,payment_details,created_at FROM event_registration WHERE event_id=${eventId}::uuid ORDER BY created_at DESC,registration_id DESC LIMIT 100 OFFSET ${offset}`,
      ),
    );
    return {
      registrations: list,
      nextOffset: list.length === 100 ? offset + 100 : null,
    };
  }
}
