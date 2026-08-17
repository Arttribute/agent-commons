export function truncateEmailText(value: string, maxLength = 280) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const window = normalized.slice(0, maxLength + 1);
  const minimumUsefulLength = Math.floor(maxLength * 0.6);
  const punctuationBreak = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("? "),
    window.lastIndexOf("! "),
  );
  const wordBreak = window.lastIndexOf(" ");
  const breakAt =
    punctuationBreak >= minimumUsefulLength
      ? punctuationBreak + 1
      : wordBreak >= minimumUsefulLength
        ? wordBreak
        : maxLength;

  return `${normalized.slice(0, breakAt).trimEnd()}…`;
}
