import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CopilotService } from './copilot.service';

function makeHarness(
  agentOverrides: Record<string, unknown> = {},
  resources: { tools?: any[]; agents?: any[] } = {},
) {
  let inserted: any;
  const agent = {
    agentId: 'copilot-1',
    ownerUserId: 'user-1',
    isDefault: true,
    isSystemManaged: true,
    copilotAccessMode: 'confirm',
    copilotScopes: [],
    ...agentOverrides,
  };
  const db = {
    query: {
      agent: {
        findFirst: jest.fn().mockResolvedValue(agent),
        findMany: jest.fn().mockResolvedValue(resources.agents ?? []),
      },
      tool: { findMany: jest.fn().mockResolvedValue(resources.tools ?? []) },
      copilotChange: { findMany: jest.fn(), findFirst: jest.fn() },
    },
    insert: jest.fn(() => ({
      values: jest.fn((value) => {
        inserted = value;
        return {
          returning: jest.fn(async () => [{ changeId: 'change-1', ...value }]),
        };
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn((value) => ({
        where: jest.fn(() => ({
          returning: jest.fn(async () => [
            { changeId: 'change-1', ...inserted, ...value },
          ]),
        })),
      })),
    })),
  };
  const workflow = {
    workflowId: 'workflow-1',
    ownerId: 'user-1',
    ownerType: 'user',
    name: 'Existing',
    description: null,
    definition: { nodes: [], edges: [] },
  };
  const workflows = {
    getWorkflow: jest.fn().mockResolvedValue(workflow),
    updateWorkflow: jest.fn().mockResolvedValue(workflow),
    createWorkflow: jest.fn().mockResolvedValue(workflow),
  };
  return {
    service: new CopilotService(
      db as any,
      workflows as any,
      { get: jest.fn() } as any,
    ),
    db,
    workflows,
    getInserted: () => inserted,
  };
}

describe('CopilotService', () => {
  it('stages workflow edits in confirm mode without touching the workflow', async () => {
    const harness = makeHarness();
    const result = await harness.service.proposeWorkflowChange('copilot-1', {
      workflowId: 'workflow-1',
      summary: 'Add an approval step',
      definition: {
        nodes: [{ id: 'approval', type: 'human_approval' }],
        edges: [],
      },
    });

    expect(harness.workflows.updateWorkflow).not.toHaveBeenCalled();
    expect(harness.getInserted().status).toBe('pending');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('applies and records workflow edits in full-access mode', async () => {
    const harness = makeHarness({ copilotAccessMode: 'full' });
    const result = await harness.service.proposeWorkflowChange('copilot-1', {
      workflowId: 'workflow-1',
      summary: 'Add an output',
      definition: {
        nodes: [{ id: 'output', type: 'output' }],
        edges: [],
      },
    });

    expect(harness.workflows.updateWorkflow).toHaveBeenCalledTimes(1);
    expect(harness.db.update).toHaveBeenCalledTimes(1);
    expect(result.requiresConfirmation).toBe(false);
  });

  it('rejects a workflow whose tool node references a tool that does not exist', async () => {
    const harness = makeHarness();
    await expect(
      harness.service.proposeWorkflowChange('copilot-1', {
        name: 'Sheets to email',
        summary: 'placeholder graph',
        definition: {
          nodes: [
            { id: 'input', type: 'input' },
            { id: 'send', type: 'tool', toolId: 'not-a-real-tool', label: 'Send email' },
            { id: 'output', type: 'output' },
          ],
          edges: [
            { source: 'input', target: 'send' },
            { source: 'send', target: 'output' },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.workflows.createWorkflow).not.toHaveBeenCalled();
  });

  it('rejects an agent node whose config.agentId is not one of the user agents', async () => {
    const harness = makeHarness({ copilotAccessMode: 'full' }, { agents: [] });
    await expect(
      harness.service.proposeWorkflowChange('copilot-1', {
        name: 'Reply flow',
        summary: 'missing agent',
        definition: {
          nodes: [
            { id: 'draft', type: 'agent_processor', config: { agentId: 'ghost-agent' } },
          ],
          edges: [],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a workflow that wires real tool and agent ids', async () => {
    const harness = makeHarness(
      { copilotAccessMode: 'full' },
      {
        tools: [{ toolId: 'tool-real', owner: 'user-1', visibility: 'private' }],
        agents: [{ agentId: 'agent-real' }],
      },
    );
    const result = await harness.service.proposeWorkflowChange('copilot-1', {
      name: 'Sheets to email',
      summary: 'real graph',
      definition: {
        nodes: [
          { id: 'input', type: 'input' },
          { id: 'draft', type: 'agent_processor', config: { agentId: 'agent-real' } },
          { id: 'send', type: 'tool', toolId: 'tool-real', label: 'Send email' },
          { id: 'output', type: 'output' },
        ],
        edges: [
          { source: 'input', target: 'draft' },
          { source: 'draft', target: 'send' },
          { source: 'send', target: 'output' },
        ],
      },
    });
    expect(harness.workflows.createWorkflow).toHaveBeenCalledTimes(1);
    expect(result.requiresConfirmation).toBe(false);
  });

  it('only exposes management tools to the system-managed default copilot', async () => {
    const harness = makeHarness({ isSystemManaged: false });
    await expect(
      harness.service.proposeWorkflowChange('ordinary-agent', {
        name: 'Nope',
        summary: 'Try to manage account state',
        definition: { nodes: [], edges: [] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unknown access modes and scopes', async () => {
    const harness = makeHarness();
    await expect(
      harness.service.updateSettings('user-1', {
        accessMode: 'scoped',
        scopes: ['workflows', 'secrets'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires explicit confirmation for out-of-scope task mutations', async () => {
    const harness = makeHarness();
    await expect(
      harness.service.assertMutationAllowed('copilot-1', 'tasks'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      harness.service.assertMutationAllowed('copilot-1', 'tasks', true),
    ).resolves.toBeUndefined();
  });

  it('summarizes added, modified, and removed workflow nodes', () => {
    const harness = makeHarness();
    const diff = (harness.service as any).workflowDiff(
      {
        nodes: [
          { id: 'keep', label: 'Before' },
          { id: 'remove', label: 'Remove' },
        ],
        edges: [],
      },
      {
        nodes: [
          { id: 'keep', label: 'After' },
          { id: 'add', label: 'Add' },
        ],
        edges: [],
      },
    );
    expect(diff.nodes).toEqual({
      added: ['add'],
      removed: ['remove'],
      modified: ['keep'],
    });
  });

  it('repairs a disconnected start, work step, and end proposal', () => {
    const harness = makeHarness();
    const definition = (harness.service as any).normalizeWorkflowDefinition({
      startNodeId: 'intake',
      endNodeId: 'wrap_up',
      nodes: [
        { id: 'intake', type: 'input' },
        { id: 'study', type: 'agent_processor' },
        { id: 'wrap_up', type: 'output' },
      ],
      edges: [],
    });

    expect(definition.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'intake', target: 'study' }),
        expect.objectContaining({ source: 'study', target: 'wrap_up' }),
      ]),
    );
  });

  it('rebases proposal edits without discarding newer unrelated canvas work', () => {
    const harness = makeHarness();
    const result = (harness.service as any).rebaseWorkflowChange(
      {
        name: 'Current',
        description: null,
        definition: {
          startNodeId: 'input',
          endNodeId: 'output',
          nodes: [
            { id: 'input', type: 'input' },
            { id: 'step', type: 'agent_processor', label: 'Old' },
            { id: 'newer', type: 'transform' },
            { id: 'output', type: 'output' },
          ],
          edges: [
            { id: 'a', source: 'input', target: 'step' },
            { id: 'b', source: 'step', target: 'newer' },
            { id: 'c', source: 'newer', target: 'output' },
          ],
        },
      },
      {
        name: 'Base',
        description: null,
        definition: {
          startNodeId: 'input',
          endNodeId: 'output',
          nodes: [
            { id: 'input', type: 'input' },
            { id: 'step', type: 'agent_processor', label: 'Old' },
            { id: 'output', type: 'output' },
          ],
          edges: [],
        },
      },
      {
        name: 'Base',
        description: null,
        definition: {
          startNodeId: 'input',
          endNodeId: 'output',
          nodes: [
            { id: 'input', type: 'input' },
            { id: 'step', type: 'agent_processor', label: 'Updated' },
            { id: 'output', type: 'output' },
          ],
          edges: [],
        },
      },
    );

    expect(result.definition.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'step', label: 'Updated' }),
        expect.objectContaining({ id: 'newer' }),
      ]),
    );
  });
});
