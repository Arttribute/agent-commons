import type { Dispatch, SetStateAction } from "react";
import type { AccessProgramForm } from "@/components/educator/access-program-types";
import type { CourseTheme } from "@/lib/course-theme";
import type { LiveSchedule } from "@/lib/course-schedule";
import type { CourseAgentConfig } from "@/types/course-agent";
import type { SkillPack } from "@/types/skills";

export type Lesson = {
  title: string;
  duration: string;
  description?: string;
  assetUrl?: string;
  assetAlt?: string;
  labWorkspaceId?: string;
  isFree?: boolean;
};

export type Module = {
  title: string;
  description?: string;
  assignment?: string;
  lessons: Lesson[];
};

export type CourseForm = {
  title: string;
  slug?: string;
  tagline: string;
  description: string;
  longDescription: string;
  price: number;
  currency: string;
  isFree: boolean;
  published: boolean;
  catalogVisibility: "public" | "private";
  theme: CourseTheme;
  level: "beginner" | "intermediate" | "advanced";
  courseType: "self-paced" | "live";
  startDate?: string;
  nextSessionDate?: string;
  sessionDatesText: string;
  liveSchedule: LiveSchedule;
  maxEnrollments?: number;
  liveSessionUrl?: string;
  duration: string;
  instructor: string;
  tagsText: string;
  imageUrl?: string;
  bannerImageUrl?: string;
  previewImageUrl?: string;
  paymentProviders: ("stripe" | "paystack")[];
  installmentPlan: {
    enabled: boolean;
    installmentAmount?: number;
    installmentCount: number;
    releaseAccess:
      | "full_after_first_payment"
      | "module_by_module"
      | "full_after_completion";
  };
  accessProgram: AccessProgramForm;
  emailSettings: {
    welcomeEnabled: boolean;
    enrollmentEnabled: boolean;
    assignmentCreatedEnabled: boolean;
    assignmentUpdatedEnabled: boolean;
    courseUpdateEnabled: boolean;
    agentManaged: boolean;
    replyTo?: string;
    customIntro?: string;
    branding: {
      enabled: boolean;
      senderName: string;
      logoUrl: string;
      accentColor: string;
      footerText: string;
    };
  };
  modules: Module[];
  skillPack: SkillPack;
  skillPacks: SkillPack[];
  agents: CourseAgentConfig[];
};

export type UploadField =
  | "imageUrl"
  | "bannerImageUrl"
  | "previewImageUrl"
  | "emailSettings.logoUrl"
  | "skillPack.coverUrl"
  | `skillPack.${number}.assetUrl`
  | `skillPacks.${number}.coverUrl`
  | `skillPacks.${number}.${number}.assetUrl`;

/** Everything a section view needs from the shared course editor. */
export type CourseViewProps = {
  course: CourseForm;
  setCourse: Dispatch<SetStateAction<CourseForm>>;
  uploadingMedia: string | null;
  uploadMedia: (field: UploadField, file?: File) => void;
};
