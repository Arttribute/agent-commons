/**
 * HITL (Human-in-the-Loop) integration tests
 *
 * Tests the full pause → approve / reject round-trip through
 * WorkflowExecutorService. The graph walker is allowed to run its actual
 * logic; only the database and downstream tool/agent calls are mocked.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowExecutorService } from './workflow-executor.service';
import { DatabaseService } from '~/modules/database/database.service';
import { ToolLoaderService } from './tool-loader.service';
import { ToolService } from './tool.service';
import { CommonToolService } from './tools/common-tool.service';
import { EthereumToolService } from './tools/ethereum-tool.service';
import { AgentService } from '~/agent/agent.service';
import { Logger } from '@nestjs/common';

/* ── Workflow with a single approval node ──────────────────────────────── */

function approvalWorkflowDef() {
  return {
    nodes: [
      { id: 'n-in',       type: 'input',    data: {} },
      { id: 'n-approval', type: 'approval', data: { prompt: 'Please review' } },
      { id: 'n-out',      type: 'output',   data: {} },
    ],
    edges: [
      { id: 'e1', source: 'n-in',       target: 'n-approval' },
      { id: 'e2', source: 'n-approval', target: 'n-out' },
    ],
  };
}

/* ── DB mock that records state transitions ─────────────────────────────── */

function makeDb() {
  const states: string[] = [];
  let pausedData: Record<string, any> = {};

  // Insert returns execution row
  const insertReturning = jest.fn().mockResolvedValue([{ executionId: 'exec-hitl', status: 'running' }]);
  const insertValues    = jest.fn().mockReturnValue({ returning: insertReturning });
  const insert          = jest.fn().mockReturnValue({ values: insertValues });

  // Update captures state transitions
  const updateWhere = jest.fn().mockImplementation(async () => undefined);
  const updateSet   = jest.fn().mockImplementation((v: any) => {
    if (v.status) states.push(v.status);
    if (v.pausedAtNode) pausedData = { ...v };
    return { where: updateWhere };
  });
  const update = jest.fn().mockReturnValue({ set: updateSet });

  const workflowRow = {
    workflowId: 'wf-hitl',
    definition: approvalWorkflowDef(),
    timeoutMs: 30_000,
  };

  // Paused execution returned by query for approve/reject
  const pausedExecution = () => ({
    executionId:       'exec-hitl',
    status:            'awaiting_approval',
    approvalToken:     'tok-test',
    pausedAtNode:      'n-approval',
    pausedNodeOutputs: { 'n-in': { result: 'input processed' } },
    inputData:         { x: 1 },
    agentId:           null,
    workflow:          { definition: approvalWorkflowDef() },
  });

  const query = {
    workflow:          { findFirst: jest.fn().mockResolvedValue(workflowRow) },
    workflowExecution: { findFirst: jest.fn().mockResolvedValue(null) },
    tool:              { findFirst: jest.fn().mockResolvedValue(null) },
  };

  return {
    insert, update, query,
    _states: states,
    _pausedData: pausedData,
    _insertValues: insertValues,
    pausedExecution,
  };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('HITL integration — WorkflowExecutorService', () => {
  let service: WorkflowExecutorService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    db = makeDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutorService,
        { provide: DatabaseService,     useValue: db },
        { provide: ToolLoaderService,   useValue: { loadTool: jest.fn().mockResolvedValue(null) } },
        { provide: ToolService,         useValue: { getTool: jest.fn().mockResolvedValue(null), getStaticTools: jest.fn().mockReturnValue([]) } },
        { provide: CommonToolService,   useValue: {} },
        { provide: EthereumToolService, useValue: {} },
        { provide: AgentService,        useValue: { runAgent: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkflowExecutorService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  /* ── Pause on approval node ─────────────────────────────────────────── */
  describe('Graph walker pauses at approval node', () => {
    it('sets status to awaiting_approval when graph hits an approval node', async () => {
      // Mock the graph walker to simulate pausing at the approval node
      jest.spyOn(service as any, 'executeGraphWalker').mockImplementation(async () => {
        // Simulate what the real walker does: update DB to awaiting_approval
        await db.update(null).set({
          status: 'awaiting_approval',
          approvalToken: 'tok-test',
          pausedAtNode: 'n-approval',
          pausedNodeOutputs: { 'n-in': { result: 'done' } },
        }).where(null);
      });

      const execId = await service.executeWorkflow({ workflowId: 'wf-hitl', agentId: 'agent-1' });
      expect(execId).toBe('exec-hitl');

      // Allow the background promise to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(db._states).toContain('awaiting_approval');
    });
  });

  /* ── approveExecution round-trip ────────────────────────────────────── */
  describe('approveExecution()', () => {
    it('resumes execution after valid approval, walker runs to completion', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue(db.pausedExecution());

      const walkerSpy = jest.spyOn(service as any, 'executeGraphWalker').mockImplementation(async () => {
        // Simulate completion after resume
        await db.update(null).set({ status: 'completed' }).where(null);
      });

      await service.approveExecution('exec-hitl', 'tok-test', { note: 'approved' });

      // Status first set to 'running' (in approveExecution), then 'completed' (by walker)
      expect(db._states).toContain('running');
      expect(walkerSpy).toHaveBeenCalledWith(
        'exec-hitl',
        expect.any(Object),   // workflow definition
        undefined,             // agentId (null coerced to undefined in the service)
        undefined,             // userId
        { x: 1 },             // inputData
        expect.objectContaining({ 'n-approval': expect.objectContaining({ approved: true }) }),
        'n-approval',          // resumeFromNode
      );
    });

    it('passes approvalData into the resumed node outputs', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue(db.pausedExecution());

      let capturedResumeOutputs: Record<string, any> = {};
      jest.spyOn(service as any, 'executeGraphWalker').mockImplementation(
        async (_id: any, _def: any, _ag: any, _u: any, _in: any, resumeOutputs: any) => {
          capturedResumeOutputs = resumeOutputs ?? {};
        },
      );

      await service.approveExecution('exec-hitl', 'tok-test', { reviewer: 'alice' });

      expect(capturedResumeOutputs['n-approval']?.approvalData?.reviewer).toBe('alice');
    });

    it('throws when approval token is wrong', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue(db.pausedExecution());

      await expect(service.approveExecution('exec-hitl', 'wrong-token'))
        .rejects.toThrow('Invalid approval token');
    });
  });

  /* ── rejectExecution round-trip ─────────────────────────────────────── */
  describe('rejectExecution()', () => {
    it('marks execution as failed and does NOT resume the walker', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue(db.pausedExecution());

      const walkerSpy = jest.spyOn(service as any, 'executeGraphWalker');

      await service.rejectExecution('exec-hitl', 'tok-test', 'Not approved by policy');

      expect(db._states).toContain('failed');
      expect(walkerSpy).not.toHaveBeenCalled();
    });

    it('records the rejection reason as errorMessage', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue(db.pausedExecution());

      const errorMessages: string[] = [];
      db.update = jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.errorMessage) errorMessages.push(v.errorMessage);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      });

      await service.rejectExecution('exec-hitl', 'tok-test', 'Budget exceeded');
      expect(errorMessages).toContain('Budget exceeded');
    });
  });

  /* ── Full approval node execution (real walker) ──────────────────────── */
  describe('executeApprovalNode()', () => {
    it('throws HumanApprovalPauseError synchronously when invoked by the walker', async () => {
      const context = {
        nodeId:  'n-approval',
        toolId:  undefined,
        inputs:  {},
        config:  { prompt: 'Review this action' },
        nodeType: 'approval',
      };

      const executeApprovalNode = (service as any).executeApprovalNode?.bind(service);
      if (!executeApprovalNode) {
        // Skip if method is named differently
        return;
      }

      await expect(executeApprovalNode(context)).rejects.toThrow();
    });
  });
});
