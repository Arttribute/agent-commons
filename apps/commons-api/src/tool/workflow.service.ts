import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { ToolLoaderService } from './tool-loader.service';
import { WorkflowExecutorService } from './workflow-executor.service';
import * as schema from '../../models/schema';

/**
 * Workflow node definition
 */
export interface WorkflowNode {
  id: string;
  type: 'tool' | 'agent_processor' | 'input' | 'output';
  toolId?: string;
  toolName?: string;
  position: { x: number; y: number };
  config?: Record<string, any>;
  label?: string;
}

/**
 * Workflow edge definition
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  mapping?: Record<string, string>;
  label?: string;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  startNodeId: string;
  endNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/**
 * WorkflowService
 *
 * Manages workflow CRUD operations with validation:
 * - Cycle detection (no loops allowed)
 * - Start/end node validation
 * - Tool availability checks
 * - Public workflow discovery
 * - Workflow remixing/forking
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly toolLoader: ToolLoaderService,
    private readonly workflowExecutor: WorkflowExecutorService,
  ) {}

  // Lazy-loaded ToolService to avoid circular dependency
  private toolService: any;
  private getToolService() {
    if (!this.toolService) {
      const { ToolService } = require('./tool.service');
      this.toolService = new ToolService(this.db);
    }
    return this.toolService;
  }

  /**
   * Create a new workflow
   *
   * @param params - Workflow creation parameters
   * @returns Created workflow
   */
  async createWorkflow(params: {
    name: string;
    description?: string;
    ownerId: string;
    ownerType: 'user' | 'agent';
    definition: WorkflowDefinition;
    inputSchema?: any;
    outputSchema?: any;
    isPublic?: boolean;
    category?: string;
    tags?: string[];
  }) {
    // Validate workflow definition
    await this.validateWorkflow(params.definition, params.ownerId);

    // Create workflow
    const [workflow] = await this.db
      .insert(schema.workflow)
      .values({
        name: params.name,
        description: params.description,
        ownerId: params.ownerId,
        ownerType: params.ownerType,
        definition: params.definition as any,
        inputSchema: params.inputSchema as any,
        outputSchema: params.outputSchema as any,
        isPublic: params.isPublic || false,
        category: params.category,
        tags: params.tags,
      })
      .returning();

    this.logger.log(
      `Created workflow ${workflow.workflowId} for ${params.ownerType} ${params.ownerId}`,
    );

    return workflow;
  }

  /**
   * Validate workflow definition
   *
   * @param definition - Workflow definition
   * @param ownerId - Owner ID (for tool access checks)
   * @throws BadRequestException if invalid
   */
  private async validateWorkflow(
    definition: WorkflowDefinition,
    ownerId: string,
  ): Promise<void> {
    const { nodes, edges, startNodeId, endNodeId } = definition;

    // Allow empty workflows (for initial creation)
    if (nodes.length === 0) {
      return;
    }

    // 1. Check that start and end nodes exist (only if specified)
    if (startNodeId && !nodes.find((n) => n.id === startNodeId)) {
      throw new BadRequestException(
        `Start node ${startNodeId} not found in workflow`,
      );
    }

    if (endNodeId && !nodes.find((n) => n.id === endNodeId)) {
      throw new BadRequestException(
        `End node ${endNodeId} not found in workflow`,
      );
    }

    // 2. Check for cycles (DAG validation)
    if (this.hasCycle(nodes, edges)) {
      throw new BadRequestException(
        'Workflow contains cycles. Workflows must have a clear start and end with no loops.',
      );
    }

    // 3. Validate that all tool nodes reference valid tools
    for (const node of nodes) {
      if (node.type === 'tool' && node.toolId) {
        // Check database first (for custom tools)
        let tool = await this.db.query.tool.findFirst({
          where: (t) => eq(t.toolId, node.toolId!),
        });

        // If not in database, check static tools (in-memory)
        if (!tool) {
          const toolService = this.getToolService();
          const staticTools = toolService.getStaticTools();
          const staticTool = staticTools.find((t: any) => t.toolId === node.toolId);
          if (staticTool) {
            // Found in static tools - use that name
            node.toolName = staticTool.name;
            continue;
          }
        }

        if (!tool) {
          throw new BadRequestException(
            `Tool ${node.toolId} not found in database or static tools for node ${node.id}`,
          );
        }

        // Store tool name for reference
        node.toolName = tool.name;
      }
    }

    // 4. Validate that end node is reachable from start node (only if both specified)
    if (startNodeId && endNodeId && !this.isReachable(nodes, edges, startNodeId, endNodeId)) {
      throw new BadRequestException(
        `End node ${endNodeId} is not reachable from start node ${startNodeId}`,
      );
    }

    // 5. Warn about isolated nodes (nodes with no connections)
    const isolatedNodes = this.findIsolatedNodes(nodes, edges);
    if (isolatedNodes.length > 0) {
      this.logger.warn(
        `Workflow has isolated nodes: ${isolatedNodes.join(', ')}`,
      );
    }
  }

  /**
   * Check if graph contains cycles using DFS
   *
   * @param nodes - Workflow nodes
   * @param edges - Workflow edges
   * @returns True if cycle detected
   */
  private hasCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    // Build adjacency list
    const adjList = new Map<string, string[]>();
    for (const node of nodes) {
      adjList.set(node.id, []);
    }
    for (const edge of edges) {
      adjList.get(edge.source)?.push(edge.target);
    }

    // DFS with recursion stack
    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true; // Cycle found
          }
        } else if (recursionStack.has(neighbor)) {
          return true; // Back edge found = cycle
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    // Check all nodes (in case of disconnected components)
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if target node is reachable from source node
   *
   * @param nodes - Workflow nodes
   * @param edges - Workflow edges
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @returns True if reachable
   */
  private isReachable(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    sourceId: string,
    targetId: string,
  ): boolean {
    if (sourceId === targetId) return true;

    const visited = new Set<string>();
    const queue = [sourceId];

    // Build adjacency list
    const adjList = new Map<string, string[]>();
    for (const node of nodes) {
      adjList.set(node.id, []);
    }
    for (const edge of edges) {
      adjList.get(edge.source)?.push(edge.target);
    }

    // BFS
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === targetId) {
        return true;
      }

      visited.add(current);
      const neighbors = adjList.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return false;
  }

  /**
   * Find nodes with no incoming or outgoing edges
   *
   * @param nodes - Workflow nodes
   * @param edges - Workflow edges
   * @returns List of isolated node IDs
   */
  private findIsolatedNodes(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
  ): string[] {
    const connectedNodes = new Set<string>();
    for (const edge of edges) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }

    return nodes
      .filter((node) => !connectedNodes.has(node.id))
      .map((node) => node.id);
  }

  /**
   * Get workflow by ID
   *
   * @param workflowId - The workflow ID
   * @returns Workflow
   */
  async getWorkflow(workflowId: string) {
    const workflow = await this.db.query.workflow.findFirst({
      where: (w: any) => eq(w.workflowId, workflowId),
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    return workflow;
  }

  /**
   * List workflows for a user/agent
   *
   * @param ownerId - Owner ID
   * @param ownerType - 'user' | 'agent'
   * @returns List of workflows
   */
  async listWorkflows(ownerId: string, ownerType: 'user' | 'agent') {
    return this.db.query.workflow.findMany({
      where: (w: any) =>
        and(eq(w.ownerId, ownerId), eq(w.ownerType, ownerType)),
      orderBy: (w: any, { desc }: any) => [desc(w.createdAt)],
    });
  }

  /**
   * Discover public workflows
   *
   * @param category - Optional category filter
   * @param tags - Optional tags filter
   * @param limit - Max results
   * @returns List of public workflows
   */
  async discoverPublicWorkflows(params: {
    category?: string;
    tags?: string[];
    limit?: number;
  }) {
    const { category, tags, limit = 50 } = params;

    // Build query conditions
    const conditions = [eq(schema.workflow.isPublic, true)];

    if (category) {
      conditions.push(eq(schema.workflow.category, category));
    }

    // Note: Tag filtering would need custom SQL for jsonb array contains
    // For now, we'll fetch and filter in memory

    const workflows = await this.db.query.workflow.findMany({
      where: and(...conditions),
      orderBy: (w: any, { desc }: any) => [desc(w.executionCount), desc(w.createdAt)],
      limit,
    });

    // Filter by tags if provided
    if (tags && tags.length > 0) {
      return workflows.filter((w: any) => {
        if (!w.tags) return false;
        return tags.some((tag) => w.tags?.includes(tag));
      });
    }

    return workflows;
  }

  /**
   * Fork/remix a public workflow
   *
   * @param workflowId - Original workflow ID
   * @param newOwnerId - New owner ID
   * @param newOwnerType - 'user' | 'agent'
   * @param modifications - Optional modifications
   * @returns Forked workflow
   */
  async forkWorkflow(params: {
    workflowId: string;
    newOwnerId: string;
    newOwnerType: 'user' | 'agent';
    name?: string;
    modifications?: Partial<WorkflowDefinition>;
  }) {
    // Get original workflow
    const original = await this.getWorkflow(params.workflowId);

    // Check if it's public or owner has access
    if (!original.isPublic && original.ownerId !== params.newOwnerId) {
      throw new BadRequestException(
        'Cannot fork private workflow without access',
      );
    }

    // Merge modifications
    const newDefinition = {
      ...original.definition,
      ...params.modifications,
    } as WorkflowDefinition;

    // Create forked workflow
    return this.createWorkflow({
      name: params.name || `${original.name} (Fork)`,
      description: original.description || undefined,
      ownerId: params.newOwnerId,
      ownerType: params.newOwnerType,
      definition: newDefinition,
      inputSchema: original.inputSchema || undefined,
      outputSchema: original.outputSchema || undefined,
      isPublic: false, // Forks are private by default
      category: original.category || undefined,
      tags: original.tags || undefined,
    });
  }

  /**
   * Update workflow
   *
   * @param workflowId - The workflow ID
   * @param updates - Fields to update
   * @returns Updated workflow
   */
  async updateWorkflow(
    workflowId: string,
    updates: {
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
      inputSchema?: any;
      outputSchema?: any;
      isPublic?: boolean;
      category?: string;
      tags?: string[];
    },
  ) {
    // Validate definition if provided
    if (updates.definition) {
      const workflow = await this.getWorkflow(workflowId);
      await this.validateWorkflow(updates.definition, workflow.ownerId);
    }

    const [updated] = await this.db
      .update(schema.workflow)
      .set({
        ...updates,
        definition: updates.definition as any,
        inputSchema: updates.inputSchema as any,
        outputSchema: updates.outputSchema as any,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflow.workflowId, workflowId))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    this.logger.log(`Updated workflow ${workflowId}`);

    return updated;
  }

  /**
   * Delete workflow
   *
   * @param workflowId - The workflow ID
   * @returns Success indicator
   */
  async deleteWorkflow(workflowId: string) {
    const result = await this.db
      .delete(schema.workflow)
      .where(eq(schema.workflow.workflowId, workflowId))
      .returning();

    if (!result.length) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    this.logger.log(`Deleted workflow ${workflowId}`);

    return { success: true };
  }

  /**
   * Execute a workflow
   *
   * @param workflowId - The workflow ID
   * @param agentId - The agent executing
   * @param inputData - Input data for workflow
   * @param sessionId - Optional session ID
   * @param userId - Optional user ID
   * @returns Execution ID
   */
  async executeWorkflow(params: {
    workflowId: string;
    agentId: string;
    inputData?: Record<string, any>;
    sessionId?: string;
    taskId?: string;
    userId?: string;
  }) {
    return this.workflowExecutor.executeWorkflow(params);
  }

  /**
   * Capture actual output schema from successful execution
   *
   * @param workflowId - The workflow ID
   * @param outputData - Actual output from execution
   */
  async captureActualOutput(workflowId: string, outputData: any) {
    const workflow = await this.getWorkflow(workflowId);

    // Don't update if schema is locked
    if (workflow.schemaLocked) {
      return;
    }

    // Capture actual output schema
    const actualSchema = this.inferSchema(outputData);

    await this.db
      .update(schema.workflow)
      .set({
        actualOutputSchema: actualSchema,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflow.workflowId, workflowId));

    this.logger.log(`Captured actual output schema for workflow ${workflowId}`);
  }

  /**
   * Infer JSON schema from data
   *
   * @param data - Data to infer schema from
   * @returns Inferred schema
   */
  private inferSchema(data: any): any {
    if (data === null || data === undefined) {
      return { type: 'null' };
    }

    if (Array.isArray(data)) {
      return {
        type: 'array',
        items: data.length > 0 ? this.inferSchema(data[0]) : { type: 'any' },
      };
    }

    if (typeof data === 'object') {
      const properties: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        properties[key] = this.inferSchema(value);
      }
      return {
        type: 'object',
        properties,
      };
    }

    return { type: typeof data };
  }

  /**
   * Lock workflow output schema (prevent auto-updates)
   *
   * @param workflowId - The workflow ID
   */
  async lockOutputSchema(workflowId: string) {
    await this.db
      .update(schema.workflow)
      .set({
        schemaLocked: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflow.workflowId, workflowId));

    this.logger.log(`Locked output schema for workflow ${workflowId}`);

    return { success: true };
  }
}
