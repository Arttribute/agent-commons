export class RegistrationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
class BadRequestException extends RegistrationError {}
import { createHash } from "node:crypto";
import { z } from "zod";

const safeUrl = z
  .string()
  .max(2000)
  .refine((s) => !s || /^https:\/\//.test(s), "Use a secure image URL");
const field = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "select", "checkbox"]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
});
export const eventConfigSchema = z
  .object({
    registrationHeading: z.string().trim().max(80).default("Register"),
    title: z.string().trim().min(2).max(120),
    summary: z.string().trim().max(600).default(""),
    when: z.string().trim().max(200).default(""),
    location: z.string().trim().max(200).default(""),
    amountMinor: z.number().int().min(0).max(1_000_000_000),
    currency: z.enum(["KES", "NGN", "GHS", "ZAR", "USD"]).default("KES"),
    capacity: z.number().int().min(1).max(1_000_000).nullable().default(null),
    maxPerOrder: z.number().int().min(1).max(10).default(4),
    participantLabel: z.string().trim().min(1).max(40).default("Participant"),
    participantPlural: z.string().trim().min(1).max(40).default("Participants"),
    contactLabel: z.string().trim().min(1).max(80).default("Your full name"),
    eyebrow: z.string().trim().max(100).default("Join us"),
    fields: z.array(field).max(10).default([]),
    agreementText: z.string().trim().min(10).max(600),
    terms: z.string().trim().max(10_000).default(""),
    supportEmail: z
      .union([z.literal(""), z.string().email().max(200)])
      .default(""),
    supportPhone: z.string().trim().max(50).default(""),
    pageSlug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/)
      .optional(),
    surface: z.enum(["commons", "commonlab", "business"]).default("commons"),
    theme: z
      .object({
        accent: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .default("#325ad2"),
        background: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .default("#faf8f2"),
        ink: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .default("#21314b"),
        logoUrl: safeUrl.default(""),
        imageUrl: safeUrl.default(""),
      })
      .default({}),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.fields.map((f) => f.key)).size !== value.fields.length)
      ctx.addIssue({ code: "custom", message: "Field keys must be unique" });
    value.fields.forEach((f) => {
      if (f.type === "select" && !f.options?.length)
        ctx.addIssue({ code: "custom", message: `${f.label} needs choices` });
    });
  });
export type EventConfig = z.infer<typeof eventConfigSchema>;
export type EventField = EventConfig["fields"][number];
export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
export const uuidSchema = z.string().uuid();
export const referenceSchema = z.string().regex(/^ac_evt_[a-f0-9]{48}$/);
const checkoutSchema = z.object({
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/),
  name: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(30)
    .regex(/^[+\d ()-]+$/),
  participants: z
    .array(z.record(z.union([z.string().max(300), z.boolean()])))
    .min(1)
    .max(10),
  agreed: z.literal(true),
  discountCode: z.string().trim().toUpperCase().max(32).default(""),
  expectedAmountMinor: z.number().int().min(0).optional(),
  website: z.string().max(0).optional(),
});

export function parse<T>(schema: z.ZodType<T, any, any>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues[0]?.message || "Please check the form",
    );
  return result.data;
}
export function checkoutInput(config: EventConfig, input: unknown) {
  const value = parse(checkoutSchema, input);
  if (value.participants.length > config.maxPerOrder)
    throw new BadRequestException(
      `You can register up to ${config.maxPerOrder} people at a time`,
    );
  const participants = value.participants.map((source) => {
    const target: Record<string, string | boolean> = {};
    for (const f of config.fields) {
      const v = source[f.key];
      if (
        f.required &&
        (v === undefined || v === "" || (f.type === "checkbox" && v !== true))
      )
        throw new BadRequestException(`Please complete ${f.label}`);
      if (v === undefined || v === "") continue;
      if (
        f.type === "checkbox" ? typeof v !== "boolean" : typeof v !== "string"
      )
        throw new BadRequestException(`Please check ${f.label}`);
      if (f.type === "select" && !f.options?.includes(v as string))
        throw new BadRequestException(`Please choose an option for ${f.label}`);
      target[f.key] = typeof v === "string" ? v.trim() : v;
    }
    return target;
  });
  const contact = { name: value.name, email: value.email, phone: value.phone };
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        discountCode: value.discountCode,
        contact,
        participants,
        agreement: config.agreementText,
        terms: config.terms,
        amount: config.amountMinor,
        currency: config.currency,
      }),
    )
    .digest("hex");
  return {
    idempotencyKey: value.idempotencyKey,
    contact,
    participants,
    hash,
    discountCode: value.discountCode,
    expectedAmountMinor: value.expectedAmountMinor,
  };
}
