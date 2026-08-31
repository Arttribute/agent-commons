export type CourseTheme = {
  primary: string;
  accent: string;
  highlight: string;
  background: string;
  surface: string;
  text: string;
};

export const defaultCourseTheme: CourseTheme = {
  primary: "#0F172A",
  accent: "#71E0E7",
  highlight: "#B8F56D",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#0F172A",
};

export function normalizeCourseTheme(input?: Partial<CourseTheme> | null): CourseTheme {
  return Object.fromEntries(
    Object.entries(defaultCourseTheme).map(([key, fallback]) => [key, normalizeHexColor(input?.[key as keyof CourseTheme]) || fallback]),
  ) as CourseTheme;
}

export function getCourseThemeStyle(input?: Partial<CourseTheme> | null) {
  const theme = normalizeCourseTheme(input);
  return {
    "--course-primary": theme.primary,
    "--course-on-primary": getReadableTextColor(theme.primary),
    "--course-accent": theme.accent,
    "--course-on-accent": getReadableTextColor(theme.accent),
    "--course-highlight": theme.highlight,
    "--course-on-highlight": getReadableTextColor(theme.highlight),
    "--course-background": theme.background,
    "--course-surface": theme.surface,
    "--course-text": theme.text,
  } as Record<`--course-${string}`, string>;
}

function normalizeHexColor(value?: string | null) {
  const color = value?.trim();
  if (!color) return "";
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color.slice(1).split("").map((character) => `${character}${character}`).join("")}`.toUpperCase();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : "";
}

function getReadableTextColor(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.57 ? "#0F172A" : "#FFFFFF";
}
