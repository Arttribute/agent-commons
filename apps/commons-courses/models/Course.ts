import mongoose, { Schema, Document } from "mongoose";

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
  tags: string[];
  imageUrl?: string;
  modules: IModule[];
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
    tags: [String],
    imageUrl: String,
    modules: [ModuleSchema],
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

export default mongoose.models.Course ||
  mongoose.model<ICourse>("Course", CourseSchema);
