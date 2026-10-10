/** Filename hints only. Callers must supply already-authorized chat files. */
export function libraryFilenameSuggestions<T>(files: T[], query: string, filename: (file: T) => string): T[] {
  const words = (value: string) => value.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const extensions = new Set(['md', 'html', 'htm', 'json', 'js', 'png', 'jpg', 'jpeg', 'pdf', 'txt', 'zip', 'csv', 'docx', 'xlsx', 'pptx']);
  const requested = [...new Set(words(query))].filter(word => !extensions.has(word)).slice(0, 20);
  if (!requested.length) return [];
  const ranked = files.map(file => {
    const path = filename(file).replaceAll('\\', '/');
    const base = words(path.split('/').at(-1) ?? '');
    const parent = words(path.slice(0, path.lastIndexOf('/')));
    const matches = (tokens: string[], word: string) => tokens.some(token => token.startsWith(word));
    const score = requested.reduce((sum, word) => sum + (matches(base, word) ? 3 : matches(parent, word) ? 1 : 0), 0);
    return { file, path, score };
  }).filter(entry => entry.score > 0);
  return ranked.sort((a, b) => b.score - a.score || Number(!/\.md$/i.test(a.path)) - Number(!/\.md$/i.test(b.path)) || a.path.localeCompare(b.path)).slice(0, 8).map(entry => entry.file);
}
