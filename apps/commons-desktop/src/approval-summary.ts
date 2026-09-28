/** Removes terminal colour codes from local tool prompts. */
export function plainSummary(summary: string) {
  return summary.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

/**
 * One line for the collapsed in-chat approval, derived from the local tool's
 * prompt. The full prompt stays available as the expandable detail.
 */
export function approvalTitle(summary: string, permission: string) {
  const text = plainSummary(summary);
  const first = text.split("\n")[0] ?? "";
  const write = /^Agent wants to write file:\s*(.+?)(?:\s+\(\d+ chars\))?$/.exec(first);
  if (write) return `Write ${write[1]}`;
  const run = /^Agent wants to run:\s*(.+)$/.exec(first);
  if (run) return `Run ${run[1]}`;
  const start = /^Agent wants to start background process:\s*(.+)$/.exec(first);
  if (start) return `Start ${start[1]}`;
  const local = /^local (create knowledge space|create note|save skill|register app):\s*(.*)$/.exec(first.replaceAll("_", " "));
  if (local) {
    const name = /"(?:name|path|slug)":"([^"]+)"/.exec(local[2])?.[1];
    return `${local[1][0].toUpperCase()}${local[1].slice(1)}${name ? ` · ${name}` : ""}`;
  }
  if (first) return first;
  return permission.replaceAll("_", " ");
}
