import { BadRequestException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { parse } from './event-policy';
export const discountInput = z
  .object({
    discountId: z.string().uuid().optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/),
    label: z.string().trim().max(100).default(''),
    active: z.boolean().default(true),
    amountType: z.enum(['percent', 'fixed']),
    amount: z.number().min(0.01).max(10000000),
    maxRedemptions: z
      .number()
      .int()
      .min(1)
      .max(1000000)
      .nullable()
      .default(null),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .refine(
    (v) => v.amountType !== 'percent' || v.amount <= 100,
    'Percentage must be at most 100',
  );
export const quoteInput = z.object({
  quantity: z.number().int().min(1).max(10),
  code: z.string().trim().toUpperCase().max(32).default(''),
});
const rows = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : (r as { rows?: T[] })?.rows || [];
export type Discount = {
  discount_id: string;
  code: string;
  label: string;
  active: boolean;
  amount_type: string;
  amount: string | number;
  max_redemptions: number | null;
  expires_at: string | Date | null;
};
export async function priceBooking(
  connection: any,
  eventId: string,
  amountMinor: number,
  quantity: number,
  code: string,
) {
  const originalAmountMinor = amountMinor * quantity;
  if (!code)
    return {
      originalAmountMinor,
      discountAmountMinor: 0,
      amountMinor: originalAmountMinor,
      discountId: null,
      discountCode: null,
    };
  const [rule] = rows<Discount>(
    await connection.execute(
      sql`SELECT * FROM event_discount WHERE event_id=${eventId}::uuid AND code=${code}`,
    ),
  );
  if (
    !rule ||
    !rule.active ||
    (rule.expires_at && new Date(rule.expires_at).getTime() < Date.now())
  )
    throw new BadRequestException('That discount code is not available');
  if (rule.max_redemptions !== null) {
    const [used] = rows<{ count: string }>(
      await connection.execute(
        sql`SELECT count(*)::text AS count FROM event_registration WHERE discount_id=${rule.discount_id}::uuid AND (status='confirmed' OR (status='pending' AND expires_at>now()))`,
      ),
    );
    if (Number(used.count) >= rule.max_redemptions)
      throw new ConflictException(
        'That discount code has reached its booking limit',
      );
  }
  // Match CommonLab's percent/fixed rule and single-code policy. Fixed values
  // are in main currency units and apply once to the whole booking.
  const deduction =
    rule.amount_type === 'percent'
      ? Math.round((originalAmountMinor * Number(rule.amount)) / 100)
      : Math.round(Number(rule.amount) * 100);
  const discountAmountMinor = Math.min(originalAmountMinor, deduction);
  return {
    originalAmountMinor,
    discountAmountMinor,
    amountMinor: originalAmountMinor - discountAmountMinor,
    discountId: rule.discount_id,
    discountCode: rule.code,
  };
}
export function parseDiscount(body: unknown) {
  return parse(discountInput, body);
}
