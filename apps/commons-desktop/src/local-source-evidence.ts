/** Keep complete small task inputs when later tool exchanges are compacted. */
export class LocalSourceEvidence {
  private readonly sources = new Map<string, string>();

  record(name: string, result: string) {
    if (name !== 'read_library_item') return;
    try {
      const data = JSON.parse(result);
      if (typeof data.itemId !== 'string' || typeof data.content !== 'string'
        || data.offset !== 0 || data.nextOffset !== null
        || !Number.isInteger(data.totalChars) || data.totalChars <= 0
        || data.content.length !== data.totalChars || data.totalChars > 1600) return;
      this.sources.set(data.itemId, JSON.stringify({ itemId: data.itemId, name: data.name, content: data.content, pythonInput: data.pythonInput }));
      if (this.sources.size > 20) this.sources.delete(this.sources.keys().next().value!);
    } catch { /* Failed reads and terminal messages cannot replace source facts. */ }
  }

  render(limit = 2400) {
    const retained: string[] = [];
    let bytes = 0;
    for (const source of [...this.sources.values()].reverse()) {
      const size = Buffer.byteLength(source) + 1;
      if (bytes + size > limit) continue;
      retained.unshift(source);
      bytes += size;
    }
    return retained.join('\n');
  }
}
