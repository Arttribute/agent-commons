import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { and, desc, eq, or } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database';
import { WorkflowService } from '~/tool/workflow.service';
import * as schema from '#/models/schema';
import {
  COMMONS_COPILOT_OPERATING_GUIDE,
  CopilotUiContext,
  resourceStudioUrl,
  sanitizeUiContext,
} from './copilot-platform-guide';

export type CopilotAccessMode = 'full' | 'scoped' | 'confirm';
export type CopilotScope =
  | 'agents'
  | 'tools'
  | 'skills'
  | 'tasks'
  | 'workflows'
  | 'account';

const VALID_SCOPES = new Set<CopilotScope>([
  'agents',
  'tools',
  'skills',
  'tasks',
  'workflows',
  'account',
]);

type WorkflowProposal = {
  workflowId?: string;
  name?: string;
  description?: string;
  definition: any;
  summary: string;
  /** Copilot session the proposal was made in (from tool-call metadata). */
  originSessionId?: string;
};

type ResourceProposal = {
  resourceId?: string;
  summary: string;
  data: Record<string, any>;
  /** Copilot session the proposal was made in (from tool-call metadata). */
  originSessionId?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionUuidOrNull(value?: string) {
  return value && UUID_PATTERN.test(value) ? value : null;
}

type TaskProposal = ResourceProposal & {
  data: {
    agentId?: string;
    sessionId?: string;
    title?: string;
    description?: string;
    executionMode?: 'single' | 'workflow' | 'sequential';
    workflowId?: string;
    workflowInputs?: Record<string, any>;
    cronExpression?: string;
    scheduledFor?: string | Date;
    isRecurring?: boolean;
    dependsOn?: string[];
    tools?: string[];
    toolConstraintType?: 'hard' | 'soft' | 'none';
    toolInstructions?: string;
    recurringSessionMode?: 'same' | 'new';
    context?: Record<string, any>;
    priority?: number;
  };
};

@Injectable()
export class CopilotService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => WorkflowService))
    private readonly workflows: WorkflowService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async getCopilotForOwner(ownerUserId: string) {
    return this.db.query.agent.findFirst({
      where: (t) => and(eq(t.ownerUserId, ownerUserId), eq(t.isDefault, true)),
    });
  }

  async updateSettings(
    ownerUserId: string,
    input: { accessMode: CopilotAccessMode; scopes?: string[] },
  ) {
    if (!['full', 'scoped', 'confirm'].includes(input.accessMode)) {
      throw new BadRequestException('Invalid copilot access mode');
    }
    const scopes = [...new Set(input.scopes ?? [])];
    if (scopes.some((scope) => !VALID_SCOPES.has(scope as CopilotScope))) {
      throw new BadRequestException('One or more copilot scopes are invalid');
    }
    const copilot = await this.requireCopilotForOwner(ownerUserId);
    const [updated] = await this.db
      .update(schema.agent)
      .set({
        copilotAccessMode: input.accessMode,
        copilotScopes: input.accessMode === 'scoped' ? scopes : [],
      })
      .where(eq(schema.agent.agentId, copilot.agentId))
      .returning();
    return updated;
  }

  async listChanges(
    ownerUserId: string,
    filter: {
      status?: string;
      resourceType?: string;
      resourceId?: string;
    } = {},
  ) {
    const conditions = [eq(schema.copilotChange.ownerUserId, ownerUserId)];
    if (filter.status) {
      conditions.push(eq(schema.copilotChange.status, filter.status));
    }
    if (filter.resourceType) {
      conditions.push(
        eq(schema.copilotChange.resourceType, filter.resourceType),
      );
    }
    if (filter.resourceId) {
      conditions.push(eq(schema.copilotChange.resourceId, filter.resourceId));
    }
    return this.db.query.copilotChange.findMany({
      where: () => and(...conditions),
      orderBy: (t) => [desc(t.createdAt)],
      limit: 50,
    });
  }

  async listResources(
    agentId: string,
    resourceTypes: Array<'agents' | 'tools' | 'skills' | 'tasks' | 'workflows'>,
  ) {
    const copilot = await this.requireSystemCopilot(agentId);
    const ownerId = copilot.ownerUserId!;
    const requested = resourceTypes.length
      ? resourceTypes
      : ['agents', 'tools', 'skills', 'tasks', 'workflows'];
    const result: Record<string, unknown> = {};

    if (requested.includes('agents')) {
      result.agents = await this.db.query.agent.findMany({
        where: (t) => or(eq(t.ownerUserId, ownerId), eq(t.owner, ownerId)),
        columns: {
          agentId: true,
          name: true,
          persona: true,
          runtimeType: true,
          runtimeStatus: true,
          isDefault: true,
          createdAt: true,
        },
        limit: 100,
      });
    }
    if (requested.includes('workflows')) {
      result.workflows = await this.workflows.listWorkflows(ownerId, 'user');
    }
    if (requested.includes('tools')) {
      const [tools, keys, connections] = await Promise.all([
        this.db.query.tool.findMany({
          where: (t) => eq(t.owner, ownerId),
          limit: 100,
        }),
        this.db.query.toolKey.findMany({
          where: (t) =>
            and(
              eq(t.ownerId, ownerId),
              eq(t.ownerType, 'user'),
              eq(t.isActive, true),
            ),
          columns: { keyName: true, toolId: true, expiresAt: true },
          limit: 200,
        }),
        this.db.query.oauthConnection.findMany({
          where: (t) =>
            and(
              eq(t.ownerId, ownerId),
              eq(t.ownerType, 'user'),
              eq(t.status, 'active'),
            ),
          with: { provider: true },
          limit: 100,
        }),
      ]);
      const activeProviders = new Set(
        connections.map((item: any) => item.provider?.providerKey),
      );
      result.tools = tools.map((tool: any) => {
        const authType = tool.apiSpec?.authType ?? 'none';
        const authKeyName = tool.apiSpec?.authKeyName;
        const oauthProviderKey = tool.apiSpec?.oauthProviderKey;
        const configured =
          authType === 'none' ||
          (authType === 'oauth2'
            ? activeProviders.has(oauthProviderKey)
            : keys.some(
                (key: any) =>
                  (!key.expiresAt || new Date(key.expiresAt) > new Date()) &&
                  (key.toolId === tool.toolId ||
                    (authKeyName && key.keyName === authKeyName)),
              ));
        return {
          toolId: tool.toolId,
          name: tool.name,
          displayName: tool.displayName,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          category: tool.category,
          tags: tool.tags,
          api: tool.apiSpec
            ? {
                baseUrl: tool.apiSpec.baseUrl,
                path: tool.apiSpec.path,
                method: tool.apiSpec.method,
                authType,
                authKeyName,
                oauthProviderKey,
              }
            : null,
          configuration: { configured, authType },
          studioUrl: resourceStudioUrl('tool', tool.toolId),
        };
      });
    }
    if (requested.includes('skills')) {
      result.skills = await this.db.query.skill.findMany({
        where: (t) => eq(t.ownerId, ownerId),
        limit: 100,
      });
    }
    if (requested.includes('tasks')) {
      result.tasks = await this.db.query.task.findMany({
        where: (t) => eq(t.createdBy, ownerId),
        limit: 100,
      });
    }
    return result;
  }

  /**
   * Build a server-verified context block for the native Copilot. Client page
   * context is only a hint; resource details are reloaded and ownership is
   * checked here before they reach the model.
   */
  async buildRunContext(
    agentId: string,
    initiator: string,
    rawUiContext?: CopilotUiContext,
  ) {
    const copilot = await this.requireSystemCopilot(agentId);
    const ownerUserId = copilot.ownerUserId!;
    const ui = sanitizeUiContext(rawUiContext);
    let visibleResource: Record<string, unknown> | null = null;

    if (ui?.resourceType && ui.resourceId) {
      visibleResource = await this.getOwnedResourceSummary(
        ownerUserId,
        ui.resourceType,
        ui.resourceId,
      ).catch(() => null);
    }

    const [connections, availableSkills] = await Promise.all([
      this.db.query.oauthConnection.findMany({
        where: (t) => and(eq(t.ownerId, ownerUserId), eq(t.ownerType, 'user')),
        with: { provider: true },
        limit: 100,
      }),
      this.db.query.skill.findMany({
        where: (t) =>
          and(
            eq(t.isActive, true),
            or(eq(t.isPublic, true), eq(t.ownerId, ownerUserId)),
          ),
        columns: {
          skillId: true,
          slug: true,
          name: true,
          description: true,
          triggers: true,
          tools: true,
        },
        limit: 100,
      }),
    ]);
    const integrations = connections.map((connection: any) => ({
      provider: connection.provider?.providerKey ?? connection.providerId,
      name: connection.displayName ?? connection.provider?.displayName,
      status: connection.status,
      scopes: connection.scopes ?? [],
      lastError: connection.lastError || undefined,
    }));

    return `${COMMONS_COPILOT_OPERATING_GUIDE}\n\n## Current verified context\n${JSON.stringify(
      {
        userId: initiator,
        now: new Date().toISOString(),
        currentPage: ui
          ? {
              pathname: ui.pathname,
              pageTitle: ui.pageTitle,
              routeName: ui.routeName,
              timeZone: ui.timeZone,
              locale: ui.locale,
            }
          : null,
        visibleResource,
        integrations,
        availableSkills,
        access: {
          mode: copilot.copilotAccessMode ?? 'confirm',
          scopes: copilot.copilotScopes ?? [],
        },
      },
      null,
      2,
    )}\nTreat visibleResource as the current page target only when the user's words do not name a different target.`;
  }

  async proposeAgentChange(agentId: string, proposal: ResourceProposal) {
    return this.proposeResourceChange(agentId, 'agents', 'agent', proposal);
  }

  async proposeTaskChange(agentId: string, proposal: TaskProposal) {
    if (!proposal.resourceId && !proposal.data?.agentId) {
      throw new BadRequestException(
        'A target agentId is required. Resolve the named agent before proposing the task.',
      );
    }
    if (!proposal.resourceId && !proposal.data.title?.trim()) {
      throw new BadRequestException('A task title is required');
    }
    return this.proposeResourceChange(agentId, 'tasks', 'task', proposal);
  }

  async proposeSkillChange(agentId: string, proposal: ResourceProposal) {
    return this.proposeResourceChange(agentId, 'skills', 'skill', proposal);
  }

  async proposeToolChange(agentId: string, proposal: ResourceProposal) {
    return this.proposeResourceChange(agentId, 'tools', 'tool', proposal);
  }

  async assertMutationAllowed(
    agentId: string,
    scope: CopilotScope,
    confirmed = false,
  ) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });
    if (!agent?.isSystemManaged || !agent.isDefault) return;
    if (this.canAutoApply(agent, scope) || confirmed) return;
    throw new ForbiddenException(
      `This ${scope} change needs the user's explicit confirmation under the current Commons Copilot access policy. Explain the exact change, wait for approval, then retry with confirmed=true.`,
    );
  }

  async isSystemCopilot(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
      columns: { isDefault: true, isSystemManaged: true },
    });
    return Boolean(agent?.isDefault && agent.isSystemManaged);
  }

  async proposeWorkflowChange(agentId: string, proposal: WorkflowProposal) {
    const copilot = await this.requireSystemCopilot(agentId);
    const ownerUserId = copilot.ownerUserId!;
    if (!proposal.definition || !Array.isArray(proposal.definition.nodes)) {
      throw new BadRequestException(
        'A complete workflow definition with nodes and edges is required',
      );
    }
    if (!Array.isArray(proposal.definition.edges)) {
      throw new BadRequestException(
        'Workflow definition edges must be an array',
      );
    }

    let before: any = null;
    let resourceId = proposal.workflowId ?? null;
    const action = proposal.workflowId ? 'update' : 'create';
    if (proposal.workflowId) {
      const workflow = await this.workflows.getWorkflow(proposal.workflowId);
      if (
        workflow.ownerType !== 'user' ||
        workflow.ownerId.toLowerCase() !== ownerUserId.toLowerCase()
      ) {
        throw new ForbiddenException('The copilot cannot edit this workflow');
      }
      before = this.workflowSnapshot(workflow);
    } else if (!proposal.name?.trim()) {
      throw new BadRequestException('A name is required for a new workflow');
    }

    const definition = this.normalizeWorkflowDefinition(proposal.definition);
    const after = {
      name: proposal.name?.trim() || before?.name,
      description:
        proposal.description !== undefined
          ? proposal.description
          : before?.description,
      definition,
    };
    const autoApply = this.canAutoApply(copilot, 'workflows');

    let [change] = await this.db
      .insert(schema.copilotChange)
      .values({
        agentId,
        ownerUserId,
        sessionId: sessionUuidOrNull(proposal.originSessionId),
        scope: 'workflows',
        resourceType: 'workflow',
        resourceId,
        action,
        // Record the intent before mutating user state so even automatic mode
        // never creates an unaudited write if the apply step fails.
        status: 'pending',
        title: proposal.summary.trim() || `${action} workflow`,
        description: proposal.description,
        before,
        after,
        diff: this.workflowDiff(before?.definition, after.definition),
      })
      .returning();

    if (autoApply) {
      const applied = await this.applyWorkflowPayload({
        action,
        resourceId,
        ownerUserId,
        after,
      });
      resourceId = applied.workflowId;
      [change] = await this.db
        .update(schema.copilotChange)
        .set({
          status: 'applied',
          resourceId,
          appliedAt: new Date(),
        })
        .where(eq(schema.copilotChange.changeId, change.changeId))
        .returning();
    }

    return {
      change,
      requiresConfirmation: !autoApply,
      message: autoApply
        ? 'Workflow change applied and recorded. The user can review or undo it.'
        : 'Workflow change is ready for user review. It has not modified the workflow.',
    };
  }

  async acceptChange(ownerUserId: string, changeId: string) {
    const change = await this.requireChange(ownerUserId, changeId);
    if (change.status !== 'pending') {
      throw new ConflictException('Only pending changes can be accepted');
    }
    let before: any = change.before;
    let after = change.after as any;
    let diff = change.diff;
    if (
      change.resourceType === 'workflow' &&
      change.action === 'update' &&
      change.resourceId
    ) {
      const current = await this.workflows.getWorkflow(change.resourceId);
      before = this.workflowSnapshot(current);
      after = this.rebaseWorkflowChange(before, change.before, change.after);
      diff = this.workflowDiff(before.definition, after.definition);
    }
    const applied =
      change.resourceType === 'workflow'
        ? await this.applyWorkflowPayload({
            action: change.action,
            resourceId: change.resourceId,
            ownerUserId,
            after,
          })
        : await this.applyResourcePayload(
            change.resourceType,
            change.action,
            change.resourceId,
            ownerUserId,
            after,
          );
    const [updated] = await this.db
      .update(schema.copilotChange)
      .set({
        status: 'applied',
        resourceId: this.resourceIdFor(change.resourceType, applied),
        before,
        after,
        diff,
        reviewedAt: new Date(),
        appliedAt: new Date(),
      })
      .where(eq(schema.copilotChange.changeId, changeId))
      .returning();
    return updated;
  }

  async rejectChange(ownerUserId: string, changeId: string, reason?: string) {
    const change = await this.requireChange(ownerUserId, changeId);
    if (change.status !== 'pending') {
      throw new ConflictException('Only pending changes can be rejected');
    }
    const [updated] = await this.db
      .update(schema.copilotChange)
      .set({
        status: 'rejected',
        reviewedAt: new Date(),
        diff: {
          ...((change.diff as Record<string, unknown> | null) ?? {}),
          ...(reason?.trim()
            ? { reviewNote: reason.trim().slice(0, 2000) }
            : {}),
        },
      })
      .where(eq(schema.copilotChange.changeId, changeId))
      .returning();
    return updated;
  }

  async revertChange(ownerUserId: string, changeId: string) {
    const change = await this.requireChange(ownerUserId, changeId);
    if (change.status !== 'applied') {
      throw new ConflictException('Only applied changes can be reverted');
    }
    if (!change.resourceId) {
      throw new BadRequestException('This change cannot be reverted');
    }
    if (change.resourceType !== 'workflow') {
      if (change.action === 'create') {
        await this.deleteCreatedResource(
          change.resourceType,
          change.resourceId,
          ownerUserId,
        );
      } else if (change.action === 'update') {
        const changedKeys = Object.keys((change.after as any) ?? {});
        const rollback = Object.fromEntries(
          changedKeys.map((key) => [key, (change.before as any)?.[key]]),
        );
        await this.applyResourcePayload(
          change.resourceType,
          'update',
          change.resourceId,
          ownerUserId,
          rollback,
        );
      } else {
        throw new BadRequestException('This change cannot be reverted');
      }
      const [updated] = await this.db
        .update(schema.copilotChange)
        .set({ status: 'reverted', reviewedAt: new Date() })
        .where(eq(schema.copilotChange.changeId, changeId))
        .returning();
      return updated;
    }
    const current = await this.workflows.getWorkflow(change.resourceId);
    if (current.ownerId.toLowerCase() !== ownerUserId.toLowerCase()) {
      throw new ForbiddenException('You do not own this workflow');
    }
    const expectedAfter = change.after as any;
    if (
      change.action === 'update' &&
      JSON.stringify(this.workflowSnapshot(current)) !==
        JSON.stringify(expectedAfter)
    ) {
      throw new ConflictException(
        'The workflow changed after this copilot edit. Reverting would overwrite newer work.',
      );
    }
    if (change.action === 'create') {
      await this.workflows.deleteWorkflow(change.resourceId);
    } else {
      await this.workflows.updateWorkflow(
        change.resourceId,
        change.before as any,
      );
    }
    const [updated] = await this.db
      .update(schema.copilotChange)
      .set({ status: 'reverted', reviewedAt: new Date() })
      .where(eq(schema.copilotChange.changeId, changeId))
      .returning();
    return updated;
  }

  private async applyWorkflowPayload(input: {
    action: string;
    resourceId: string | null;
    ownerUserId: string;
    after: any;
  }) {
    if (input.action === 'create') {
      return this.workflows.createWorkflow({
        name: input.after.name,
        description: input.after.description,
        ownerId: input.ownerUserId,
        ownerType: 'user',
        definition: input.after.definition,
      });
    }
    if (!input.resourceId) {
      throw new BadRequestException('Workflow ID is required');
    }
    return this.workflows.updateWorkflow(input.resourceId, input.after);
  }

  private async proposeResourceChange(
    agentId: string,
    scope: Exclude<CopilotScope, 'workflows' | 'account'>,
    resourceType: 'agent' | 'task' | 'skill' | 'tool',
    proposal: ResourceProposal,
  ) {
    const copilot = await this.requireSystemCopilot(agentId);
    const ownerUserId = copilot.ownerUserId!;
    const action = proposal.resourceId ? 'update' : 'create';
    const before = proposal.resourceId
      ? await this.getOwnedResourceSummary(
          ownerUserId,
          resourceType,
          proposal.resourceId,
          true,
        )
      : null;
    let after = this.sanitizeResourcePayload(resourceType, proposal.data);
    if (resourceType === 'task' && action === 'update') {
      after = Object.fromEntries(
        Object.entries(after).filter(([key]) =>
          ['title', 'description', 'priority', 'scheduledFor'].includes(key),
        ),
      );
    }
    this.validateResourcePayload(resourceType, action, after);
    const autoApply = this.canAutoApply(copilot, scope);

    let [change] = await this.db
      .insert(schema.copilotChange)
      .values({
        agentId,
        ownerUserId,
        sessionId: sessionUuidOrNull(proposal.originSessionId),
        scope,
        resourceType,
        resourceId: proposal.resourceId ?? null,
        action,
        status: 'pending',
        title: proposal.summary?.trim() || `${action} ${resourceType}`,
        description:
          typeof after.description === 'string' ? after.description : undefined,
        before,
        after,
        diff: this.objectDiff(before, after),
      })
      .returning();

    if (autoApply) {
      const applied = await this.applyResourcePayload(
        resourceType,
        action,
        proposal.resourceId ?? null,
        ownerUserId,
        after,
      );
      const resourceId = this.resourceIdFor(resourceType, applied);
      [change] = await this.db
        .update(schema.copilotChange)
        .set({ status: 'applied', resourceId, appliedAt: new Date() })
        .where(eq(schema.copilotChange.changeId, change.changeId))
        .returning();
    }

    const resourceId = change.resourceId;
    return {
      change,
      requiresConfirmation: !autoApply,
      studioUrl: resourceStudioUrl(resourceType, resourceId),
      message: autoApply
        ? `${resourceType} change applied and recorded.`
        : `${resourceType} change is ready for review and has not been applied.`,
    };
  }

  private async applyResourcePayload(
    resourceType: string,
    action: string,
    resourceId: string | null,
    ownerUserId: string,
    after: Record<string, any>,
  ): Promise<any> {
    if (resourceType === 'agent') {
      const { AgentService } = require('./agent.service');
      const service = this.moduleRef.get(AgentService, { strict: false });
      if (action === 'create') {
        return service.createAgent({
          value: {
            ...after,
            owner: ownerUserId,
            ownerUserId,
            isDefault: false,
            isSystemManaged: false,
          },
        });
      }
      if (!resourceId) throw new BadRequestException('Agent ID is required');
      await this.getOwnedResourceSummary(ownerUserId, 'agent', resourceId);
      return service.updateAgent(resourceId, after);
    }

    if (resourceType === 'task') {
      const { TaskExecutionService } = require('~/task/task-execution.service');
      const taskExecution = this.moduleRef.get(TaskExecutionService, {
        strict: false,
      });
      if (action === 'update') {
        if (!resourceId) throw new BadRequestException('Task ID is required');
        await this.getOwnedResourceSummary(ownerUserId, 'task', resourceId);
        const { TaskService } = require('~/task/task.service');
        const taskService = this.moduleRef.get(TaskService, { strict: false });
        if (
          after.title !== undefined ||
          after.description !== undefined ||
          after.priority !== undefined
        ) {
          await taskService.updateDetails(resourceId, {
            ...(after.title !== undefined && { title: after.title }),
            ...(after.description !== undefined && {
              description: after.description,
            }),
            ...(after.priority !== undefined && { priority: after.priority }),
          });
        }
        if (after.scheduledFor !== undefined) {
          if (after.scheduledFor === null) {
            const {
              TaskSchedulerService,
            } = require('~/task/task-scheduler.service');
            const scheduler = this.moduleRef.get(TaskSchedulerService, {
              strict: false,
            });
            await this.db
              .delete(schema.scheduledTaskRun)
              .where(
                and(
                  eq(schema.scheduledTaskRun.taskId, resourceId),
                  eq(schema.scheduledTaskRun.status, 'pending'),
                ),
              );
            await this.db
              .update(schema.task)
              .set({
                scheduledFor: null,
                nextRunAt: null,
                updatedAt: new Date(),
              })
              .where(eq(schema.task.taskId, resourceId));
            await scheduler.scheduleRun({
              taskId: resourceId,
              scheduledFor: new Date(),
              triggeredBy: 'manual',
            });
          } else {
            await taskExecution.rescheduleTask(resourceId, {
              scheduledFor: new Date(after.scheduledFor),
            });
          }
        }
        return this.db.query.task.findFirst({
          where: (t) => eq(t.taskId, resourceId),
        });
      }
      const target = await this.db.query.agent.findFirst({
        where: (t) =>
          and(
            eq(t.agentId, after.agentId),
            or(eq(t.ownerUserId, ownerUserId), eq(t.owner, ownerUserId)),
          ),
      });
      if (!target || target.isDefault) {
        throw new BadRequestException(
          'The target agent was not found. Choose a user-owned non-Copilot agent.',
        );
      }
      const { SessionService } = require('~/session/session.service');
      const sessions = this.moduleRef.get(SessionService, { strict: false });
      let sessionId = after.sessionId;
      if (sessionId) {
        const session = await sessions.getSession({ id: sessionId });
        if (!session || session.agentId !== after.agentId) {
          throw new BadRequestException(
            'The selected session does not belong to the target agent.',
          );
        }
      } else {
        const session = await sessions.createSession({
          value: {
            agentId: after.agentId,
            initiator: ownerUserId,
            title: after.title,
            model: { name: target.modelId ?? 'gpt-5.4-mini' },
          },
        });
        sessionId = session.sessionId;
      }
      return taskExecution.createTask({
        ...after,
        scheduledFor: after.scheduledFor
          ? new Date(after.scheduledFor)
          : undefined,
        sessionId,
        createdBy: ownerUserId,
        createdByType: 'user',
      });
    }

    if (resourceType === 'skill') {
      const { SkillService } = require('~/skill/skill.service');
      const skills = this.moduleRef.get(SkillService, { strict: false });
      if (action === 'create') {
        return skills.create({
          ...after,
          ownerId: ownerUserId,
          ownerType: 'user',
          source: 'user',
        });
      }
      if (!resourceId) throw new BadRequestException('Skill ID is required');
      await this.getOwnedResourceSummary(ownerUserId, 'skill', resourceId);
      return skills.update(resourceId, after);
    }

    if (resourceType === 'tool') {
      const { ToolService } = require('~/tool/tool.service');
      const tools = this.moduleRef.get(ToolService, { strict: false });
      if (action === 'create') {
        return tools.createTool({
          ...after,
          owner: ownerUserId,
          ownerType: 'user',
          visibility: after.visibility ?? 'private',
        });
      }
      if (!resourceId) throw new BadRequestException('Tool ID is required');
      const current = await this.getOwnedResourceSummary(
        ownerUserId,
        'tool',
        resourceId,
        true,
      );
      return tools.updateToolByName({ ...after, name: current.name });
    }
    throw new BadRequestException(`Unsupported resource type: ${resourceType}`);
  }

  private async deleteCreatedResource(
    resourceType: string,
    resourceId: string,
    ownerUserId: string,
  ) {
    await this.getOwnedResourceSummary(ownerUserId, resourceType, resourceId);
    if (resourceType === 'task') {
      await this.db
        .delete(schema.task)
        .where(eq(schema.task.taskId, resourceId));
      return;
    }
    if (resourceType === 'skill') {
      const { SkillService } = require('~/skill/skill.service');
      return this.moduleRef
        .get(SkillService, { strict: false })
        .delete(resourceId);
    }
    if (resourceType === 'tool') {
      const { ToolService } = require('~/tool/tool.service');
      return this.moduleRef
        .get(ToolService, { strict: false })
        .deleteToolByName(resourceId);
    }
    if (resourceType === 'agent') {
      const target = await this.db.query.agent.findFirst({
        where: (t) => eq(t.agentId, resourceId),
      });
      if (target?.isSystemManaged) {
        throw new ForbiddenException('System-managed agents cannot be deleted');
      }
      const [session, task] = await Promise.all([
        this.db.query.session.findFirst({
          where: (t) => eq(t.agentId, resourceId),
          columns: { sessionId: true },
        }),
        this.db.query.task.findFirst({
          where: (t) => eq(t.agentId, resourceId),
          columns: { taskId: true },
        }),
      ]);
      if (session || task) {
        throw new ConflictException(
          'This agent has sessions or tasks now, so undoing its creation would delete newer work.',
        );
      }
      await this.db
        .delete(schema.agent)
        .where(eq(schema.agent.agentId, resourceId));
      return;
    }
    throw new BadRequestException('This change cannot be reverted');
  }

  private rebaseWorkflowChange(current: any, base: any, proposed: any) {
    const mergeCollection = (key: 'nodes' | 'edges') => {
      const baseMap = new Map(
        (base?.definition?.[key] ?? []).map((item: any) => [item.id, item]),
      );
      const proposedMap = new Map(
        (proposed?.definition?.[key] ?? []).map((item: any) => [item.id, item]),
      );
      const currentMap = new Map(
        (current?.definition?.[key] ?? []).map((item: any) => [item.id, item]),
      );
      for (const id of baseMap.keys()) {
        if (!proposedMap.has(id)) currentMap.delete(id);
      }
      for (const [id, item] of proposedMap.entries()) {
        if (
          !baseMap.has(id) ||
          JSON.stringify(baseMap.get(id)) !== JSON.stringify(item)
        ) {
          currentMap.set(id, item);
        }
      }
      return [...currentMap.values()];
    };
    return {
      name: proposed?.name !== base?.name ? proposed?.name : current?.name,
      description:
        proposed?.description !== base?.description
          ? proposed?.description
          : current?.description,
      definition: this.normalizeWorkflowDefinition({
        ...current.definition,
        ...proposed.definition,
        nodes: mergeCollection('nodes'),
        edges: mergeCollection('edges'),
      }),
    };
  }

  private normalizeWorkflowDefinition(definition: any) {
    const typeAliases: Record<string, string> = {
      agent: 'agent_processor',
      approval: 'human_approval',
    };
    const nodes = (definition?.nodes ?? []).map((node: any, index: number) => ({
      ...node,
      id: String(node.id ?? `step_${index + 1}`),
      type: typeAliases[node.type] ?? node.type,
      position: node.position ?? { x: index * 260, y: 0 },
    }));
    const nodeIds = new Set(nodes.map((node: any) => node.id));
    const edges: any[] = [];
    const edgeKeys = new Set<string>();
    for (const [index, edge] of (definition?.edges ?? []).entries()) {
      const source = String(edge.source ?? edge.from ?? edge.fromNodeId ?? '');
      const target = String(edge.target ?? edge.to ?? edge.toNodeId ?? '');
      if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) {
        continue;
      }
      const key = `${source}->${target}:${edge.sourceHandle ?? ''}:${edge.targetHandle ?? ''}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        ...edge,
        id: String(edge.id ?? `edge_${index + 1}_${source}_${target}`),
        source,
        target,
      });
    }

    const incoming = (id: string) => edges.filter((edge) => edge.target === id);
    const outgoing = (id: string) => edges.filter((edge) => edge.source === id);
    const startNodeId = String(
      definition?.startNodeId ??
        nodes.find((node: any) => node.type === 'input')?.id ??
        nodes.find((node: any) => incoming(node.id).length === 0)?.id ??
        nodes[0]?.id ??
        '',
    );
    const endNodeId = String(
      definition?.endNodeId ??
        nodes.find((node: any) => node.type === 'output')?.id ??
        [...nodes].reverse().find((node: any) => outgoing(node.id).length === 0)
          ?.id ??
        nodes[nodes.length - 1]?.id ??
        '',
    );

    const reachableFrom = (origin: string) => {
      const seen = new Set<string>();
      const queue = [origin];
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        outgoing(id).forEach((edge) => queue.push(edge.target));
      }
      return seen;
    };
    const addEdge = (source: string, target: string) => {
      const key = `${source}->${target}::`;
      if (!source || !target || source === target || edgeKeys.has(key)) return;
      // A target that can already reach source would turn this repair into a cycle.
      if (reachableFrom(target).has(source)) return;
      edgeKeys.add(key);
      edges.push({ id: `copilot_${source}_${target}`, source, target });
    };

    if (
      startNodeId &&
      endNodeId &&
      !reachableFrom(startNodeId).has(endNodeId)
    ) {
      const initiallyReachable = reachableFrom(startNodeId);
      const disconnected = nodes.filter(
        (node: any) =>
          node.id !== startNodeId &&
          node.id !== endNodeId &&
          !initiallyReachable.has(node.id),
      );
      const disconnectedIds = new Set(disconnected.map((node: any) => node.id));
      const roots = disconnected.filter((node: any) =>
        incoming(node.id).every((edge) => !disconnectedIds.has(edge.source)),
      );
      for (const root of roots) addEdge(startNodeId, root.id);

      const nowReachable = reachableFrom(startNodeId);
      const terminals = nodes.filter(
        (node: any) =>
          node.id !== endNodeId &&
          nowReachable.has(node.id) &&
          outgoing(node.id).every((edge) => !nowReachable.has(edge.target)),
      );
      for (const terminal of terminals) addEdge(terminal.id, endNodeId);
      if (!reachableFrom(startNodeId).has(endNodeId)) {
        addEdge(startNodeId, endNodeId);
      }
    }
    return { ...definition, startNodeId, endNodeId, nodes, edges };
  }

  private workflowSnapshot(workflow: any) {
    return {
      name: workflow.name,
      description: workflow.description ?? null,
      definition: workflow.definition,
    };
  }

  private workflowDiff(before: any, after: any) {
    const beforeNodes = new Map(
      (before?.nodes ?? []).map((node: any) => [node.id, node]),
    );
    const afterNodes = new Map(
      (after?.nodes ?? []).map((node: any) => [node.id, node]),
    );
    const beforeEdges = new Map(
      (before?.edges ?? []).map((edge: any) => [edge.id, edge]),
    );
    const afterEdges = new Map(
      (after?.edges ?? []).map((edge: any) => [edge.id, edge]),
    );
    const changed = (left: any, right: any) =>
      JSON.stringify(left) !== JSON.stringify(right);
    return {
      nodes: {
        added: [...afterNodes.keys()].filter((id) => !beforeNodes.has(id)),
        removed: [...beforeNodes.keys()].filter((id) => !afterNodes.has(id)),
        modified: [...afterNodes.keys()].filter(
          (id) =>
            beforeNodes.has(id) &&
            changed(beforeNodes.get(id), afterNodes.get(id)),
        ),
      },
      edges: {
        added: [...afterEdges.keys()].filter((id) => !beforeEdges.has(id)),
        removed: [...beforeEdges.keys()].filter((id) => !afterEdges.has(id)),
        modified: [...afterEdges.keys()].filter(
          (id) =>
            beforeEdges.has(id) &&
            changed(beforeEdges.get(id), afterEdges.get(id)),
        ),
      },
    };
  }

  private sanitizeResourcePayload(
    resourceType: string,
    data: any,
  ): Record<string, any> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException('Resource data must be an object');
    }
    const forbidden = new Set([
      'owner',
      'ownerUserId',
      'ownerId',
      'ownerType',
      'workspaceId',
      'isDefault',
      'isSystemManaged',
      'copilotAccessMode',
      'copilotScopes',
      'createdBy',
      'createdByType',
      'status',
      'resultContent',
      'errorMessage',
      'modelApiKey',
      'runtimeSecrets',
      'secureKeyRef',
    ]);
    const allowed: Record<string, Set<string>> = {
      agent: new Set([
        'name',
        'instructions',
        'persona',
        'greeting',
        'conversationStarters',
        'knowledgebase',
        'externalTools',
        'commonTools',
        'temperature',
        'maxTokens',
        'avatar',
        'modelProvider',
        'modelId',
        'runtimeType',
      ]),
      task: new Set([
        'agentId',
        'sessionId',
        'title',
        'description',
        'executionMode',
        'workflowId',
        'workflowInputs',
        'cronExpression',
        'scheduledFor',
        'isRecurring',
        'dependsOn',
        'tools',
        'toolConstraintType',
        'toolInstructions',
        'recurringSessionMode',
        'context',
        'priority',
      ]),
      skill: new Set([
        'slug',
        'name',
        'description',
        'instructions',
        'tools',
        'triggers',
        'isPublic',
        'tags',
        'icon',
      ]),
      tool: new Set([
        'name',
        'displayName',
        'description',
        'schema',
        'apiSpec',
        'category',
        'icon',
        'inputSchema',
        'outputSchema',
        'visibility',
        'tags',
        'version',
        'rateLimitPerMinute',
        'rateLimitPerHour',
      ]),
    };
    return Object.fromEntries(
      Object.entries(data).filter(
        ([key]) => !forbidden.has(key) && allowed[resourceType]?.has(key),
      ),
    ) as Record<string, any>;
  }

  private validateResourcePayload(
    resourceType: string,
    action: string,
    data: Record<string, any>,
  ) {
    const requireText = (key: string) => {
      if (typeof data[key] !== 'string' || !data[key].trim()) {
        throw new BadRequestException(`${key} is required for ${resourceType}`);
      }
    };
    if (resourceType === 'agent' && action === 'create') requireText('name');
    if (resourceType === 'task') {
      if (action === 'create') {
        requireText('agentId');
        requireText('title');
      }
      if (
        data.scheduledFor &&
        Number.isNaN(new Date(data.scheduledFor).getTime())
      ) {
        throw new BadRequestException(
          'scheduledFor must be an ISO timestamp with an explicit timezone',
        );
      }
    }
    if (resourceType === 'skill' && action === 'create') {
      requireText('slug');
      requireText('name');
      requireText('description');
      requireText('instructions');
    }
    if (resourceType === 'tool' && action === 'create') {
      requireText('name');
      if (!data.schema?.function?.name) {
        throw new BadRequestException(
          'A tool schema with a function name is required',
        );
      }
    }
    if (action === 'update' && Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must change');
    }
  }

  private async getOwnedResourceSummary(
    ownerUserId: string,
    resourceType: string,
    resourceId: string,
    includeDefinition = false,
  ): Promise<any> {
    let value: any;
    if (resourceType === 'agent') {
      value = await this.db.query.agent.findFirst({
        where: (t) =>
          and(
            eq(t.agentId, resourceId),
            or(eq(t.ownerUserId, ownerUserId), eq(t.owner, ownerUserId)),
          ),
      });
      if (value) {
        const {
          modelApiKey: _modelApiKey,
          runtimeSecrets: _runtimeSecrets,
          ...safe
        } = value;
        value = safe;
      }
    } else if (resourceType === 'workflow') {
      value = await this.workflows.getWorkflow(resourceId).catch(() => null);
      if (value?.ownerId !== ownerUserId || value?.ownerType !== 'user') {
        value = null;
      } else if (!includeDefinition) {
        value = {
          workflowId: value.workflowId,
          name: value.name,
          description: value.description,
          nodeCount: value.definition?.nodes?.length ?? 0,
          edgeCount: value.definition?.edges?.length ?? 0,
          studioUrl: resourceStudioUrl('workflow', value.workflowId),
        };
      }
    } else if (resourceType === 'task') {
      value = await this.db.query.task.findFirst({
        where: (t) =>
          and(eq(t.taskId, resourceId), eq(t.createdBy, ownerUserId)),
      });
    } else if (resourceType === 'skill') {
      value = await this.db.query.skill.findFirst({
        where: (t) =>
          and(eq(t.skillId, resourceId), eq(t.ownerId, ownerUserId)),
      });
    } else if (resourceType === 'tool') {
      value = await this.db.query.tool.findFirst({
        where: (t) => and(eq(t.toolId, resourceId), eq(t.owner, ownerUserId)),
      });
      if (value) {
        const { secureKeyRef: _secureKeyRef, ...safe } = value;
        value = safe;
      }
    }
    if (!value) {
      throw new NotFoundException(
        `${resourceType} not found or is not owned by this user`,
      );
    }
    return {
      ...value,
      studioUrl: resourceStudioUrl(resourceType, resourceId),
    };
  }

  private objectDiff(before: any, after: any) {
    const keys = new Set(Object.keys(after ?? {}));
    return {
      fields: [...keys].filter(
        (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
      ),
    };
  }

  private resourceIdFor(resourceType: string, value: any): string {
    const id =
      value?.[
        resourceType === 'agent'
          ? 'agentId'
          : resourceType === 'task'
            ? 'taskId'
            : resourceType === 'skill'
              ? 'skillId'
              : resourceType === 'tool'
                ? 'toolId'
                : 'workflowId'
      ];
    if (!id) {
      throw new BadRequestException(
        `Applied ${resourceType} change did not return a resource ID`,
      );
    }
    return String(id);
  }

  private canAutoApply(agent: any, scope: CopilotScope) {
    if (agent.copilotAccessMode === 'full') return true;
    return (
      agent.copilotAccessMode === 'scoped' &&
      Array.isArray(agent.copilotScopes) &&
      (agent.copilotScopes.includes(scope) ||
        agent.copilotScopes.includes('account'))
    );
  }

  private async requireCopilotForOwner(ownerUserId: string) {
    const copilot = await this.getCopilotForOwner(ownerUserId);
    if (!copilot) throw new NotFoundException('Commons Copilot not found');
    return copilot;
  }

  private async requireSystemCopilot(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });
    if (!agent?.isSystemManaged || !agent.isDefault || !agent.ownerUserId) {
      throw new ForbiddenException(
        'This platform-management tool is only available to Commons Copilot',
      );
    }
    return agent;
  }

  private async requireChange(ownerUserId: string, changeId: string) {
    const change = await this.db.query.copilotChange.findFirst({
      where: (t) =>
        and(eq(t.changeId, changeId), eq(t.ownerUserId, ownerUserId)),
    });
    if (!change) throw new NotFoundException('Copilot change not found');
    return change;
  }
}
