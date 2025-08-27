import { Injectable, Logger } from '@nestjs/common';

/** Shape of a space-provided tool specification discovered at {pageUrl}/common-agent-tools/ */
export interface SpaceToolSpec {
  name: string;
  description?: string;
  parameters?: any; // JSON Schema
  apiSpec: {
    method: string;
    baseUrl: string;
    path: string;
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    bodyTemplate?: any;
  };
  /** Original source page URL the spec was fetched from */
  sourceUrl?: string;
  fetchedAt?: number;
}

interface SpaceToolsEntry {
  tools: SpaceToolSpec[];
  fetchedAt: number;
  sourceUrl?: string;
}

@Injectable()
export class SpaceToolsService {
  private readonly logger = new Logger(SpaceToolsService.name);
  private spaceTools = new Map<string, SpaceToolsEntry>(); // spaceId -> entry

  /** Store tools for a space (overwrites existing). */
  setToolsForSpace(spaceId: string, sourceUrl: string, specs: SpaceToolSpec[]) {
    this.spaceTools.set(spaceId, {
      tools: specs.map((t) => ({ ...t, sourceUrl, fetchedAt: Date.now() })),
      fetchedAt: Date.now(),
      sourceUrl,
    });
    this.logger.log(
      `Stored ${specs.length} space tool(s) for space ${spaceId} from ${sourceUrl}`,
    );
  }

  /** Append or upsert tools (matching by name). */
  upsertTools(spaceId: string, sourceUrl: string, specs: SpaceToolSpec[]) {
    const existing = this.spaceTools.get(spaceId);
    if (!existing) return this.setToolsForSpace(spaceId, sourceUrl, specs);
    const byName = new Map(existing.tools.map((t) => [t.name, t] as const));
    for (const spec of specs)
      byName.set(spec.name, { ...spec, sourceUrl, fetchedAt: Date.now() });
    const merged = Array.from(byName.values());
    this.spaceTools.set(spaceId, {
      tools: merged,
      fetchedAt: Date.now(),
      sourceUrl,
    });
    this.logger.log(
      `Upserted ${specs.length} space tool(s) for space ${spaceId}; total now ${merged.length}`,
    );
  }

  getToolsForSpace(spaceId: string): SpaceToolSpec[] {
    return this.spaceTools.get(spaceId)?.tools ?? [];
  }

  /** Find a space tool by name optionally scoped by space. If spaceId omitted, searches all. */
  findToolByName(
    name: string,
    spaceId?: string,
  ): { spaceId: string; tool: SpaceToolSpec } | null {
    if (spaceId) {
      const tool = this.getToolsForSpace(spaceId).find((t) => t.name === name);
      return tool ? { spaceId, tool } : null;
    }
    for (const [sid, entry] of this.spaceTools.entries()) {
      const tool = entry.tools.find((t) => t.name === name);
      if (tool) return { spaceId: sid, tool };
    }
    return null;
  }

  /** Simple snapshot for diagnostics */
  debugSnapshot() {
    return Array.from(this.spaceTools.entries()).map(([spaceId, entry]) => ({
      spaceId,
      count: entry.tools.length,
      fetchedAt: entry.fetchedAt,
      sourceUrl: entry.sourceUrl,
      toolNames: entry.tools.map((t) => t.name),
    }));
  }
}
