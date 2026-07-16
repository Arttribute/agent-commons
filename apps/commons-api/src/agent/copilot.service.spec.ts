import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CopilotService } from './copilot.service';

function makeHarness(agentOverrides: Record<string, unknown> = {}) {
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
      agent: { findFirst: jest.fn().mockResolvedValue(agent) },
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
    service: new CopilotService(db as any, workflows as any),
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
});
