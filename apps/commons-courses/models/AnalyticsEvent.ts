import mongoose, { Schema, Document } from "mongoose";

export type AnalyticsEventType =
  | "page_view"
  | "course_cta_click"
  | "terms_modal_open"
  | "terms_accepted"
  | "checkout_started"
  | "checkout_redirect"
  | "checkout_error"
  | "payment_completed"
  | "payment_failed"
  | "free_enrollment"
  | "access_code_enrollment"
  | "lesson_view"
  | "lesson_navigation"
  | "lesson_complete_clicked"
  | "lesson_completed"
  | "locked_lesson_view"
  | "agent_message";

export interface IAnalyticsEvent extends Document {
  eventType: AnalyticsEventType | string;
  userId?: mongoose.Types.ObjectId;
  anonymousId?: string;
  sessionId?: string;
  courseId?: mongoose.Types.ObjectId;
  courseSlug?: string;
  page?: string;
  path?: string;
  source?: string;
  referrer?: string;
  provider?: "stripe" | "paystack";
  paymentPlan?: "one_time" | "installment";
  accessCode?: string;
  accessCodeType?: "discount" | "early_payment" | "scholarship" | "pass";
  affiliateCode?: string;
  originalAmount?: number;
  finalAmount?: number;
  discountAmount?: number;
  currency?: string;
  moduleIndex?: number;
  lessonIndex?: number;
  metadata?: Record<string, unknown>;
  userAgent?: string;
  ipHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    eventType: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    anonymousId: { type: String, trim: true },
    sessionId: { type: String, trim: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course" },
    courseSlug: { type: String, trim: true },
    page: { type: String, trim: true },
    path: { type: String, trim: true },
    source: { type: String, trim: true },
    referrer: String,
    provider: { type: String, enum: ["stripe", "paystack"] },
    paymentPlan: { type: String, enum: ["one_time", "installment"] },
    accessCode: { type: String, trim: true, uppercase: true },
    accessCodeType: {
      type: String,
      enum: ["discount", "early_payment", "scholarship", "pass"],
    },
    affiliateCode: { type: String, trim: true, uppercase: true },
    originalAmount: Number,
    finalAmount: Number,
    discountAmount: Number,
    currency: { type: String, trim: true, lowercase: true },
    moduleIndex: Number,
    lessonIndex: Number,
    metadata: Schema.Types.Mixed,
    userAgent: String,
    ipHash: String,
  },
  { timestamps: true }
);

AnalyticsEventSchema.index({ courseId: 1, createdAt: -1 });
AnalyticsEventSchema.index({ courseSlug: 1, createdAt: -1 });
AnalyticsEventSchema.index({ eventType: 1, createdAt: -1 });
AnalyticsEventSchema.index({ userId: 1, courseId: 1, createdAt: -1 });
AnalyticsEventSchema.index({ anonymousId: 1, sessionId: 1, createdAt: -1 });

export default mongoose.models.AnalyticsEvent ||
  mongoose.model<IAnalyticsEvent>("AnalyticsEvent", AnalyticsEventSchema);
