/** Per-turn cursors for models that omit offsets while reading long files. */
export class LibraryReadCursor {
  private readonly offsets = new Map<string, number>();
  private readonly coverage = new Map<string, { name: string; totalChars: number; ranges: [number, number][] }>();

  arguments(name: string, args: Record<string, unknown>) {
    if (name !== 'read_library_item' || args.offset !== undefined || typeof args.itemId !== 'string') return args;
    const offset = this.offsets.get(args.itemId);
    return offset === undefined ? args : { ...args, offset };
  }

  record(name: string, args: Record<string, unknown>, result: string) {
    if (name !== 'read_library_item') return;
    try {
      const data = JSON.parse(result);
      if (typeof data.content !== 'string' || !Number.isInteger(data.offset) || data.offset < 0) return;
      const next = data.nextOffset === null ? data.totalChars : data.nextOffset;
      if (!Number.isInteger(next) || next < data.offset) return;
      for (const alias of [args.itemId, data.itemId, data.name]) {
        if (typeof alias === 'string') this.offsets.set(alias, next);
      }
      // A cursor hint can advance without retaining text, but coverage must
      // describe only the actual characters returned by a successful read.
      if (typeof data.itemId !== 'string' || !Number.isInteger(data.totalChars)
        || data.totalChars < next || data.content.length !== next - data.offset) return;
      const previous = this.coverage.get(data.itemId);
      const ranges = previous && previous.totalChars === data.totalChars ? [...previous.ranges] : [];
      if (next > data.offset) ranges.push([data.offset, next]);
      ranges.sort((a, b) => a[0] - b[0]);
      const merged: [number, number][] = [];
      for (const [start, end] of ranges) {
        const last = merged.at(-1);
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else merged.push([start, end]);
      }
      this.coverage.delete(data.itemId);
      this.coverage.set(data.itemId, { name: typeof data.name === 'string' ? data.name : data.itemId, totalChars: data.totalChars, ranges: merged.slice(-32) });
      if (this.coverage.size > 20) this.coverage.delete(this.coverage.keys().next().value!);
    } catch { /* Errors and other tool results cannot advance the cursor. */ }
  }

  render(limit = 1200) {
    const entries: string[] = [];
    let bytes = 0;
    for (const [itemId, file] of [...this.coverage.entries()].reverse()) {
      const entry = JSON.stringify({ itemId, name: file.name.slice(0, 120), totalChars: file.totalChars,
        readRanges: file.ranges, fullyRead: file.totalChars === 0 || (file.ranges.length === 1 && file.ranges[0][0] === 0 && file.ranges[0][1] === file.totalChars) });
      const size = Buffer.byteLength(entry) + 1;
      if (bytes + size > limit) continue;
      entries.unshift(entry);
      bytes += size;
    }
    return entries.join('\n');
  }
}
