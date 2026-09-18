import {
  Award,
  BarChart3,
  BookOpen,
  Bot,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  House,
  LayoutDashboard,
  Library,
  Radio,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the educator console's information
 * architecture. The sidebar, the in-page section tabs and the copilot's
 * navigation map are all derived from these lists, so a route only has to
 * be described once.
 */

export type CourseSectionKey =
  | "overview"
  | "details"
  | "content"
  | "live"
  | "coursework"
  | "skills"
  | "learners"
  | "sales"
  | "analytics"
  | "agents"
  | "settings";

export type CourseSubView = {
  label: string;
  /** Path segment below /educator/courses/<slug>, plus an optional query. */
  href: string;
  /** What the copilot should know this view is for. */
  purpose: string;
};

export type CourseSection = {
  key: CourseSectionKey;
  label: string;
  icon: LucideIcon;
  /** Default path segment ("" is the course overview). */
  href: string;
  /** Every route segment that belongs to this section. */
  segments: string[];
  group: "build" | "audience" | "setup" | null;
  purpose: string;
  /** Sibling views shown as tabs at the top of the section. */
  views?: CourseSubView[];
};

export const courseSections: CourseSection[] = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    href: "",
    segments: [""],
    group: null,
    purpose: "course snapshot and the next thing to do",
  },
  {
    key: "details",
    label: "Details",
    icon: FileText,
    href: "edit",
    segments: ["edit"],
    group: "build",
    purpose: "course identity, description, images, brand colors, schedule and publishing",
    views: [
      { label: "General", href: "edit", purpose: "title, slug, tagline, instructor, level, type, duration, tags" },
      { label: "Description", href: "edit?tab=description", purpose: "short and long course description" },
      { label: "Media", href: "edit?tab=media", purpose: "card, banner and link preview images" },
      { label: "Brand", href: "edit?tab=brand", purpose: "course colors with a live preview" },
      { label: "Schedule", href: "edit?tab=schedule", purpose: "start date, next live session, live cadence, capacity" },
      { label: "Publishing", href: "edit?tab=publishing", purpose: "published state and catalog visibility" },
    ],
  },
  {
    key: "content",
    label: "Content",
    icon: BookOpen,
    href: "content",
    segments: ["content", "materials", "labs", "experiences"],
    group: "build",
    purpose: "modules and lessons, uploaded materials, lab workspaces and immersive experiences",
    views: [
      { label: "Modules", href: "content", purpose: "module and lesson editor; ?module=<index>&lesson=<index> opens one item" },
      { label: "Materials", href: "materials", purpose: "PDF and slide deck library" },
      { label: "Labs", href: "labs", purpose: "ZIP lab workspaces for learner practice" },
      { label: "Experiences", href: "experiences", purpose: "immersive, character-led learning worlds" },
    ],
  },
  {
    key: "live",
    label: "Live sessions",
    icon: Radio,
    href: "live",
    segments: ["live", "engagement"],
    group: "build",
    purpose: "live rooms and what happened in them",
    views: [
      { label: "Sessions", href: "live", purpose: "session library; /live/<id> opens one room (tabs: plan, run, invite, settings)" },
      { label: "Insights", href: "engagement", purpose: "attendance, participation and responses for one session; ?session=<id>" },
    ],
  },
  {
    key: "coursework",
    label: "Coursework",
    icon: ClipboardList,
    href: "assignments",
    segments: ["assignments"],
    group: "build",
    purpose: "assignments, check-ins and learner submissions",
    views: [
      { label: "Assignments", href: "assignments", purpose: "assignment list; ?assignment=<id> opens one assignment and its submissions" },
      { label: "Check-ins", href: "assignments?tab=check-ins", purpose: "follow-up check-ins after live sessions; ?checkin=<id> opens one" },
    ],
  },
  {
    key: "skills",
    label: "Skill badges",
    icon: Award,
    href: "skills",
    segments: ["skills"],
    group: "build",
    purpose: "daily skill paths and their challenges; ?path=<key>&challenge=<index> opens one challenge",
  },
  {
    key: "learners",
    label: "Learners",
    icon: GraduationCap,
    href: "students",
    segments: ["students"],
    group: "audience",
    purpose: "enrolled learners, progress, payment and access",
  },
  {
    key: "sales",
    label: "Sales",
    icon: CreditCard,
    href: "access",
    segments: ["access", "payments"],
    group: "audience",
    purpose: "price, checkout, offers and payments",
    views: [
      { label: "Pricing", href: "access", purpose: "price, currency, providers and installments" },
      { label: "Offers", href: "access?tab=offers", purpose: "promo codes, early payment discounts, scholarships and passes" },
      { label: "Affiliates", href: "access?tab=affiliates", purpose: "affiliate codes and commissions" },
      { label: "Payments", href: "payments", purpose: "transactions and payout ledger" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: BarChart3,
    href: "analytics",
    segments: ["analytics"],
    group: "audience",
    purpose: "traffic, sales funnel, progress and payment signals",
  },
  {
    key: "agents",
    label: "Course agents",
    icon: Bot,
    href: "agents",
    segments: ["agents"],
    group: "setup",
    purpose: "learner and educator assistants; ?agent=<id> opens one agent",
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings2,
    href: "notifications",
    segments: ["notifications", "collaborators"],
    group: "setup",
    purpose: "emails and collaborators",
    views: [
      { label: "Notifications", href: "notifications", purpose: "automated emails and email branding" },
      { label: "Collaborators", href: "collaborators", purpose: "co-owners and editors" },
    ],
  },
];

export const courseSectionGroups: Array<{ key: CourseSection["group"]; label?: string }> = [
  { key: null },
  { key: "build", label: "Build" },
  { key: "audience", label: "Audience" },
  { key: "setup", label: "Setup" },
];

export type ConsoleSection = {
  label: string;
  href: string;
  icon: LucideIcon;
  purpose: string;
  exact?: boolean;
};

export const consoleSections: ConsoleSection[] = [
  { label: "Home", href: "/educator", icon: House, exact: true, purpose: "copilot launcher and shortcuts" },
  { label: "Courses", href: "/educator/courses", icon: Library, purpose: "all courses you manage" },
  { label: "Skill badges", href: "/educator/skills", icon: Award, purpose: "skill paths across courses" },
  { label: "Analytics", href: "/educator/analytics", icon: BarChart3, purpose: "portfolio analytics" },
  { label: "Create with AI", href: "/educator/copilot", icon: Sparkles, purpose: "turn uploaded material into a draft course, workbook or skill pack" },
  { label: "Settings", href: "/educator/settings", icon: Settings2, purpose: "educator profile and payouts" },
];

/** Returns the course slug and route segment for a course console path. */
export function parseCoursePath(pathname: string) {
  const match = pathname.match(/^\/educator\/courses\/([^/]+)(?:\/([^/?]+))?/);
  if (!match || match[1] === "new") return null;
  return { slug: decodeURIComponent(match[1]), segment: match[2] || "" };
}

export function sectionForSegment(segment: string) {
  return courseSections.find((section) => section.segments.includes(segment)) || courseSections[0];
}

export function courseHref(slug: string, href: string) {
  return href ? `/educator/courses/${slug}/${href}` : `/educator/courses/${slug}`;
}

/** Plain-text map of the console for the educator copilot's system context. */
export function describeEducatorConsole() {
  const lines = [
    "Console pages:",
    ...consoleSections.map((section) => `- ${section.href}: ${section.label}, ${section.purpose}`),
    "- /educator/courses/new: create a course",
    "Per course, under /educator/courses/<slug> (sidebar section > tabs):",
  ];
  for (const section of courseSections) {
    const path = section.href ? `/${section.href}` : "";
    lines.push(`- ${section.label} (${path || "/"}): ${section.purpose}`);
    for (const view of section.views || []) {
      lines.push(`  - ${view.label} tab (/${view.href}): ${view.purpose}`);
    }
  }
  lines.push(
    "Every view focuses on one task. Forms (new assignment, new session, invite) open in a side drawer from a button; lists open a detail view on click.",
  );
  return lines.join("\n");
}
