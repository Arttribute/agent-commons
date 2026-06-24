import type { DefaultSession } from "next-auth";
import type { LiveSchedule } from "@/lib/course-schedule";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: "learner" | "educator" | "admin";
      emailVerifiedAt?: string;
      identityUserId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "learner" | "educator" | "admin";
    emailVerifiedAt?: Date | string;
    identityUserId?: string;
  }
}

export interface CourseCardData {
  _id: string;
  title: string;
  slug: string;
  tagline: string;
  description: string;
  price: number;
  currency?: string;
  isFree: boolean;
  courseType?: "self-paced" | "live";
  startDate?: string | Date | null;
  liveSchedule?: LiveSchedule | null;
  level: string;
  duration: string;
  lessonsCount: number;
  modulesCount: number;
  instructor: string;
  tags: string[];
  imageUrl?: string | null;
  bannerImageUrl?: string | null;
  previewImageUrl?: string | null;
  progress?: number;
}
