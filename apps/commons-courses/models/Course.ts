import mongoose, { Schema, Document } from "mongoose";
import {
  getDefaultCourseAgents,
  normalizeCourseAgents,
} from "@/lib/course-agent-defaults";
import type { CourseAgentConfig } from "@/types/course-agent";

export interface ILesson {
  title: string;
  duration: string;
  description?: string;
  isFree: boolean;
}

export interface IModule {
  title: string;
  description?: string;
  assignment?: string;
  lessons: ILesson[];
}

export interface ICourseAccessCode {
  id: string;
  code: string;
  label?: string;
  active: boolean;
  amountType?: "percent" | "fixed";
  amount?: number;
  maxRedemptions?: number;
  redeemedCount: number;
  expiresAt?: Date;
}

export interface ICourseAffiliateProgram {
  id: string;
  code: string;
  name: string;
  active: boolean;
  commissionType: "percent" | "fixed";
  commissionAmount: number;
  conversions: number;
}

export interface ICourseEarlyPaymentDiscount {
  id: string;
  label?: string;
  active: boolean;
  amountType: "percent" | "fixed";
  amount: number;
  deadline: Date;
  maxRedemptions?: number;
  redeemedCount: number;
}

export interface ICourseAccessProgram {
  discounts: ICourseAccessCode[];
  earlyPaymentDiscounts: ICourseEarlyPaymentDiscount[];
  scholarships: ICourseAccessCode[];
  passes: ICourseAccessCode[];
  affiliates: ICourseAffiliateProgram[];
}

export interface ICourse extends Document {
  title: string;
  slug: string;
  tagline: string;
  description: string;
  longDescription: string;
  price: number;
  currency?: string;
  isFree: boolean;
  /** "self-paced" — pre-recorded on-demand content; "live" — scheduled live class sessions */
  courseType: "self-paced" | "live";
  level: "beginner" | "intermediate" | "advanced";
  duration: string;
  lessonsCount: number;
  modulesCount: number;
  instructor: string;
  educator?: {
    userId?: mongoose.Types.ObjectId;
    name?: string;
    plan?: "free" | "starter" | "growth" | "institution";
    settlementMode?: "platform_rails" | "educator_direct";
    platformFeePercent?: number;
    paystackSubaccountCode?: string;
    stripeAccountId?: string;
  };
  paymentProviders?: ("stripe" | "paystack")[];
  installmentPlan?: {
    enabled: boolean;
    label?: string;
    installmentAmount?: number;
    installmentCount?: number;
    releaseAccess:
      | "full_after_first_payment"
      | "module_by_module"
      | "full_after_completion";
  };
  accessProgram?: ICourseAccessProgram;
  tags: string[];
  imageUrl?: string;
  modules: IModule[];
  agents: CourseAgentConfig[];
  published: boolean;
  /** Pinned as the single hero feature on the landing page */
  isMainFeatured: boolean;
  /** Shown in the "featured courses" section on the landing page */
  isFeatured: boolean;
  // Live-class specific (only relevant when courseType === "live")
  nextSessionDate?: Date;
  sessionDates?: Date[];
  maxEnrollments?: number;
  liveSessionUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LessonSchema = new Schema<ILesson>({
  title: { type: String, required: true },
  duration: { type: String, required: true },
  description: String,
  isFree: { type: Boolean, default: false },
});

const ModuleSchema = new Schema<IModule>({
  title: { type: String, required: true },
  description: String,
  assignment: String,
  lessons: [LessonSchema],
});

const EducatorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    name: String,
    plan: {
      type: String,
      enum: ["free", "starter", "growth", "institution"],
      default: "free",
    },
    settlementMode: {
      type: String,
      enum: ["platform_rails", "educator_direct"],
      default: "platform_rails",
    },
    platformFeePercent: { type: Number, default: 20, min: 0, max: 100 },
    paystackSubaccountCode: String,
    stripeAccountId: String,
  },
  { _id: false }
);

const InstallmentPlanSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    label: { type: String, default: "Lipa mdogo mdogo" },
    installmentAmount: Number,
    installmentCount: { type: Number, default: 4, min: 2 },
    releaseAccess: {
      type: String,
      enum: [
        "full_after_first_payment",
        "module_by_module",
        "full_after_completion",
      ],
      default: "module_by_module",
    },
  },
  { _id: false }
);

const AccessCodeSchema = new Schema<ICourseAccessCode>(
  {
    id: { type: String, required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    label: String,
    active: { type: Boolean, default: true },
    amountType: {
      type: String,
      enum: ["percent", "fixed"],
      default: "percent",
    },
    amount: { type: Number, default: 0, min: 0 },
    maxRedemptions: { type: Number, min: 1 },
    redeemedCount: { type: Number, default: 0, min: 0 },
    expiresAt: Date,
  },
  { _id: false }
);

const AffiliateProgramSchema = new Schema<ICourseAffiliateProgram>(
  {
    id: { type: String, required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    commissionType: {
      type: String,
      enum: ["percent", "fixed"],
      default: "percent",
    },
    commissionAmount: { type: Number, default: 10, min: 0 },
    conversions: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const EarlyPaymentDiscountSchema = new Schema<ICourseEarlyPaymentDiscount>(
  {
    id: { type: String, required: true },
    label: String,
    active: { type: Boolean, default: true },
    amountType: {
      type: String,
      enum: ["percent", "fixed"],
      default: "percent",
    },
    amount: { type: Number, default: 10, min: 0 },
    deadline: { type: Date, required: true },
    maxRedemptions: { type: Number, min: 1 },
    redeemedCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const AccessProgramSchema = new Schema<ICourseAccessProgram>(
  {
    discounts: { type: [AccessCodeSchema], default: [] },
    earlyPaymentDiscounts: {
      type: [EarlyPaymentDiscountSchema],
      default: [],
    },
    scholarships: { type: [AccessCodeSchema], default: [] },
    passes: { type: [AccessCodeSchema], default: [] },
    affiliates: { type: [AffiliateProgramSchema], default: [] },
  },
  { _id: false }
);

const CourseAgentSchema = new Schema<CourseAgentConfig>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    agentCommonsAgentId: String,
    audience: {
      type: String,
      enum: ["learners", "educators", "both"],
      default: "learners",
    },
    enabled: { type: Boolean, default: true },
    dataScope: {
      type: String,
      enum: [
        "course_overview",
        "course_content",
        "course_content_and_progress",
        "educator_operations",
      ],
      default: "course_content",
    },
    learningMode: {
      type: String,
      enum: ["socratic", "guided", "direct_support"],
      default: "guided",
    },
    actions: {
      type: [String],
      enum: ["suggest", "draft", "fill_view", "navigate"],
      default: ["suggest"],
    },
    instructions: { type: String, default: "" },
  },
  { _id: false }
);

const CourseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    tagline: { type: String, required: true },
    description: { type: String, required: true },
    longDescription: { type: String, required: true },
    price: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
    isFree: { type: Boolean, default: false },
    courseType: {
      type: String,
      enum: ["self-paced", "live"],
      default: "self-paced",
    },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    duration: { type: String, required: true },
    lessonsCount: { type: Number, default: 0 },
    modulesCount: { type: Number, default: 0 },
    instructor: { type: String, required: true },
    educator: EducatorSchema,
    paymentProviders: {
      type: [String],
      enum: ["stripe", "paystack"],
      default: ["stripe"],
    },
    installmentPlan: InstallmentPlanSchema,
    accessProgram: AccessProgramSchema,
    tags: [String],
    imageUrl: String,
    modules: [ModuleSchema],
    agents: {
      type: [CourseAgentSchema],
      default: getDefaultCourseAgents,
      validate: {
        validator(value: CourseAgentConfig[]) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one course agent is required.",
      },
    },
    published: { type: Boolean, default: false },
    isMainFeatured: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    // Live-only fields
    nextSessionDate: Date,
    sessionDates: [Date],
    maxEnrollments: Number,
    liveSessionUrl: String,
  },
  { timestamps: true }
);

CourseSchema.pre("validate", function normalizeAgents(next) {
  this.agents = normalizeCourseAgents(this.agents);
  next();
});

CourseSchema.index({ "agents.id": 1 });
CourseSchema.index({ "agents.agentCommonsAgentId": 1 });
CourseSchema.index({ "accessProgram.discounts.code": 1 });
CourseSchema.index({ "accessProgram.earlyPaymentDiscounts.deadline": 1 });
CourseSchema.index({ "accessProgram.scholarships.code": 1 });
CourseSchema.index({ "accessProgram.passes.code": 1 });
CourseSchema.index({ "accessProgram.affiliates.code": 1 });

export default mongoose.models.Course ||
  mongoose.model<ICourse>("Course", CourseSchema);
