import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';
import {
  commonsServiceIdentityConfigured,
  commonsServiceToken,
  resetCommonsServiceToken,
} from './commons-service-token';
import type {
  ArcadeGameDocument,
  ArcadeGameWrite,
  ArcadeProject,
  ArcadeRelease,
} from './arcade.types';

/** Arcade rejects documents over this size, so fail before the round trip. */
const MAX_DOCUMENT_BYTES = 120_000;
const MAX_FILES = 60;

type ArcadeProblem = {
  title?: string;
  detail?: string;
  code?: string;
  blockers?: string[];
  violations?: { field?: string; message?: string }[];
};

/**
 * A failed Arcade call the agent can usually act on: a validation violation
 * names the field to fix, a publish blocker names what is missing. The message
 * is written for the model that made the call, because that is what the tool
 * returns.
 */
export class ArcadeError extends BadRequestException {
  constructor(
    message: string,
    /** HTTP status Arcade returned, kept apart from this exception's own. */
    readonly upstreamStatus: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ArcadeService {
  constructor(private readonly db: DatabaseService) {}

  /** True when this deployment can reach Arcade as the platform service. */
  isConnected() {
    return commonsServiceIdentityConfigured();
  }

  /**
   * Arcade attributes work to the creator who owns the agent, so their game
   * appears in their own Studio. Without an owner there is no account to build
   * in, and a service-owned project would be unreachable by anyone.
   */
  async actorForAgent(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: eq(schema.agent.agentId, agentId),
      columns: { ownerUserId: true, owner: true },
    });
    const actor = agent?.ownerUserId || agent?.owner;
    if (!actor) {
      throw new BadRequestException(
        'This agent has no owner account, so it cannot build in Common Arcade.',
      );
    }
    return actor;
  }

  /** Control-plane base, e.g. https://arcade.agentcommons.io/api/arcade */
  private apiUrl() {
    return (
      process.env.ARCADE_API_URL ?? 'https://arcade.agentcommons.io/api/arcade'
    ).replace(/\/$/, '');
  }

  /** Where a creator opens the result, e.g. https://arcade.agentcommons.io */
  private webUrl() {
    return (
      process.env.ARCADE_WEB_URL ?? 'https://arcade.agentcommons.io'
    ).replace(/\/$/, '');
  }

  studioUrl(projectId: string) {
    return `${this.webUrl()}/studio/${projectId}`;
  }

  gameUrl(projectId: string) {
    return `${this.webUrl()}/games/${projectId}`;
  }

  /**
   * Arcade authenticates this platform by its Commons service identity and
   * attributes the work to `actor`, so the project lands in that creator's own
   * Studio rather than in a service account they cannot open.
   */
  private async request<T>(
    actor: string,
    path: string,
    init: {
      method?: string;
      body?: unknown;
      ifMatch?: number;
      retryOnUnauthorized?: boolean;
    } = {},
  ): Promise<T> {
    if (!commonsServiceIdentityConfigured()) {
      throw new ServiceUnavailableException(
        'Common Arcade is not connected on this deployment. Set COMMONS_IDENTITY_ISSUER, AGENT_COMMONS_SERVICE_CLIENT_ID and AGENT_COMMONS_SERVICE_CLIENT_SECRET.',
      );
    }
    const token = await commonsServiceToken();
    if (!token) {
      throw new ServiceUnavailableException(
        'Could not obtain a Commons service token for Common Arcade. Retry shortly.',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl()}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Commons-Actor': actor,
          'Content-Type': 'application/json',
          ...(init.ifMatch !== undefined && {
            'If-Match': String(init.ifMatch),
          }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: 'error',
        // Publishing runs the game's runtime harness, which is slow but bounded.
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Common Arcade is unreachable right now (${error instanceof Error ? error.message : 'network error'}). Retry shortly.`,
      );
    }

    // A cached token can be revoked before its expiry; one silent retry with a
    // fresh token is cheaper than surfacing that to the agent.
    if (response.status === 401 && init.retryOnUnauthorized !== false) {
      resetCommonsServiceToken();
      return this.request<T>(actor, path, {
        ...init,
        retryOnUnauthorized: false,
      });
    }

    const raw = await response.text();
    if (!response.ok) throw this.toError(response.status, raw);
    if (!raw) return undefined as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new ServiceUnavailableException(
        `Common Arcade returned an unreadable response (HTTP ${response.status}).`,
      );
    }
  }

  /** Turn an Arcade problem document into guidance the calling agent can use. */
  private toError(status: number, raw: string) {
    let problem: ArcadeProblem | null = null;
    try {
      problem = JSON.parse(raw) as ArcadeProblem;
    } catch {
      problem = null;
    }
    const parts = [
      problem?.detail ?? problem?.title ?? `Arcade returned HTTP ${status}.`,
    ];
    if (problem?.violations?.length) {
      parts.push(
        `Invalid fields: ${problem.violations
          .map((v) => `${v.field ?? 'body'} — ${v.message ?? 'invalid'}`)
          .join('; ')}`,
      );
    }
    if (problem?.blockers?.length) {
      parts.push(`Blockers: ${problem.blockers.join('; ')}`);
    }
    if (problem?.code === 'THUMBNAIL_REQUIRED') {
      parts.push(
        'Set a thumbnail with arcade_write_game (an HTTPS image URL, or a data:image/png;base64 URI) and publish again.',
      );
    }
    if (status === 409 && !problem?.code) {
      parts.push(
        'The project changed since it was read. Call arcade_read_project again and reapply the change.',
      );
    }
    return new ArcadeError(parts.join(' '), status, problem?.code);
  }

  /* ─────────────────────────  PROJECTS  ───────────────────────── */

  async listProjects(actor: string) {
    const { projects } = await this.request<{ projects: ArcadeProject[] }>(
      actor,
      '/v1/projects',
    );
    return projects.map((project) => this.summarize(project));
  }

  async readProject(actor: string, projectId: string) {
    const project = await this.request<ArcadeProject>(
      actor,
      `/v1/projects/${encodeURIComponent(projectId)}`,
    );
    return {
      ...this.summarize(project),
      document: project.document,
      annotations: project.annotations ?? [],
    };
  }

  async createProject(
    actor: string,
    input: { title: string; description?: string },
  ) {
    const project = await this.request<ArcadeProject>(actor, '/v1/projects', {
      method: 'POST',
      body: {},
    });
    // A new project starts from Arcade's placeholder document; naming it now
    // means the creator sees their own game in the Studio list right away.
    return this.writeGame(actor, project.id, {
      title: input.title,
      description: input.description,
    });
  }

  /**
   * Read, merge and save. Arcade takes the whole document with the revision it
   * was read at, so a partial change is applied against current state rather
   * than sent on its own.
   */
  async writeGame(actor: string, projectId: string, input: ArcadeGameWrite) {
    const current = await this.request<ArcadeProject>(
      actor,
      `/v1/projects/${encodeURIComponent(projectId)}`,
    );
    const document = this.merge(current.document, input);
    this.assertWithinLimits(document);

    const saved = await this.request<ArcadeProject>(
      actor,
      `/v1/projects/${encodeURIComponent(projectId)}`,
      { method: 'PUT', body: document, ifMatch: current.revision },
    );
    return {
      ...this.summarize(saved),
      files: saved.document.files.map((file) => file.path),
    };
  }

  private merge(
    current: ArcadeGameDocument,
    input: ArcadeGameWrite,
  ): ArcadeGameDocument {
    const byPath = new Map(
      (input.replaceFiles ? [] : (current.files ?? [])).map((file) => [
        file.path,
        file,
      ]),
    );
    for (const file of input.files ?? []) byPath.set(file.path, file);

    const document: ArcadeGameDocument = {
      ...current,
      kind: 'browser',
      title: input.title ?? current.title,
      description: input.description ?? current.description ?? '',
      entryFile: input.entryFile ?? current.entryFile ?? 'index.html',
      files: [...byPath.values()],
    };
    if (input.thumbnail) document.thumbnail = input.thumbnail;
    if (input.play) document.play = { ...(current.play ?? {}), ...input.play };
    if (input.runtime) {
      document.runtime = {
        kind: 'sandboxed-script',
        ...(current.runtime ?? {}),
        ...input.runtime,
      };
    }
    if (input.dependencies?.length) {
      document.dependencies = {
        ...(current.dependencies ?? {}),
        ...Object.fromEntries(
          input.dependencies.map((d) => [d.name, d.version]),
        ),
      };
    }
    return document;
  }

  /** Reject documents Arcade would refuse, with a direct instruction. */
  private assertWithinLimits(document: ArcadeGameDocument) {
    if (!document.files.length) {
      throw new ArcadeError(
        'A game needs at least one source file. Send the complete files with arcade_write_game.',
        422,
      );
    }
    if (document.files.length > MAX_FILES) {
      throw new ArcadeError(
        `Arcade allows at most ${MAX_FILES} source files; this document has ${document.files.length}.`,
        422,
      );
    }
    if (!document.files.some((file) => file.path === document.entryFile)) {
      throw new ArcadeError(
        `entryFile "${document.entryFile}" is not one of the project files (${document.files
          .map((file) => file.path)
          .join(', ')}).`,
        422,
      );
    }
    const size = Buffer.byteLength(JSON.stringify(document), 'utf8');
    if (size > MAX_DOCUMENT_BYTES) {
      throw new ArcadeError(
        `Project source is ${Math.round(size / 1024)} KB; Arcade allows 120 KB. Trim the source or host media as separate assets.`,
        422,
      );
    }
  }

  /* ─────────────────────────  TEST AND PUBLISH  ───────────────────────── */

  async testGame(
    actor: string,
    projectId: string,
    input: { seed?: string; steps?: number } = {},
  ) {
    return this.request(
      actor,
      `/v1/projects/${encodeURIComponent(projectId)}/runs`,
      {
        method: 'POST',
        body: {
          ...(input.seed && { seed: input.seed }),
          ...(input.steps && { steps: input.steps }),
        },
      },
    );
  }

  async publishGame(actor: string, projectId: string) {
    const current = await this.request<ArcadeProject>(
      actor,
      `/v1/projects/${encodeURIComponent(projectId)}`,
    );
    const release = await this.request<ArcadeRelease>(
      actor,
      `/v1/projects/${encodeURIComponent(projectId)}/publish`,
      { method: 'POST', body: {}, ifMatch: current.revision },
    );
    return {
      projectId,
      releaseId: release.id,
      revision: release.revision,
      publishedAt: release.publishedAt,
      studioUrl: this.studioUrl(projectId),
      gameUrl: this.gameUrl(projectId),
    };
  }

  private summarize(project: ArcadeProject) {
    return {
      projectId: project.id,
      title: project.document?.title,
      description: project.document?.description,
      revision: project.revision,
      isPublished: Boolean(project.releaseId),
      hasThumbnail: Boolean(project.document?.thumbnail),
      updatedAt: project.updatedAt,
      studioUrl: this.studioUrl(project.id),
    };
  }
}
