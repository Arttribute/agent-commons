import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database';
import { WorkflowService } from '~/tool/workflow.service';
import * as schema from '#/models/schema';

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
};

@Injectable()
export class CopilotService {
  constructor(
    private readonly db: DatabaseService,
    private readonly workflows: WorkflowService,
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
        where: (t) => eq(t.ownerUserId, ownerId),
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
      result.tools = await this.db.query.tool.findMany({
        where: (t) => eq(t.owner, ownerId),
        limit: 100,
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

    const after = {
      name: proposal.name?.trim() || before?.name,
      description:
        proposal.description !== undefined
          ? proposal.description
          : before?.description,
      definition: proposal.definition,
    };
    const autoApply = this.canAutoApply(copilot, 'workflows');

    let [change] = await this.db
      .insert(schema.copilotChange)
      .values({
        agentId,
        ownerUserId,
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
    await this.assertWorkflowBaseUnchanged(change);
    const applied = await this.applyWorkflowPayload({
      action: change.action,
      resourceId: change.resourceId,
      ownerUserId,
      after: change.after as any,
    });
    const [updated] = await this.db
      .update(schema.copilotChange)
      .set({
        status: 'applied',
        resourceId: applied.workflowId,
        reviewedAt: new Date(),
        appliedAt: new Date(),
      })
      .where(eq(schema.copilotChange.changeId, changeId))
      .returning();
    return updated;
  }

  async rejectChange(ownerUserId: string, changeId: string) {
    const change = await this.requireChange(ownerUserId, changeId);
    if (change.status !== 'pending') {
      throw new ConflictException('Only pending changes can be rejected');
    }
    const [updated] = await this.db
      .update(schema.copilotChange)
      .set({ status: 'rejected', reviewedAt: new Date() })
      .where(eq(schema.copilotChange.changeId, changeId))
      .returning();
    return updated;
  }

  async revertChange(ownerUserId: string, changeId: string) {
    const change = await this.requireChange(ownerUserId, changeId);
    if (change.status !== 'applied') {
      throw new ConflictException('Only applied changes can be reverted');
    }
    if (change.resourceType !== 'workflow' || !change.resourceId) {
      throw new BadRequestException('This change cannot be reverted');
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

  private async assertWorkflowBaseUnchanged(change: any) {
    if (change.action !== 'update' || !change.resourceId) return;
    const current = await this.workflows.getWorkflow(change.resourceId);
    if (
      JSON.stringify(this.workflowSnapshot(current)) !==
      JSON.stringify(change.before)
    ) {
      throw new ConflictException(
        'The workflow changed after this proposal was created. Ask the copilot to refresh its proposal.',
      );
    }
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
