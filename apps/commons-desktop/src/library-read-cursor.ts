/** Per-turn cursors for models that omit offsets while reading long files. */
export class LibraryReadCursor {
  private readonly offsets = new Map<string, number>();

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
    } catch { /* Errors and other tool results cannot advance the cursor. */ }
  }
}
