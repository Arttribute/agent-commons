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
  lessons: ILesson[];
}

export interface ICourse extends Document {
  title: string;
  slug: string;
  tagline: string;
  description: string;
  longDescription: string;
  price: number;
  isFree: boolean;
  /** "self-paced" — pre-recorded on-demand content; "live" — scheduled live class sessions */
  courseType: "self-paced" | "live";
  level: "beginner" | "intermediate" | "advanced";
  duration: string;
  lessonsCount: number;
  modulesCount: number;
  instructor: string;
  tags: string[];
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
  lessons: [LessonSchema],
});

const CourseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    tagline: { type: String, required: true },
    description: { type: String, required: true },
    longDescription: { type: String, required: true },
    price: { type: Number, default: 0 },
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
    tags: [String],
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
