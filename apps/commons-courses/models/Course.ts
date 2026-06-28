import mongoose, { Schema, Document } from "mongoose";
import {
  getDefaultCourseAgents,
  normalizeCourseAgents,
} from "@/lib/course-agent-defaults";
import type { CourseAgentConfig } from "@/types/course-agent";
import type { SkillPack } from "@/types/skills";

export interface ILesson {
  title: string;
  duration: string;
  description?: string;
  assetUrl?: string;
  assetAlt?: string;
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

export interface ICourseEmailSettings {
  welcomeEnabled: boolean;
  enrollmentEnabled: boolean;
  assignmentCreatedEnabled: boolean;
  assignmentUpdatedEnabled: boolean;
  courseUpdateEnabled: boolean;
  agentManaged: boolean;
  replyTo?: string;
  customIntro?: string;
}

export interface ICourseCollaborator {
  id: string;
  userId?: mongoose.Types.ObjectId;
  email: string;
  name?: string;
  role: "co_owner" | "editor";
  invitedBy?: mongoose.Types.ObjectId;
  invitedAt: Date;
  lastInvitedAt?: Date;
}

export interface ICourseLiveSchedule {
  cadence?: "weekly" | "biweekly" | "monthly" | "custom";
  dayOfWeek?:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  time?: string;
  timezone?: string;
  sessionsCount?: number;
  description?: string;
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
  /** Course-level availability gate. Learners can enroll before this date, but course content stays locked. */
  startDate?: Date;
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
  emailSettings?: ICourseEmailSettings;
  collaborators: ICourseCollaborator[];
  tags: string[];
  imageUrl?: string;
  bannerImageUrl?: string;
  previewImageUrl?: string;
  modules: IModule[];
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
  agents: CourseAgentConfig[];
  published: boolean;
  /** Pinned as the single hero feature on the landing page */
  isMainFeatured: boolean;
  /** Shown in the "featured courses" section on the landing page */
  isFeatured: boolean;
  // Live-class specific (only relevant when courseType === "live")
  nextSessionDate?: Date;
  sessionDates?: Date[];
  liveSchedule?: ICourseLiveSchedule;
  maxEnrollments?: number;
  liveSessionUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LessonSchema = new Schema<ILesson>({
  title: { type: String, required: true },
  duration: { type: String, required: true },
  description: String,
  assetUrl: String,
  assetAlt: String,
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

const CourseEmailSettingsSchema = new Schema<ICourseEmailSettings>(
  {
    welcomeEnabled: { type: Boolean, default: true },
    enrollmentEnabled: { type: Boolean, default: true },
    assignmentCreatedEnabled: { type: Boolean, default: true },
    assignmentUpdatedEnabled: { type: Boolean, default: true },
    courseUpdateEnabled: { type: Boolean, default: false },
    agentManaged: { type: Boolean, default: false },
    replyTo: { type: String, trim: true },
    customIntro: { type: String, trim: true },
  },
  { _id: false }
);

const CourseCollaboratorSchema = new Schema<ICourseCollaborator>(
  {
    id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    role: {
      type: String,
      enum: ["co_owner", "editor"],
      default: "editor",
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
    invitedAt: { type: Date, default: Date.now },
    lastInvitedAt: Date,
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

const SkillQuestionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    prompt: { type: String, required: true, trim: true },
    options: { type: [String], required: true, validate: (value: string[]) => value.length >= 2 },
    answerIndex: { type: Number, required: true, min: 0 },
    explanation: { type: String, trim: true },
  },
  { _id: false }
);

const SkillActivityRequirementSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    platform: {
      type: String,
      enum: ["agent_commons", "common_os", "external"],
      required: true,
    },
    eventType: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    points: { type: Number, min: 0 },
  },
  { _id: false }
);

const AgentSandboxGuideStepSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    target: {
      type: String,
      enum: [
        "identity",
        "system_prompt",
        "skills",
        "tools",
        "connectors",
        "tasks",
        "workflows",
        "chat",
        "logs",
        "publish",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    targetSelector: { type: String, trim: true },
    placement: {
      type: String,
      enum: ["top", "right", "bottom", "left", "auto"],
      default: "auto",
    },
  },
  { _id: false }
);

const AgentSandboxSkillTemplateSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    instructions: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const AgentSandboxToolTemplateSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    connectorKind: {
      type: String,
      enum: [
        "google_calendar",
        "gmail",
        "google_drive",
        "google_sheets",
        "github",
        "custom",
      ],
      default: "custom",
    },
    simulated: { type: Boolean, default: true },
  },
  { _id: false }
);

const AgentSandboxReviewSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    targets: {
      type: [String],
      enum: ["system_prompt", "skills"],
      default: ["system_prompt"],
    },
    minScore: { type: Number, default: 70, min: 0, max: 100 },
    rubric: { type: String, trim: true },
    model: { type: String, trim: true },
  },
  { _id: false }
);

const AgentSandboxIntroSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    eyebrow: { type: String, trim: true },
    title: { type: String, trim: true },
    body: { type: String, trim: true },
    expectations: { type: [String], default: [] },
    infoTitle: { type: String, trim: true },
    infoBody: { type: String, trim: true },
    startLabel: { type: String, trim: true },
  },
  { _id: false }
);

const AgentSandboxCompletionSchema = new Schema(
  {
    title: { type: String, trim: true },
    body: { type: String, trim: true },
    primaryActionLabel: { type: String, trim: true },
  },
  { _id: false }
);

const AgentSandboxConfigSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    mode: {
      type: String,
      enum: ["simple", "builder", "full"],
      default: "builder",
    },
    title: { type: String, trim: true },
    brief: { type: String, trim: true },
    intro: AgentSandboxIntroSchema,
    completion: AgentSandboxCompletionSchema,
    capabilities: {
      type: [String],
      enum: [
        "identity",
        "system_prompt",
        "skills",
        "tools",
        "connectors",
        "tasks",
        "workflows",
        "chat",
        "logs",
        "credits",
      ],
      default: ["identity", "system_prompt", "skills", "tools", "chat", "logs"],
    },
    requiredCapabilities: {
      type: [String],
      enum: [
        "identity",
        "system_prompt",
        "skills",
        "tools",
        "connectors",
        "tasks",
        "workflows",
        "chat",
        "logs",
        "credits",
      ],
      default: ["identity", "system_prompt", "skills", "tools", "chat"],
    },
    guideSteps: { type: [AgentSandboxGuideStepSchema], default: [] },
    starterAgent: {
      name: { type: String, trim: true },
      persona: { type: String, trim: true },
      systemPrompt: { type: String, trim: true },
    },
    skillTemplates: { type: [AgentSandboxSkillTemplateSchema], default: [] },
    toolTemplates: { type: [AgentSandboxToolTemplateSchema], default: [] },
    review: AgentSandboxReviewSchema,
    creditReward: { type: Number, default: 0, min: 0 },
    completionEventType: {
      type: String,
      default: "agent_sandbox_completed",
      trim: true,
    },
  },
  { _id: false }
);

const SkillChallengeSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    day: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    shortTitle: { type: String, trim: true },
    minutes: { type: Number, required: true, min: 1 },
    points: { type: Number, required: true, min: 0 },
    streakBoost: { type: Number, default: 1, min: 0 },
    assetUrl: { type: String, trim: true },
    assetAlt: { type: String, trim: true },
    accentColor: { type: String, trim: true },
    audioCue: {
      type: String,
      enum: ["spark", "focus", "complete"],
      default: "focus",
    },
    hook: { type: String, trim: true },
    lesson: { type: String, required: true, trim: true },
    keyIdeas: { type: [String], default: [] },
    microTask: { type: String, trim: true },
    practicalSignal: SkillActivityRequirementSchema,
    sandbox: AgentSandboxConfigSchema,
    questions: { type: [SkillQuestionSchema], default: [] },
  },
  { _id: false }
);

const SkillPackSchema = new Schema(
  {
    slug: { type: String, trim: true },
    enabled: { type: Boolean, default: false },
    title: { type: String, trim: true },
    subtitle: { type: String, trim: true },
    learnerPromise: { type: String, trim: true },
    challenges: { type: [SkillChallengeSchema], default: [] },
  },
  { _id: false }
);

const CourseLiveScheduleSchema = new Schema<ICourseLiveSchedule>(
  {
    cadence: {
      type: String,
      enum: ["weekly", "biweekly", "monthly", "custom"],
      default: "weekly",
    },
    dayOfWeek: {
      type: String,
      enum: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
    },
    time: { type: String, trim: true },
    timezone: { type: String, trim: true },
    sessionsCount: { type: Number, min: 1 },
    description: { type: String, trim: true },
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
    startDate: Date,
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
    emailSettings: {
      type: CourseEmailSettingsSchema,
      default: () => ({}),
    },
    collaborators: { type: [CourseCollaboratorSchema], default: [] },
    tags: [String],
    imageUrl: String,
    bannerImageUrl: String,
    previewImageUrl: String,
    modules: [ModuleSchema],
    skillPack: SkillPackSchema,
    skillPacks: { type: [SkillPackSchema], default: [] },
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
    liveSchedule: CourseLiveScheduleSchema,
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
CourseSchema.index({ published: 1, updatedAt: -1, "skillPack.enabled": 1 });
CourseSchema.index({ published: 1, updatedAt: -1, "skillPacks.enabled": 1 });
CourseSchema.index({ published: 1, slug: 1 });
CourseSchema.index({ published: 1, "skillPack.slug": 1 });
CourseSchema.index({ published: 1, "skillPacks.slug": 1 });
CourseSchema.index({ startDate: 1 });
CourseSchema.index({ "collaborators.userId": 1 });
CourseSchema.index({ "collaborators.email": 1 });
CourseSchema.index({ "accessProgram.discounts.code": 1 });
CourseSchema.index({ "accessProgram.earlyPaymentDiscounts.deadline": 1 });
CourseSchema.index({ "accessProgram.scholarships.code": 1 });
CourseSchema.index({ "accessProgram.passes.code": 1 });
CourseSchema.index({ "accessProgram.affiliates.code": 1 });

export default mongoose.models.Course ||
  mongoose.model<ICourse>("Course", CourseSchema);
