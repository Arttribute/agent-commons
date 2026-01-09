import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { ToolLoaderService } from './tool-loader.service';
import { ToolService } from './tool.service';
import { CommonToolService } from './tools/common-tool.service';
import { EthereumToolService } from './tools/ethereum-tool.service';
import { AgentService } from '../agent/agent.service';
import * as schema from '../../models/schema';

/**
 * Workflow node execution context
 */
interface NodeExecutionContext {
  nodeId: string;
  toolId: string;
  inputs: Record<string, any>;
  config?: Record<string, any>;
}

/**
 * Workflow execution result
 */
interface NodeExecutionResult {
  nodeId: string;
  status: 'success' | 'error' | 'skipped';
  output?: any;
  error?: string;
  duration: number;
}

/**
 * WorkflowExecutorService
 *
 * Executes workflows (graphs of connected tools) with proper dependency management,
 * data mapping between nodes, and error handling.
 *
 * Features:
 * - Topological sort for correct execution order
 * - Output-to-input mapping between tools
 * - Parallel execution of independent nodes
 * - Error handling and recovery
 * - Execution logging and audit trail
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

  /**
   * Execute a workflow
   *
   * @param workflowId - The workflow ID
   * @param agentId - The agent executing the workflow
   * @param sessionId - The session ID
   * @param inputData - Input data for the workflow
   * @param userId - Optional user ID for key resolution
   * @returns Execution ID
   */
  async executeWorkflow(params: {
    workflowId: string;
    agentId?: string;
    sessionId?: string;
    taskId?: string;
    inputData?: Record<string, any>;
    userId?: string;
  }): Promise<string> {
    const { workflowId, agentId, sessionId, taskId, inputData, userId } =
      params;

    // Get workflow definition
    const workflow = await this.db.query.workflow.findFirst({
      where: (w) => eq(w.workflowId, workflowId),
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Create execution record
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

    this.logger.log(
      `Started workflow execution ${execution.executionId} for workflow ${workflowId}`,
    );

    // Get timeout from workflow definition (default: 5 minutes)
    const timeoutMs = workflow.timeoutMs || 300000;

    // Execute in background with timeout (don't await)
    const executionPromise = this.executeWorkflowNodes(
      execution.executionId,
      workflow.definition,
      agentId,
      userId,
      inputData || {},
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Workflow execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Race execution against timeout
    Promise.race([executionPromise, timeoutPromise]).catch(async (error) => {
      this.logger.error(
        `Workflow execution ${execution.executionId} failed: ${error.message}`,
      );

      // If timeout, mark execution as failed
      if (error.message.includes('timeout')) {
        try {
          await this.db
            .update(schema.workflowExecution)
            .set({
              status: 'failed',
              errorMessage: error.message,
              completedAt: new Date(),
            })
            .where(eq(schema.workflowExecution.executionId, execution.executionId));
        } catch (updateError) {
          this.logger.error('Failed to update timeout status:', updateError);
        }
      }
    });

    return execution.executionId;
  }

  /**
   * Execute workflow nodes in correct order
   *
   * @param executionId - The execution ID
   * @param definition - Workflow definition
   * @param agentId - The agent ID
   * @param userId - Optional user ID
   * @param inputData - Initial input data
   */
  private async executeWorkflowNodes(
    executionId: string,
    definition: any,
    agentId: string | undefined,
    userId: string | undefined,
    inputData: Record<string, any>,
  ) {
    const startTime = Date.now();

    try {
      const { nodes, edges } = definition;

      // Build execution order using topological sort
      const executionOrder = this.topologicalSort(nodes, edges);

      // Store results from each node
      const nodeResults: Record<string, NodeExecutionResult> = {};
      const nodeOutputs: Record<string, any> = {};

      // Initialize with input data
      nodeOutputs['__input__'] = inputData;

      // Execute nodes in order
      for (let i = 0; i < executionOrder.length; i++) {
        const nodeId = executionOrder[i];
        const node = nodes.find((n: any) => n.id === nodeId);
        if (!node) continue;

        // Update current node in execution
        await this.db
          .update(schema.workflowExecution)
          .set({ currentNode: nodeId })
          .where(eq(schema.workflowExecution.executionId, executionId));

        // Prepare inputs from previous nodes
        let nodeInputs = this.mapNodeInputs(
          nodeId,
          edges,
          nodeOutputs,
          node.config,
        );

        // If this is the first node and has no incoming edges, use inputData directly
        const hasIncomingEdges = edges.some((e: any) => e.target === nodeId);
        if (i === 0 && !hasIncomingEdges && Object.keys(nodeInputs).length === 0) {
          this.logger.debug(`First node ${nodeId} has no incoming edges, using inputData directly:`, inputData);
          nodeInputs = inputData;
        }

        // Execute node
        const result = await this.executeNode(
          {
            nodeId,
            toolId: node.toolId,
            inputs: nodeInputs,
            config: node.config,
          },
          agentId,
          userId,
        );

        // Store result (filter undefined values via JSON serialization)
        const sanitizedResult = JSON.parse(JSON.stringify(result));
        nodeResults[nodeId] = sanitizedResult;
        if (result.output !== undefined) {
          nodeOutputs[nodeId] = result.output;
        }

        // Update execution with node results
        await this.db
          .update(schema.workflowExecution)
          .set({ nodeResults: JSON.parse(JSON.stringify(nodeResults)) })
          .where(eq(schema.workflowExecution.executionId, executionId));

        // Stop if node failed (unless configured to continue)
        if (result.status === 'error' && !node.config?.continueOnError) {
          throw new Error(
            `Node ${nodeId} failed: ${result.error}`,
          );
        }
      }

      // Get final output (from last node or aggregate)
      const finalOutput = this.getFinalOutput(
        executionOrder,
        nodeOutputs,
        definition,
      );

      // Mark execution as completed
      const updateData: any = {
        status: 'completed',
        completedAt: new Date(),
        nodeResults: JSON.parse(JSON.stringify(nodeResults)),
      };

      // Only include outputData if it's defined
      if (finalOutput !== undefined) {
        updateData.outputData = JSON.parse(JSON.stringify(finalOutput));
      }

      await this.db
        .update(schema.workflowExecution)
        .set(updateData)
        .where(eq(schema.workflowExecution.executionId, executionId));

      // Update workflow execution count
      await this.db
        .update(schema.workflow)
        .set({
          executionCount: (definition.executionCount || 0) + 1,
          lastExecutedAt: new Date(),
        })
        .where(eq(schema.workflow.workflowId, definition.workflowId));

      this.logger.log(
        `Workflow execution ${executionId} completed in ${Date.now() - startTime}ms`,
      );
    } catch (error: any) {
      // Mark execution as failed
      await this.db
        .update(schema.workflowExecution)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error.message,
        })
        .where(eq(schema.workflowExecution.executionId, executionId));

      this.logger.error(
        `Workflow execution ${executionId} failed: ${error.message}`,
      );
    }
  }

  /**
   * Execute a single node in the workflow
   *
   * @param context - Node execution context
   * @param agentId - The agent ID
   * @param userId - Optional user ID
   * @returns Execution result
   */
  private async executeNode(
    context: NodeExecutionContext,
    agentId: string | undefined,
    userId?: string,
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      this.logger.debug(`Executing node ${context.nodeId} with tool ${context.toolId}`);

      // Try to get tool from database first (for custom tools)
      let tool: any = await this.db.query.tool.findFirst({
        where: (t: any) => eq(t.toolId, context.toolId),
      });

      // If not in database, check static tools (in-memory)
      if (!tool) {
        const staticTools = this.toolService.getStaticTools();
        const staticTool = staticTools.find((t) => t.toolId === context.toolId);
        if (staticTool) {
          // Convert static tool format to match expected tool format
          tool = {
            ...staticTool,
            owner: null,
            version: '1.0.0',
            createdAt: new Date(),
            updatedAt: new Date(),
            tags: ['platform', 'static'],
          };
        }
      }

      if (!tool) {
        return {
          nodeId: context.nodeId,
          status: 'error',
          error: `Tool ${context.toolId} not found in database or static tools`,
          duration: Date.now() - startTime,
        };
      }

      // Execute tool (this would call the actual tool execution logic)
      // For now, we'll simulate execution
      // In production, this should call agent-tools.controller logic
      const output = await this.invokeTool(
        tool,
        context.inputs,
        agentId,
        userId,
      );

      return {
        nodeId: context.nodeId,
        status: 'success',
        output,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error(
        `Node ${context.nodeId} execution failed: ${error.message}`,
      );

      return {
        nodeId: context.nodeId,
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Invoke a tool using the same logic as AgentToolsController
   *
   * @param tool - The tool to invoke
   * @param inputs - Tool inputs
   * @param agentId - The agent ID
   * @param userId - Optional user ID
   * @param workflowDepth - Current workflow nesting depth
   * @returns Tool output
   */
  private async invokeTool(
    tool: any,
    inputs: Record<string, any>,
    agentId: string | undefined,
    userId?: string,
    workflowDepth: number = 1,
  ): Promise<any> {
    const functionName = tool.name;

    // Build metadata object
    const metadata: any = {
      agentId,
      sessionId: undefined,
      spaceId: undefined,
    };

    // Get agent and add privateKey to metadata if agentId provided
    if (agentId) {
      try {
        const agent = await this.agentService.getAgent({ agentId });
        if (agent) {
          const privateKey = this.agentService.seedToPrivateKey(agent.wallet.seed);
          metadata.privateKey = privateKey;
        }
      } catch (error: any) {
        this.logger.warn(`Could not get agent ${agentId}: ${error.message}`);
      }
    }

    // Strip metadata fields from inputs to create clean tool inputs
    // These fields should only be in metadata, not in the actual tool parameters
    const { agentId: _, privateKey: __, sessionId: ___, spaceId: ____, ...cleanInputs } = inputs;

    this.logger.log(`Invoking tool: ${functionName} with inputs:`, cleanInputs);

    // 1) Check if tool has apiSpec (dynamic API call)
    if (tool.apiSpec) {
      this.logger.log(`Executing dynamic tool with apiSpec: ${functionName}`);
      return await this.invokeDynamicTool(tool.apiSpec, cleanInputs);
    }

    // 2) Check static tool services (commonToolService, ethereumToolService)
    const staticService = [
      this.commonToolService,
      this.ethereumToolService,
    ].find((service) => typeof (service as any)[functionName] === 'function');

    if (staticService) {
      this.logger.log(`Executing static tool: ${functionName}`);

      // Special handling for processWithinWorkflow to prevent infinite recursion
      if (functionName === 'processWithinWorkflow') {
        // Add workflowDepth to inputs
        const processInputs = {
          ...cleanInputs,
          workflowDepth,
        };
        return await (staticService as any)[functionName](processInputs, metadata);
      }

      // Call the static method with inputs and metadata
      // @ts-expect-error because we know it's a function
      return await staticService[functionName](cleanInputs, metadata);
    }

    // 3) If we get here, tool not found
    this.logger.error(`No implementation found for tool: ${functionName}`);
    throw new Error(
      `No static, dynamic, or resource-based implementation found for tool "${functionName}"`,
    );
  }

  /**
   * Invoke a dynamic tool via API call
   * Based on AgentToolsController.invokeDynamicTool
   */
  private async invokeDynamicTool(
    apiSpec: {
      method: string;
      baseUrl: string;
      path: string;
      headers?: Record<string, string>;
      queryParams?: Record<string, string>;
      bodyTemplate?: any;
    },
    parsedArgs: Record<string, any>,
  ): Promise<any> {
    const { method, baseUrl, path, headers, queryParams, bodyTemplate } = apiSpec;

    // 1) Build final URL with query params
    let finalUrl = `${baseUrl}${path}`;
    const url = new URL(finalUrl);
    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        const matched = v.match(/^\{(.+)\}$/);
        if (matched) {
          const argKey = matched[1];
          if (parsedArgs[argKey] !== undefined) {
            url.searchParams.set(k, parsedArgs[argKey].toString());
          }
        } else {
          url.searchParams.set(k, v);
        }
      }
    }
    finalUrl = url.toString();

    // 2) Build request body for non-GET
    let requestBody: any = undefined;
    const methodUpper = method.toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(methodUpper)) {
      if (bodyTemplate) {
        requestBody = this.buildBodyFromTemplate(bodyTemplate, parsedArgs);
      } else if (parsedArgs && Object.keys(parsedArgs).length > 0) {
        requestBody = parsedArgs;
      }
    }

    // 3) Execute fetch
    const response = await fetch(finalUrl, {
      method,
      headers: headers ?? {},
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    if (!response.ok) {
      throw new Error(
        `Dynamic API error: ${response.status} ${response.statusText}`,
      );
    }
    return await response.json();
  }

  /**
   * Recursively replace placeholders in a JSON template object
   */
  private buildBodyFromTemplate(template: any, args: Record<string, any>): any {
    if (Array.isArray(template)) {
      return template.map((elem) => this.buildBodyFromTemplate(elem, args));
    } else if (template && typeof template === 'object') {
      const result: any = {};
      for (const [key, val] of Object.entries(template)) {
        result[key] = this.buildBodyFromTemplate(val, args);
      }
      return result;
    } else if (typeof template === 'string') {
      const matched = template.match(/^\{(.+)\}$/);
      if (matched) {
        const argKey = matched[1];
        return args[argKey];
      }
      return template;
    } else {
      return template;
    }
  }

  /**
   * Topological sort to determine execution order
   *
   * @param nodes - Workflow nodes
   * @param edges - Workflow edges
   * @returns Ordered list of node IDs
   */
  private topologicalSort(nodes: any[], edges: any[]): string[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize graph
    for (const node of nodes) {
      graph.set(node.id, []);
      inDegree.set(node.id, 0);
    }

    // Build adjacency list and in-degree
    for (const edge of edges) {
      graph.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    // Start with nodes that have no dependencies
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      // Reduce in-degree for dependent nodes
      for (const neighbor of graph.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycles
    if (result.length !== nodes.length) {
      throw new Error('Workflow contains cycles');
    }

    return result;
  }

  /**
   * Map inputs for a node from previous node outputs
   *
   * @param nodeId - The current node ID
   * @param edges - Workflow edges
   * @param nodeOutputs - Outputs from all nodes
   * @param config - Node configuration
   * @returns Mapped inputs
   */
  private mapNodeInputs(
    nodeId: string,
    edges: any[],
    nodeOutputs: Record<string, any>,
    config?: Record<string, any>,
  ): Record<string, any> {
    const inputs: Record<string, any> = {};

    // Find incoming edges
    const incomingEdges = edges.filter((e) => e.target === nodeId);

    for (const edge of incomingEdges) {
      const sourceOutput = nodeOutputs[edge.source];

      if (!sourceOutput) continue;

      // Apply mapping if specified
      if (edge.mapping) {
        for (const [sourceField, targetField] of Object.entries(
          edge.mapping,
        ) as [string, string][]) {
          const value = this.getNestedValue(sourceOutput, sourceField);
          if (value !== undefined) {
            inputs[targetField as string] = value;
          }
        }
      } else if (edge.sourceHandle && edge.targetHandle) {
        // Direct field mapping
        const value = this.getNestedValue(sourceOutput, edge.sourceHandle);
        if (value !== undefined) {
          inputs[edge.targetHandle] = value;
        }
      } else {
        // Pass entire output
        inputs[edge.source] = sourceOutput;
      }
    }

    // Merge with config overrides
    if (config) {
      Object.assign(inputs, config);
    }

    return inputs;
  }

  /**
   * Get nested value from object using dot notation
   *
   * @param obj - Object to get value from
   * @param path - Dot-notation path (e.g., 'data.result.value')
   * @returns Value at path or undefined
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  /**
   * Get final output from workflow execution
   *
   * @param executionOrder - Node execution order
   * @param nodeOutputs - All node outputs
   * @param definition - Workflow definition
   * @returns Final output
   */
  private getFinalOutput(
    executionOrder: string[],
    nodeOutputs: Record<string, any>,
    definition: any,
  ): any {
    // If workflow specifies output mapping, use that
    if (definition.outputMapping) {
      const output: Record<string, any> = {};
      for (const [key, nodePath] of Object.entries(
        definition.outputMapping,
      )) {
        const [nodeId, ...fieldPath] = (nodePath as string).split('.');
        const nodeOutput = nodeOutputs[nodeId];
        if (nodeOutput) {
          output[key] = fieldPath.length
            ? this.getNestedValue(nodeOutput, fieldPath.join('.'))
            : nodeOutput;
        }
      }
      return output;
    }

    // Otherwise, return last node's output
    const lastNodeId = executionOrder[executionOrder.length - 1];
    return nodeOutputs[lastNodeId];
  }

  /**
   * Get workflow execution status
   *
   * @param executionId - The execution ID
   * @returns Execution details
   */
  async getExecutionStatus(executionId: string) {
    const execution = await this.db.query.workflowExecution.findFirst(
      {
        where: (e: any) => eq(e.executionId, executionId),
        with: {
          workflow: true,
          agent: true,
        },
      },
    );

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    return execution;
  }

  /**
   * Cancel a running workflow execution
   *
   * @param executionId - The execution ID
   * @returns Success indicator
   */
  async cancelExecution(executionId: string) {
    const [updated] = await this.db
      .update(schema.workflowExecution)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
      })
      .where(eq(schema.workflowExecution.executionId, executionId))
      .returning();

    if (!updated) {
      throw new Error(`Execution ${executionId} not found`);
    }

    this.logger.log(`Cancelled workflow execution ${executionId}`);

    return { success: true };
  }

  /**
   * List executions for a workflow
   *
   * @param workflowId - The workflow ID
   * @param limit - Max results to return
   * @returns List of executions
   */
  async listExecutions(workflowId: string, limit = 50) {
    return this.db.query.workflowExecution.findMany({
      where: (e: any) => eq(e.workflowId, workflowId),
      limit,
      orderBy: (e: any, { desc }: any) => [desc(e.createdAt)],
    });
  }
}
