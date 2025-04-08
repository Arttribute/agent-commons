import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Function to generate a slug from a string
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/&/g, "-and-") // Replace & with 'and'
    .replace(/[^\w-]+/g, "") // Remove all non-word characters
    .replace(/--+/g, "-"); // Replace multiple - with single -
}

// Function to format date in a readable format
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Function to truncate text with ellipsis
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// Function to extract excerpt from markdown content
export function extractExcerpt(markdown: string, maxLength = 160): string {
  // Remove markdown formatting
  const plainText = markdown
    .replace(/#+\s+(.*)/g, "$1") // Remove headings
    .replace(/\[([^\]]+)\]$$[^)]+$$/g, "$1") // Remove links
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
    .replace(/\*([^*]+)\*/g, "$1") // Remove italic
    .replace(/`([^`]+)`/g, "$1") // Remove inline code
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/!\[.*?\]$$.*?$$/g, "") // Remove images
    .replace(/>\s*(.*)/g, "$1") // Remove blockquotes
    .replace(/\n+/g, " ") // Replace newlines with spaces
    .trim();

  return truncateText(plainText, maxLength);
}
