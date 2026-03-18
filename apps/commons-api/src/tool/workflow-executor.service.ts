import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as vm from 'vm';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../modules/database';
import { ToolLoaderService } from './tool-loader.service';
import { ToolService } from './tool.service';
import { CommonToolService } from './tools/common-tool.service';
import { EthereumToolService } from './tools/ethereum-tool.service';
import { AgentService } from '../agent/agent.service';
import { ToolExecutionError, WorkflowNodeError, AgentProcessorError } from './workflow-errors';
import * as schema from '../../models/schema';

interface NodeExecutionContext {
  nodeId: string;
  nodeType: string;
  toolId?: string;
  inputs: Record<string, any>;
  config?: Record<string, any>;
}

interface NodeExecutionResult {
  nodeId: string;
  status: 'success' | 'error' | 'skipped';
  output?: any;
  error?: string;
  duration: number;
}

/** Thrown by human_approval nodes to pause execution mid-graph. */
class HumanApprovalPauseError extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly approvalToken: string,
    public readonly prompt?: string,
  ) {
    super(`Execution paused at node ${nodeId} awaiting human approval`);
    this.name = 'HumanApprovalPauseError';
  }
}

/**
 * Executes workflows with a dynamic graph walker supporting:
 * - Parallel execution of independent nodes
 * - Conditional branching via 'condition' nodes with dead-edge tracking
 * - Field mapping via 'transform' nodes
 * - Array iteration via 'loop' nodes
 * - LLM inference via 'agent_processor' nodes
 * - Human-in-the-loop via 'human_approval' nodes (pause/resume)
 * - Legacy 'tool', 'input', 'output' nodes (backwards compatible)
 */
@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly toolLoader: ToolLoaderService,
    private readonly toolService: ToolService,
    @Inject(forwardRef(() => CommonToolService))
    private readonly commonToolService: CommonToolService,
    @Inject(forwardRef(() => EthereumToolService))
    private readonly ethereumToolService: EthereumToolService,
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
  ) {}

  // ── Public: start a new execution ─────────────────────────────────────────

  async executeWorkflow(params: {
    workflowId: string;
    agentId?: string;
    sessionId?: string;
    taskId?: string;
    inputData?: Record<string, any>;
    userId?: string;
  }): Promise<string> {
    const { workflowId, agentId, sessionId, taskId, inputData, userId } = params;
    const workflow = await this.db.query.workflow.findFirst({
      where: (w) => eq(w.workflowId, workflowId),
    });
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const [execution] = await this.db
      .insert(schema.workflowExecution)
      .values({
        workflowId,
        ...(agentId && { agentId }),
        ...(sessionId && { sessionId }),
        ...(taskId && { taskId }),
        status: 'running',
        startedAt: new Date(),
        inputData,
        nodeResults: {},
      })
      .returning();

    this.logger.log(`Started workflow execution ${execution.executionId} for workflow ${workflowId}`);

    const timeoutMs = workflow.timeoutMs || 300_000;
    const executionPromise = this.executeGraphWalker(
      execution.executionId, workflow.definition, agentId, userId, inputData || {},
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Workflow execution timeout after ${timeoutMs}ms`)), timeoutMs),
    );

    Promise.race([executionPromise, timeoutPromise]).catch(async (error) => {
      this.logger.error(`Workflow execution ${execution.executionId} failed: ${error.message}`);
      // Don't overwrite awaiting_approval status
      const current = await this.db.query.workflowExecution.findFirst({
        where: (e) => eq(e.executionId, execution.executionId),
      });
      if (current && current.status !== 'awaiting_approval' && current.status !== 'cancelled') {
        try {
          await this.db.update(schema.workflowExecution)
            .set({ status: 'failed', errorMessage: error.message, completedAt: new Date() })
            .where(eq(schema.workflowExecution.executionId, execution.executionId));
        } catch (updateError) {
          this.logger.error('Failed to update timeout status:', updateError);
        }
      }
    });

    return execution.executionId;
  }

  // ── Public: resume a paused (awaiting_approval) execution ─────────────────

  async approveExecution(executionId: string, approvalToken: string, approvalData?: Record<string, any>): Promise<void> {
    const execution = await this.db.query.workflowExecution.findFirst({
      where: (e) => eq(e.executionId, executionId),
      with: { workflow: true },
    });
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    if (execution.status !== 'awaiting_approval') {
      throw new Error(`Execution ${executionId} is not awaiting approval (status: ${execution.status})`);
    }
    if ((execution as any).approvalToken !== approvalToken) {
      throw new Error('Invalid approval token');
    }

    const pausedAtNode: string = (execution as any).pausedAtNode;
    const pausedNodeOutputs: Record<string, any> = (execution as any).pausedNodeOutputs || {};

    // Mark execution as resumed
    await this.db.update(schema.workflowExecution)
      .set({
        status: 'running',
        approvalData: approvalData ?? {},
        approvalToken: null as any,
        pausedAtNode: null as any,
      })
      .where(eq(schema.workflowExecution.executionId, executionId));

    // Resume graph from paused node — inject approval result into outputs
    const approvalOutput = { approved: true, approvalData: approvalData ?? {} };
    const resumeOutputs = { ...pausedNodeOutputs, [pausedAtNode]: approvalOutput };

    const workflow = (execution as any).workflow;
    this.executeGraphWalker(
      executionId, workflow.definition, execution.agentId ?? undefined,
      undefined, execution.inputData as Record<string, any> || {},
      resumeOutputs, pausedAtNode,
    ).catch(async (error) => {
      this.logger.error(`Resumed execution ${executionId} failed: ${error.message}`);
      await this.db.update(schema.workflowExecution)
        .set({ status: 'failed', errorMessage: error.message, completedAt: new Date() })
        .where(eq(schema.workflowExecution.executionId, executionId));
    });
  }

  async rejectExecution(executionId: string, approvalToken: string, reason?: string): Promise<void> {
    const execution = await this.db.query.workflowExecution.findFirst({
      where: (e) => eq(e.executionId, executionId),
    });
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    if (execution.status !== 'awaiting_approval') {
      throw new Error(`Execution ${executionId} is not awaiting approval (status: ${execution.status})`);
    }
    if ((execution as any).approvalToken !== approvalToken) {
      throw new Error('Invalid approval token');
    }

    await this.db.update(schema.workflowExecution)
      .set({
        status: 'failed',
        errorMessage: reason ?? 'Rejected by human reviewer',
        completedAt: new Date(),
        approvalToken: null as any,
      })
      .where(eq(schema.workflowExecution.executionId, executionId));
  }

  // ── Core: dynamic graph walker ─────────────────────────────────────────────

  /**
   * Executes the workflow graph using a dynamic walker that supports:
   * - Concurrent execution of independent nodes (same in-degree frontier)
   * - Dead-edge tracking for conditional branching
   * - Resume from a paused state (resumeOutputs + resumeFromNode)
   *
   * When resumeFromNode is provided, nodes that completed before the pause are
   * considered already done and their outputs are taken from resumeOutputs.
   */
  private async executeGraphWalker(
    executionId: string,
    definition: any,
    agentId: string | undefined,
    userId: string | undefined,
    inputData: Record<string, any>,
    resumeOutputs?: Record<string, any>,
    resumeFromNode?: string,
  ): Promise<void> {
    const startTime = Date.now();
    const { nodes, edges } = definition;

    // ── Build graph structures ────────────────────────────────────────────
    // adjacency: source → [{ edgeId, target, sourceHandle }]
    const outgoing = new Map<string, Array<{ edgeId: string; target: string; sourceHandle?: string }>>();
    // incomingCount[node] = { live: number, dead: number, total: number }
    const incomingCount = new Map<string, { live: number; dead: number; total: number }>();

    for (const node of nodes) {
      outgoing.set(node.id, []);
      incomingCount.set(node.id, { live: 0, dead: 0, total: 0 });
    }
    for (const edge of edges) {
      outgoing.get(edge.source)?.push({
        edgeId: edge.id,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
      });
      const cnt = incomingCount.get(edge.target)!;
      cnt.live++;
      cnt.total++;
    }

    const deadEdges = new Set<string>();
    const completedNodes = new Set<string>();
    const skippedNodes = new Set<string>();
    const nodeOutputs: Record<string, any> = { '__input__': inputData };
    const nodeResults: Record<string, NodeExecutionResult> = {};

    // Restore state from a previous pause
    if (resumeOutputs) {
      Object.assign(nodeOutputs, resumeOutputs);
      // Mark nodes that already have outputs as completed
      for (const nodeId of Object.keys(resumeOutputs)) {
        if (nodeId !== '__input__') {
          completedNodes.add(nodeId);
          // Reduce live in-degree for their downstream nodes
          for (const { edgeId, target } of outgoing.get(nodeId) || []) {
            if (!deadEdges.has(edgeId)) {
              const cnt = incomingCount.get(target)!;
              cnt.live = Math.max(0, cnt.live - 1);
            }
          }
        }
      }
    }

    // Load persisted nodeResults if resuming
    if (resumeFromNode) {
      const existing = await this.db.query.workflowExecution.findFirst({
        where: (e) => eq(e.executionId, executionId),
      });
      if (existing?.nodeResults) {
        Object.assign(nodeResults, existing.nodeResults);
      }
    }

    try {
      let hasMore = true;
      while (hasMore) {
        // Find the current "frontier" — nodes ready to execute
        const frontier: string[] = [];
        const fullyDead: string[] = [];

        for (const node of nodes) {
          const nodeId: string = node.id;
          if (completedNodes.has(nodeId) || skippedNodes.has(nodeId)) continue;
          const cnt = incomingCount.get(nodeId)!;
          if (cnt.live === 0 && cnt.dead === cnt.total) {
            // All incoming edges are dead → skip this node
            fullyDead.push(nodeId);
          } else if (cnt.live === 0) {
            // No remaining live dependencies → ready
            frontier.push(nodeId);
          }
        }

        // Propagate skips for fully-dead nodes
        for (const nodeId of fullyDead) {
          if (!skippedNodes.has(nodeId)) {
            this.propagateSkip(nodeId, nodes, outgoing, incomingCount, deadEdges, skippedNodes);
          }
        }

        if (frontier.length === 0) {
          hasMore = false;
          break;
        }

        // Update current node tracker in DB
        await this.db.update(schema.workflowExecution)
          .set({ currentNode: frontier.join(',') })
          .where(eq(schema.workflowExecution.executionId, executionId));

        // Execute all frontier nodes concurrently
        const results = await Promise.all(frontier.map((nodeId) => {
          const node = nodes.find((n: any) => n.id === nodeId);
          if (!node) {
            return Promise.resolve<NodeExecutionResult>(
              { nodeId, status: 'skipped', error: 'Node definition not found', duration: 0 },
            );
          }
          const isFirstNodeWithNoIncoming =
            !resumeFromNode &&
            !edges.some((e: any) => e.target === nodeId);

          let nodeInputs = this.mapNodeInputs(nodeId, edges, nodeOutputs, node.config);
          if (isFirstNodeWithNoIncoming && Object.keys(nodeInputs).length === 0) {
            nodeInputs = inputData;
          }

          return this.dispatchNode(
            { nodeId, nodeType: node.type || 'tool', toolId: node.toolId, inputs: nodeInputs, config: node.config },
            agentId,
            userId,
          );
        }));

        // Process results
        let fatalError: Error | null = null;
        for (const result of results) {
          nodeResults[result.nodeId] = { ...result };
          completedNodes.add(result.nodeId);

          if (result.status === 'error') {
            const node = nodes.find((n: any) => n.id === result.nodeId);
            if (!node?.config?.continueOnError && !fatalError) {
              fatalError = new Error(`Node ${result.nodeId} failed: ${result.error}`);
            }
            // Mark outgoing edges as dead on error (unless continueOnError)
            if (!node?.config?.continueOnError) {
              this.markOutgoingDead(result.nodeId, outgoing, incomingCount, deadEdges);
            } else if (result.output !== undefined) {
              nodeOutputs[result.nodeId] = result.output;
              this.updateDownstreamLiveDegree(result.nodeId, outgoing, incomingCount, deadEdges);
            }
          } else if (result.status === 'skipped') {
            skippedNodes.add(result.nodeId);
            this.markOutgoingDead(result.nodeId, outgoing, incomingCount, deadEdges);
          } else {
            // success
            if (result.output !== undefined) {
              nodeOutputs[result.nodeId] = result.output;
            }

            // Handle condition nodes — mark non-taken branch dead
            const node = nodes.find((n: any) => n.id === result.nodeId);
            if ((node?.type === 'condition') && result.output?.result !== undefined) {
              const taken = result.output.result ? 'true' : 'false';
              const notTaken = result.output.result ? 'false' : 'true';
              for (const { edgeId, target, sourceHandle } of outgoing.get(result.nodeId) || []) {
                if (sourceHandle === notTaken) {
                  deadEdges.add(edgeId);
                  const cnt = incomingCount.get(target)!;
                  cnt.live = Math.max(0, cnt.live - 1);
                  cnt.dead++;
                } else {
                  // live edge — update downstream
                  const cnt = incomingCount.get(target)!;
                  cnt.live = Math.max(0, cnt.live - 1);
                }
              }
            } else {
              this.updateDownstreamLiveDegree(result.nodeId, outgoing, incomingCount, deadEdges);
            }
          }
        }

        // Persist progress
        await this.db.update(schema.workflowExecution)
          .set({ nodeResults: JSON.parse(JSON.stringify(nodeResults)) })
          .where(eq(schema.workflowExecution.executionId, executionId));

        if (fatalError) throw fatalError;
      }

      // All nodes processed — determine final output
      const finalOutput = this.getFinalOutput(
        [...completedNodes],
        nodeOutputs,
        definition,
      );
      const updateData: any = {
        status: 'completed',
        completedAt: new Date(),
        nodeResults: JSON.parse(JSON.stringify(nodeResults)),
        currentNode: null,
      };
      if (finalOutput !== undefined) updateData.outputData = JSON.parse(JSON.stringify(finalOutput));

      await this.db.update(schema.workflowExecution).set(updateData)
        .where(eq(schema.workflowExecution.executionId, executionId));

      // Update workflow execution stats
      const wf = await this.db.query.workflow.findFirst({
        where: (w) => eq(w.workflowId, definition.workflowId ?? ''),
      });
      if (wf) {
        await this.db.update(schema.workflow)
          .set({ executionCount: (wf.executionCount || 0) + 1, lastExecutedAt: new Date() })
          .where(eq(schema.workflow.workflowId, wf.workflowId));
      }

      this.logger.log(
        `Workflow execution ${executionId} completed in ${Date.now() - startTime}ms ` +
        `(${completedNodes.size} node(s), ${skippedNodes.size} skipped)`,
      );
    } catch (error: any) {
      if (error instanceof HumanApprovalPauseError) {
        // Persist pause state then stop — execution will resume via approveExecution()
        await this.persistApprovalPause(executionId, error.nodeId, error.approvalToken, nodeOutputs, nodeResults);
        this.logger.log(`Workflow execution ${executionId} paused at node ${error.nodeId} awaiting approval`);
        return;
      }
      await this.db.update(schema.workflowExecution)
        .set({ status: 'failed', completedAt: new Date(), errorMessage: error.message, currentNode: null })
        .where(eq(schema.workflowExecution.executionId, executionId));
      this.logger.error(`Workflow execution ${executionId} failed: ${error.message}`);
    }
  }

  // ── Node dispatch ──────────────────────────────────────────────────────────

  private async dispatchNode(
    context: NodeExecutionContext,
    agentId: string | undefined,
    userId?: string,
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const duration = () => Date.now() - startTime;

    try {
      const { nodeId, nodeType, inputs, config } = context;
      this.logger.debug(`Dispatching node ${nodeId} (type=${nodeType})`);

      switch (nodeType) {
        case 'input':
          return { nodeId, status: 'success', output: inputs, duration: duration() };

        case 'output':
          return { nodeId, status: 'success', output: inputs, duration: duration() };

        case 'condition':
          return await this.executeConditionNode(nodeId, inputs, config, duration);

        case 'transform':
          return await this.executeTransformNode(nodeId, inputs, config, duration);

        case 'loop':
          return await this.executeLoopNode(nodeId, inputs, config, agentId, userId, duration);

        case 'agent_processor':
          return await this.executeAgentProcessorNode(nodeId, inputs, config, agentId, duration);

        case 'human_approval':
          return await this.executeHumanApprovalNode(nodeId, inputs, config, duration);

        case 'tool':
        default:
          return await this.executeToolNode(context, agentId, userId, duration);
      }
    } catch (error: any) {
      if (error instanceof HumanApprovalPauseError) throw error;
      this.logger.error(`Node ${context.nodeId} dispatch failed: ${error.message}`);
      return { nodeId: context.nodeId, status: 'error', error: error.message, duration: duration() };
    }
  }

  private async executeConditionNode(
    nodeId: string,
    inputs: Record<string, any>,
    config: Record<string, any> | undefined,
    duration: () => number,
  ): Promise<NodeExecutionResult> {
    const expression: string = config?.expression;
    if (!expression) {
      return { nodeId, status: 'error', error: 'condition node requires config.expression', duration: duration() };
    }
    try {
      const sandbox = { ...inputs, __result__: undefined };
      vm.runInNewContext(`__result__ = !!(${expression})`, sandbox, { timeout: 1000 });
      const result = Boolean(sandbox.__result__);
      this.logger.debug(`Condition node ${nodeId}: "${expression}" → ${result}`);
      return { nodeId, status: 'success', output: { result, expression, inputs }, duration: duration() };
    } catch (e: any) {
      const err = new WorkflowNodeError({
        nodeId,
        nodeType: 'condition',
        message: `Condition evaluation failed: ${e.message}`,
        retryable: false,
        cause: e,
      });
      return { nodeId, status: 'error', error: err.message, duration: duration() };
    }
  }

  private async executeTransformNode(
    nodeId: string,
    inputs: Record<string, any>,
    config: Record<string, any> | undefined,
    duration: () => number,
  ): Promise<NodeExecutionResult> {
    const mapping: Record<string, string> = config?.mapping;
    if (!mapping) {
      // No mapping — pass through
      return { nodeId, status: 'success', output: inputs, duration: duration() };
    }
    const output: Record<string, any> = {};
    for (const [targetField, sourcePath] of Object.entries(mapping)) {
      output[targetField] = this.getNestedValue(inputs, sourcePath);
    }
    // Merge with static values from config if present
    if (config?.static) {
      Object.assign(output, config.static);
    }
    return { nodeId, status: 'success', output, duration: duration() };
  }

  private async executeLoopNode(
    nodeId: string,
    inputs: Record<string, any>,
    config: Record<string, any> | undefined,
    agentId: string | undefined,
    userId: string | undefined,
    duration: () => number,
  ): Promise<NodeExecutionResult> {
    const iterations: number = config?.iterations ?? 1;
    const toolId: string | undefined = config?.toolId;
    const itemsPath: string | undefined = config?.itemsPath;

    // If itemsPath is set, iterate over an array; otherwise repeat `iterations` times
    const items: any[] = itemsPath
      ? (this.getNestedValue(inputs, itemsPath) ?? [])
      : Array.from({ length: iterations }, (_, i) => ({ ...inputs, __loopIndex__: i }));

    const results: any[] = [];
    for (const item of items) {
      if (toolId) {
        let tool: any = await this.db.query.tool.findFirst({
          where: (t: any) => eq(t.toolId, toolId),
        });
        if (!tool) {
          const staticTool = this.toolService.getStaticTools().find((t) => t.toolId === toolId);
          if (staticTool) tool = { ...staticTool, owner: null, version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), tags: ['platform', 'static'] };
        }
        if (tool) {
          const result = await this.invokeTool(tool, item, agentId, userId);
          results.push(result);
        }
      } else {
        results.push(item);
      }
    }

    return { nodeId, status: 'success', output: { results, count: results.length }, duration: duration() };
  }

  private async executeAgentProcessorNode(
    nodeId: string,
    inputs: Record<string, any>,
    config: Record<string, any> | undefined,
    agentId: string | undefined,
    duration: () => number,
  ): Promise<NodeExecutionResult> {
    const targetAgentId: string | undefined = config?.agentId ?? agentId;
    if (!targetAgentId) {
      return { nodeId, status: 'error', error: 'agent_processor node requires agentId in config or workflow context', duration: duration() };
    }

    const instruction: string = config?.prompt
      ? this.interpolateTemplate(config.prompt, inputs)
      : 'Analyze and process the provided data, then return a clear, structured result.';

    try {
      const agent = await this.agentService.getAgent({ agentId: targetAgentId });
      if (!agent) {
        return { nodeId, status: 'error', error: `Agent ${targetAgentId} not found`, duration: duration() };
      }

      const output = await this.commonToolService.processWithinWorkflow({
        instruction,
        data: inputs,
        sessionId: '',
        agentId: targetAgentId,
        maxTokens: config?.maxTokens,
        workflowDepth: 1,
      });
      return { nodeId, status: 'success', output, duration: duration() };
    } catch (e: any) {
      const err = new AgentProcessorError({
        nodeId,
        agentId: targetAgentId,
        message: `Agent processor failed: ${e.message}`,
        cause: e,
      });
      this.logger.error(`Agent processor node ${nodeId} (agent=${targetAgentId}) failed [retryable=${err.retryable}]: ${err.message}`);
      return { nodeId, status: 'error', error: err.message, duration: duration() };
    }
  }

  private async executeHumanApprovalNode(
    nodeId: string,
    inputs: Record<string, any>,
    config: Record<string, any> | undefined,
    duration: () => number,
  ): Promise<NodeExecutionResult> {
    // Generate a cryptographically random approval token
    const approvalToken = randomBytes(32).toString('hex');
    const prompt: string = config?.prompt
      ? this.interpolateTemplate(config.prompt, inputs)
      : 'Please review and approve';

    // The caller (executeGraphWalker) catches HumanApprovalPauseError and persists state
    throw new HumanApprovalPauseError(nodeId, approvalToken, prompt);
  }

  private async executeToolNode(
    context: NodeExecutionContext,
    agentId: string | undefined,
    userId?: string,
    duration?: () => number,
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const dur = duration ?? (() => Date.now() - startTime);

    let tool: any = null;
    try {
      tool = context.toolId
        ? await this.db.query.tool.findFirst({ where: (t: any) => eq(t.toolId, context.toolId!) })
        : null;

      if (!tool && context.toolId) {
        const staticTool = this.toolService.getStaticTools().find((t) => t.toolId === context.toolId);
        if (staticTool) {
          tool = { ...staticTool, owner: null, version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), tags: ['platform', 'static'] };
        }
      }
      if (!tool) {
        return {
          nodeId: context.nodeId,
          status: 'error',
          error: `Tool ${context.toolId} not found`,
          duration: dur(),
        };
      }
      const output = await this.invokeTool(tool, context.inputs, agentId, userId);
      return { nodeId: context.nodeId, status: 'success', output, duration: dur() };
    } catch (error: any) {
      const err = new ToolExecutionError({
        toolName: tool?.name ?? context.toolId ?? 'unknown',
        toolId: context.toolId,
        nodeId: context.nodeId,
        message: error.message,
        statusCode: error.response?.statusCode ?? error.statusCode,
        cause: error,
      });
      this.logger.error(`Tool node ${context.nodeId} (${err.toolName}) failed [retryable=${err.retryable}]: ${err.message}`);
      return { nodeId: context.nodeId, status: 'error', error: err.message, duration: dur() };
    }
  }

  // ── Graph helpers ──────────────────────────────────────────────────────────

  /** Decrement live in-degree for all live outgoing edges of a completed node. */
  private updateDownstreamLiveDegree(
    nodeId: string,
    outgoing: Map<string, Array<{ edgeId: string; target: string; sourceHandle?: string }>>,
    incomingCount: Map<string, { live: number; dead: number; total: number }>,
    deadEdges: Set<string>,
  ): void {
    for (const { edgeId, target } of outgoing.get(nodeId) || []) {
      if (!deadEdges.has(edgeId)) {
        const cnt = incomingCount.get(target)!;
        cnt.live = Math.max(0, cnt.live - 1);
      }
    }
  }

  /** Mark all outgoing edges of a failed/skipped node as dead. */
  private markOutgoingDead(
    nodeId: string,
    outgoing: Map<string, Array<{ edgeId: string; target: string; sourceHandle?: string }>>,
    incomingCount: Map<string, { live: number; dead: number; total: number }>,
    deadEdges: Set<string>,
  ): void {
    for (const { edgeId, target } of outgoing.get(nodeId) || []) {
      if (!deadEdges.has(edgeId)) {
        deadEdges.add(edgeId);
        const cnt = incomingCount.get(target)!;
        cnt.live = Math.max(0, cnt.live - 1);
        cnt.dead++;
      }
    }
  }

  /** Recursively mark a node as skipped and propagate deadness to its children. */
  private propagateSkip(
    nodeId: string,
    nodes: any[],
    outgoing: Map<string, Array<{ edgeId: string; target: string; sourceHandle?: string }>>,
    incomingCount: Map<string, { live: number; dead: number; total: number }>,
    deadEdges: Set<string>,
    skippedNodes: Set<string>,
  ): void {
    if (skippedNodes.has(nodeId)) return;
    skippedNodes.add(nodeId);
    for (const { edgeId, target } of outgoing.get(nodeId) || []) {
      if (!deadEdges.has(edgeId)) {
        deadEdges.add(edgeId);
        const cnt = incomingCount.get(target)!;
        cnt.live = Math.max(0, cnt.live - 1);
        cnt.dead++;
        if (cnt.live === 0 && cnt.dead === cnt.total) {
          this.propagateSkip(target, nodes, outgoing, incomingCount, deadEdges, skippedNodes);
        }
      }
    }
  }

  // ── Tool invocation ────────────────────────────────────────────────────────

  private async invokeTool(
    tool: any,
    inputs: Record<string, any>,
    agentId: string | undefined,
    userId?: string,
    workflowDepth: number = 1,
  ): Promise<any> {
    const functionName = tool.name;
    const metadata: any = { agentId, sessionId: undefined, spaceId: undefined };
    // Phase 10: wallet key injection removed — tools use WalletService if they need signing
    const { agentId: _, privateKey: __, sessionId: ___, spaceId: ____, ...cleanInputs } = inputs;
    this.logger.log(`Invoking tool: ${functionName}`, cleanInputs);

    if (tool.apiSpec) {
      return await this.invokeDynamicTool(tool.apiSpec, cleanInputs);
    }

    const staticService = [this.commonToolService, this.ethereumToolService]
      .find((service) => typeof (service as any)[functionName] === 'function');
    if (staticService) {
      if (functionName === 'processWithinWorkflow') {
        return await (staticService as any)[functionName]({ ...cleanInputs, workflowDepth }, metadata);
      }
      // @ts-expect-error runtime dispatch
      return await staticService[functionName](cleanInputs, metadata);
    }

    throw new Error(`No static, dynamic, or resource-based implementation found for tool "${functionName}"`);
  }

  private async invokeDynamicTool(
    apiSpec: {
      method: string; baseUrl: string; path: string;
      headers?: Record<string, string>; queryParams?: Record<string, string>; bodyTemplate?: any;
    },
    parsedArgs: Record<string, any>,
  ): Promise<any> {
    const { method, baseUrl, path, headers, queryParams, bodyTemplate } = apiSpec;
    const url = new URL(`${baseUrl}${path}`);
    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        const m = v.match(/^\{(.+)\}$/);
        if (m) { if (parsedArgs[m[1]] !== undefined) url.searchParams.set(k, parsedArgs[m[1]].toString()); }
        else url.searchParams.set(k, v);
      }
    }
    let requestBody: any;
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      requestBody = bodyTemplate ? this.buildBodyFromTemplate(bodyTemplate, parsedArgs)
        : Object.keys(parsedArgs).length > 0 ? parsedArgs : undefined;
    }
    const response = await fetch(url.toString(), {
      method,
      headers: headers ?? {},
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });
    if (!response.ok) throw new Error(`Dynamic API error: ${response.status} ${response.statusText}`);
    return await response.json();
  }

  private buildBodyFromTemplate(template: any, args: Record<string, any>): any {
    if (Array.isArray(template)) return template.map((e) => this.buildBodyFromTemplate(e, args));
    if (template && typeof template === 'object') {
      const result: any = {};
      for (const [k, v] of Object.entries(template)) result[k] = this.buildBodyFromTemplate(v, args);
      return result;
    }
    if (typeof template === 'string') {
      const m = template.match(/^\{(.+)\}$/);
      return m ? args[m[1]] : template;
    }
    return template;
  }

  // ── Input mapping ──────────────────────────────────────────────────────────

  private mapNodeInputs(
    nodeId: string, edges: any[], nodeOutputs: Record<string, any>, config?: Record<string, any>,
  ): Record<string, any> {
    const inputs: Record<string, any> = {};
    for (const edge of edges.filter((e) => e.target === nodeId)) {
      const src = nodeOutputs[edge.source];
      if (!src) continue;
      if (edge.mapping) {
        for (const [sf, tf] of Object.entries(edge.mapping) as [string, string][]) {
          const v = this.getNestedValue(src, sf);
          if (v !== undefined) inputs[tf] = v;
        }
      } else if (edge.sourceHandle && edge.targetHandle) {
        const v = this.getNestedValue(src, edge.sourceHandle);
        if (v !== undefined) inputs[edge.targetHandle] = v;
      } else {
        Object.assign(inputs, src);
      }
    }
    if (config) {
      const { expression, mapping, iterations, itemsPath, prompt, agentId, toolId, ...rest } = config;
      Object.assign(inputs, rest);
    }
    return inputs;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  private getFinalOutput(completedNodes: string[], nodeOutputs: Record<string, any>, definition: any): any {
    if (definition.outputMapping) {
      const output: Record<string, any> = {};
      for (const [key, nodePath] of Object.entries(definition.outputMapping)) {
        const [nodeId, ...fp] = (nodePath as string).split('.');
        const nodeOutput = nodeOutputs[nodeId];
        if (nodeOutput) output[key] = fp.length ? this.getNestedValue(nodeOutput, fp.join('.')) : nodeOutput;
      }
      return output;
    }
    // Return output of last completed node (excluding __input__)
    const last = completedNodes[completedNodes.length - 1];
    return last ? nodeOutputs[last] : undefined;
  }

  private interpolateTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(.+?)\}\}/g, (_, path) => {
      const val = this.getNestedValue(context, path.trim());
      return val !== undefined ? String(val) : `{{${path}}}`;
    });
  }

  // ── Public query methods ───────────────────────────────────────────────────

  async getExecutionStatus(executionId: string) {
    const execution = await this.db.query.workflowExecution.findFirst({
      where: (e: any) => eq(e.executionId, executionId),
      with: { workflow: true, agent: true },
    });
    if (!execution) throw new Error(`Execution ${executionId} not found`);
    return execution;
  }

  async cancelExecution(executionId: string) {
    const [updated] = await this.db.update(schema.workflowExecution)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(eq(schema.workflowExecution.executionId, executionId))
      .returning();
    if (!updated) throw new Error(`Execution ${executionId} not found`);
    this.logger.log(`Cancelled workflow execution ${executionId}`);
    return { success: true };
  }

  async listExecutions(workflowId: string, limit = 50) {
    return this.db.query.workflowExecution.findMany({
      where: (e: any) => eq(e.workflowId, workflowId),
      limit,
      orderBy: (e: any, { desc }: any) => [desc(e.createdAt)],
    });
  }

  /**
   * Persist the paused execution state before throwing HumanApprovalPauseError.
   * Called by executeGraphWalker just before re-throwing the pause signal.
   */
  async persistApprovalPause(
    executionId: string,
    nodeId: string,
    approvalToken: string,
    nodeOutputs: Record<string, any>,
    nodeResults: Record<string, NodeExecutionResult>,
  ): Promise<void> {
    await this.db.update(schema.workflowExecution)
      .set({
        status: 'awaiting_approval',
        approvalToken,
        pausedAtNode: nodeId,
        pausedNodeOutputs: JSON.parse(JSON.stringify(nodeOutputs)),
        nodeResults: JSON.parse(JSON.stringify(nodeResults)),
        currentNode: nodeId,
      })
      .where(eq(schema.workflowExecution.executionId, executionId));
  }
}
