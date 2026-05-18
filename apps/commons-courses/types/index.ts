import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: "learner" | "educator" | "admin";
      emailVerifiedAt?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "learner" | "educator" | "admin";
    emailVerifiedAt?: Date | string;
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
  level: string;
  duration: string;
  lessonsCount: number;
  modulesCount: number;
  instructor: string;
  tags: string[];
  imageUrl?: string | null;
  bannerImageUrl?: string | null;
  previewImageUrl?: string | null;
}
