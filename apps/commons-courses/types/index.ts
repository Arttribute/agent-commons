import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

export interface CourseCardData {
  _id: string;
  title: string;
  slug: string;
  tagline: string;
  description: string;
  price: number;
  isFree: boolean;
  level: string;
  duration: string;
  lessonsCount: number;
  modulesCount: number;
  instructor: string;
  tags: string[];
}
