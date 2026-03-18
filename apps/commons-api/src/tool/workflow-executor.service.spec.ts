/**
 * WorkflowExecutorService unit tests
 *
 * Covers the public surface: executeWorkflow, approveExecution, rejectExecution
 * and the graph-walker internals via the propagateSkip helper.
 *
 * The private executeGraphWalker is tested indirectly; direct unit tests
 * for node-type execution live in the integration suite.
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

/* ─── Minimal workflow definitions ─────────────────────────────────────── */

function linearDef() {
  return {
    nodes: [
      { id: 'n-in',  type: 'input',  data: {} },
      { id: 'n-t',   type: 'tool',   data: { toolId: 'tool-1' } },
      { id: 'n-out', type: 'output', data: {} },
    ],
    edges: [
      { id: 'e1', source: 'n-in', target: 'n-t' },
      { id: 'e2', source: 'n-t',  target: 'n-out' },
    ],
  };
}

function makeDb(workflowRow?: any) {
  const insertReturning = jest.fn().mockResolvedValue([{ executionId: 'exec-1', status: 'running' }]);
  const insertValues    = jest.fn().mockReturnValue({ returning: insertReturning });
  const insert          = jest.fn().mockReturnValue({ values: insertValues });

  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet   = jest.fn().mockReturnValue({ where: updateWhere });
  const update      = jest.fn().mockReturnValue({ set: updateSet });

  const query = {
    workflow:          { findFirst: jest.fn().mockResolvedValue(workflowRow ?? { workflowId: 'wf-1', definition: linearDef(), timeoutMs: 30_000 }) },
    workflowExecution: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  return { insert, update, query, _insertValues: insertValues, _updateSet: updateSet };
}

describe('WorkflowExecutorService', () => {
  let service: WorkflowExecutorService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    db = makeDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutorService,
        { provide: DatabaseService,     useValue: db },
        { provide: ToolLoaderService,   useValue: { loadTool: jest.fn().mockResolvedValue(null) } },
        { provide: ToolService,         useValue: { getTool: jest.fn().mockResolvedValue(null) } },
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ── executeWorkflow ──────────────────────────────────────────────────── */
  describe('executeWorkflow()', () => {
    it('creates an execution row and returns its ID', async () => {
      const id = await service.executeWorkflow({ workflowId: 'wf-1', agentId: 'agent-1', inputData: { k: 'v' } });
      expect(id).toBe('exec-1');
      expect(db._insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: 'wf-1', status: 'running', inputData: { k: 'v' } }),
      );
    });

    it('throws when workflow is not found', async () => {
      db.query.workflow.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.executeWorkflow({ workflowId: 'missing' }))
        .rejects.toThrow('Workflow missing not found');
    });

    it('returns immediately (async graph walker runs in background)', async () => {
      jest.spyOn(service as any, 'executeGraphWalker').mockResolvedValue(undefined);
      const id = await service.executeWorkflow({ workflowId: 'wf-1' });
      expect(typeof id).toBe('string');
    });
  });

  /* ── approveExecution ────────────────────────────────────────────────── */
  describe('approveExecution()', () => {
    const pausedExecution = () => ({
      executionId:      'exec-1',
      status:           'awaiting_approval',
      approvalToken:    'tok-ok',
      pausedAtNode:     'n-approval',
      pausedNodeOutputs: { 'n-prev': { out: 1 } },
      inputData:        {},
      agentId:          'agent-1',
      workflow:         { definition: linearDef() },
    });

    it('throws when execution not found', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.approveExecution('x', 'tok')).rejects.toThrow('not found');
    });

    it('throws when not in awaiting_approval state', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue({ ...pausedExecution(), status: 'running' });
      await expect(service.approveExecution('exec-1', 'tok-ok')).rejects.toThrow('not awaiting approval');
    });

    it('throws on token mismatch', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue(pausedExecution());
      await expect(service.approveExecution('exec-1', 'wrong-token')).rejects.toThrow('Invalid approval token');
    });

    it('sets status back to "running" on valid approval', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue(pausedExecution());
      jest.spyOn(service as any, 'executeGraphWalker').mockResolvedValue(undefined);

      const statusSeen: string[] = [];
      db.update = jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.status) statusSeen.push(v.status);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      });

      await service.approveExecution('exec-1', 'tok-ok', { note: 'looks good' });
      expect(statusSeen).toContain('running');
    });
  });

  /* ── rejectExecution ─────────────────────────────────────────────────── */
  describe('rejectExecution()', () => {
    it('throws on token mismatch', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue({
        executionId: 'exec-1', status: 'awaiting_approval', approvalToken: 'correct',
      });
      await expect(service.rejectExecution('exec-1', 'wrong')).rejects.toThrow('Invalid approval token');
    });

    it('marks execution as "failed" with reason', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue({
        executionId: 'exec-1', status: 'awaiting_approval', approvalToken: 'tok',
      });

      const errorMessages: string[] = [];
      db.update = jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.errorMessage) errorMessages.push(v.errorMessage);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      });

      await service.rejectExecution('exec-1', 'tok', 'Not today');
      expect(errorMessages).toContain('Not today');
    });

    it('uses a default reason when none provided', async () => {
      db.query.workflowExecution.findFirst = jest.fn().mockResolvedValue({
        executionId: 'exec-1', status: 'awaiting_approval', approvalToken: 'tok',
      });

      let capturedMsg = '';
      db.update = jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.errorMessage) capturedMsg = v.errorMessage;
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      });

      await service.rejectExecution('exec-1', 'tok');
      expect(capturedMsg.length).toBeGreaterThan(0);
    });
  });

  /* ── graph walker: frontier & dead-edge propagation ─────────────────── */
  describe('graph walker internals', () => {
    it('propagateSkip marks a node and its descendants as skipped', () => {
      const nodes = [
        { id: 'A' }, { id: 'B' }, { id: 'C' },
      ];
      const outgoing = new Map([
        ['A', [{ edgeId: 'e1', target: 'B' }]],
        ['B', [{ edgeId: 'e2', target: 'C' }]],
        ['C', []],
      ]);
      const incomingCount = new Map([
        ['A', { live: 0, dead: 0, total: 0 }],
        ['B', { live: 1, dead: 0, total: 1 }],
        ['C', { live: 1, dead: 0, total: 1 }],
      ]);
      const deadEdges   = new Set<string>();
      const skippedNodes = new Set<string>();

      (service as any).propagateSkip('A', nodes, outgoing, incomingCount, deadEdges, skippedNodes);

      expect(skippedNodes.has('A')).toBe(true);
      expect(deadEdges.has('e1')).toBe(true);
      // B should have its live in-degree decremented and be added to skipped
      expect(incomingCount.get('B')!.live).toBe(0);
    });
  });
});
