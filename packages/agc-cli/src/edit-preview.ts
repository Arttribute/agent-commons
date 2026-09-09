/** A compact replacement hunk for reviewing a proposed file write. */
export function editPreview(before: string, after: string, limit = 12_000): string {
  if (before === after) return '(no content change)';
  const oldLines = before ? before.split('\n') : [];
  const newLines = after ? after.split('\n') : [];
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
  let oldEnd = oldLines.length, newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) { oldEnd--; newEnd--; }
  const lines = [
    `@@ -${start + 1},${oldEnd - start} +${start + 1},${newEnd - start} @@`,
    ...oldLines.slice(Math.max(0, start - 3), start).map(line => ` ${line}`),
    ...oldLines.slice(start, oldEnd).map(line => `-${line}`),
    ...newLines.slice(start, newEnd).map(line => `+${line}`),
    ...newLines.slice(newEnd, newEnd + 3).map(line => ` ${line}`),
  ];
  // File content must not inject terminal escape sequences into an approval prompt.
  const preview = lines.join('\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '?');
  return preview.length > limit ? preview.slice(0, limit) + '\n… (preview truncated)' : preview;
}
