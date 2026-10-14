import { Injectable, Logger } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { ModelProviderFactory } from '~/modules/model-provider';

export type StartSuggestion = { text: string; app?: string | null; kind?: string };

const CACHE_MS = 6 * 60 * 60_000;
const CACHE_LIMIT = 1_000;
const MODEL_TIMEOUT_MS = 12_000;
const KINDS = ['research', 'document', 'website', 'schedule', 'data', 'image', 'agent'];
const GENERIC_TITLES = new Set(['new chat', 'new session', 'new conversation']);

const PROMPT = `You suggest what a person could ask their AI agents to do next on Agent Commons.

Agents on Agent Commons can research the web with sources, write and edit documents, slides and spreadsheets, build and publish small websites and apps, create and edit images and video, run tasks on a schedule (daily briefings, monitoring), work inside connected apps, use a cloud computer to run code, remember facts, and organize work into projects.

From the person's recent chat titles (newest first), their projects and their connected apps, write exactly 3 suggestions:
- Each is one short imperative request in the person's voice, at most 12 words, specific to their work. Example: "Draft the launch email for Common Business".
- Prefer continuing or advancing recent work. Never just repeat a title.
- At most one suggestion may use a connected app, and only an app from the list.
- No emojis, no quotes, no trailing period.

Reply with JSON only: {"suggestions":[{"text":"...","app":"<connected app name or null>","kind":"research|document|website|schedule|data|image|agent|null"}]}`;

/** Clean, cap and deduplicate whatever the model returned. */
export function parseSuggestions(raw: string, connectedApps: string[]): StartSuggestion[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const apps = new Map(connectedApps.map((app) => [app.toLowerCase(), app]));
  const seen = new Set<string>();
  const out: StartSuggestion[] = [];
  for (const item of Array.isArray(parsed?.suggestions) ? parsed.suggestions : []) {
    const text =
      typeof item?.text === 'string'
        ? item.text.replace(/\s+/g, ' ').trim().replace(/^["'“”]+|["'“”.]+$/g, '').trim()
        : '';
    if (!text || text.length > 120 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const app = typeof item?.app === 'string' ? apps.get(item.app.trim().toLowerCase()) ?? null : null;
    const kind = typeof item?.kind === 'string' && KINDS.includes(item.kind) ? item.kind : undefined;
    out.push({ text, app, ...(kind ? { kind } : {}) });
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Ideas for the /new page, written from a person's recent chat titles. One
 * small model call per person, cached until they start another chat.
 */
@Injectable()
export class SessionSuggestionsService {
  private readonly logger = new Logger(SessionSuggestionsService.name);
  private readonly cache = new Map<string, { key: string; at: number; suggestions: StartSuggestion[] }>();

  constructor(
    private readonly db: DatabaseService,
    private readonly models: ModelProviderFactory,
  ) {}

  async suggest(initiator: string, connectedApps: string[] = []): Promise<{ suggestions: StartSuggestion[] }> {
    const owner = initiator.toLowerCase();
    const apps = [...new Set(connectedApps.filter((app) => typeof app === 'string' && app.trim()).map((app) => app.trim().slice(0, 40)))].slice(0, 12);

    const sessions = await this.db.query.session.findMany({
      where: (s) => eq(s.initiator, owner),
      columns: { sessionId: true, title: true, agentId: true, projectId: true },
      orderBy: (s) => [desc(s.updatedAt), desc(s.createdAt)],
      limit: 25,
    });
    const titled = sessions.filter((session) => session.title && !GENERIC_TITLES.has(session.title.trim().toLowerCase()));
    if (!titled.length) return { suggestions: [] };

    const key = `${sessions[0].sessionId}:${sessions.length}:${apps.sort().join(',')}`;
    const cached = this.cache.get(owner);
    if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) return { suggestions: cached.suggestions };

    const agentIds = [...new Set(titled.map((session) => session.agentId))];
    const projectIds = [...new Set(titled.map((session) => session.projectId).filter((id): id is string => Boolean(id)))];
    const [agents, projects] = await Promise.all([
      agentIds.length
        ? this.db.select({ agentId: schema.agent.agentId, name: schema.agent.name }).from(schema.agent).where(inArray(schema.agent.agentId, agentIds))
        : Promise.resolve([] as Array<{ agentId: string; name: string }>),
      projectIds.length
        ? this.db.select({ projectId: schema.project.projectId, name: schema.project.name }).from(schema.project).where(inArray(schema.project.projectId, projectIds))
        : Promise.resolve([] as Array<{ projectId: string; name: string }>),
    ]);
    const agentNames = new Map(agents.map((agent) => [agent.agentId, agent.name]));
    const projectNames = new Map(projects.map((project) => [project.projectId, project.name]));

    const lines = titled.slice(0, 15).map((session) => {
      const where = [agentNames.get(session.agentId), session.projectId ? projectNames.get(session.projectId) : null].filter(Boolean).join(', ');
      return `- ${session.title!.slice(0, 100)}${where ? ` (${where})` : ''}`;
    });
    const context = [
      `Recent chats:\n${lines.join('\n')}`,
      projects.length ? `Projects: ${projects.map((project) => project.name).join(', ')}` : '',
      `Connected apps: ${apps.length ? apps.join(', ') : 'none'}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const model = this.models.build({ provider: 'openai', modelId: 'gpt-5.4-mini', temperature: 0.7, maxTokens: 400 });
      const response = await Promise.race([
        model.invoke([
          { role: 'system', content: PROMPT },
          { role: 'user', content: context },
        ]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Suggestion model timed out')), MODEL_TIMEOUT_MS);
        }),
      ]);
      const content = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content.map((part: any) => (typeof part === 'string' ? part : part?.text ?? '')).join('')
          : '';
      const suggestions = parseSuggestions(content, apps);
      if (suggestions.length) {
        if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(owner, { key, at: Date.now(), suggestions });
      }
      return { suggestions };
    } catch (error) {
      this.logger.warn(`Start suggestions unavailable: ${error instanceof Error ? error.message : error}`);
      return { suggestions: [] };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
