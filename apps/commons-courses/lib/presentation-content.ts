export function presentationSlides(content: string) {
  const matches = [
    ...content.matchAll(/^--- (?:Original\s+)?Slide (\d+) ---\s*$/gim),
  ];
  if (!matches.length)
    return content.trim() ? [{ sourceNumber: 1, text: content.trim() }] : [];
  return matches.map((match, index) => ({
    sourceNumber: Number(match[1]),
    text: content
      .slice((match.index || 0) + match[0].length, matches[index + 1]?.index)
      .trim(),
  }));
}
