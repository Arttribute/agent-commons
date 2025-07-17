import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { eq, desc } from 'drizzle-orm';
import { ChatOpenAI } from '@langchain/openai';
import { SpaceService } from './space.service';
import { AgentService } from '../agent/agent.service';
import { SessionService } from '../session/session.service';
import { DatabaseService } from '../modules/database/database.service';
import * as schema from '#/models/schema';

const generateId = () => uuidv4();

interface BusMessage {
  messageId: string;
  spaceId: string;
  senderId: string;
  senderType: 'agent' | 'human';
  content: string;
  messageType: 'text' | 'command' | 'response' | 'final';
  targetType: 'broadcast' | 'direct' | 'group';
  targetIds?: string[];
  timestamp: number;
  metadata?: any;
}

type MessageCallback = (message: BusMessage) => void;

@Injectable()
export class SpaceBusService implements OnModuleInit, OnModuleDestroy {
  // In-memory storage
  private spaceMessages = new Map<string, BusMessage[]>(); // spaceId -> messages
  private spaceSubscriptions = new Map<string, Set<MessageCallback>>(); // spaceId -> callbacks
  private messageSubjects = new Map<string, Subject<BusMessage>>(); // spaceId -> stream subjects

  // Configuration
  private readonly maxMessagesPerSpace = 100;
  private readonly messageRetentionMs = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly eventEmitter: EventEmitter,
    private readonly spaceService: SpaceService,
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
    private readonly sessionService: SessionService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    // Start cleanup interval to prevent memory leaks
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldMessages();
      },
      5 * 60 * 1000, // Check every 5 minutes
    );
  }

  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Subscribe to messages in a space
   */
  subscribeToSpace(spaceId: string, callback: MessageCallback): string {
    const subscriptionId = generateId();

    if (!this.spaceSubscriptions.has(spaceId)) {
      this.spaceSubscriptions.set(spaceId, new Set());
    }

    this.spaceSubscriptions.get(spaceId)!.add(callback);

    return subscriptionId;
  }

  /**
   * Unsubscribe from space messages
   */
  unsubscribeFromSpace(spaceId: string, callback: MessageCallback): void {
    const subscriptions = this.spaceSubscriptions.get(spaceId);
    if (subscriptions) {
      subscriptions.delete(callback);

      if (subscriptions.size === 0) {
        this.spaceSubscriptions.delete(spaceId);
      }
    }
  }

  /**
   * Send message to space bus
   */
  async sendMessage(
    message: Omit<BusMessage, 'messageId' | 'timestamp'>,
  ): Promise<BusMessage> {
    const busMessage: BusMessage = {
      ...message,
      messageId: generateId(),
      timestamp: Date.now(),
    };

    // Store in memory
    this.storeMessage(busMessage);

    // Notify callback subscribers
    this.notifySubscribers(busMessage);

    // Broadcast to streaming subscribers
    this.broadcastToStream(busMessage);

    return busMessage;
  }

  /**
   * Get recent messages from memory
   */
  getRecentMessages(spaceId: string, limit: number = 50): BusMessage[] {
    const messages = this.spaceMessages.get(spaceId) || [];
    return messages.slice(-limit); // Get last N messages
  }

  /**
   * Get message stream for a space (for SSE)
   */
  getMessageStream(spaceId: string): Observable<MessageEvent> {
    // Get or create subject for this space
    if (!this.messageSubjects.has(spaceId)) {
      this.messageSubjects.set(spaceId, new Subject<BusMessage>());
    }

    const subject = this.messageSubjects.get(spaceId)!;

    return subject.asObservable().pipe(
      map(
        (message) =>
          ({
            data: JSON.stringify({
              messageId: message.messageId,
              spaceId: message.spaceId,
              senderId: message.senderId,
              senderType: message.senderType,
              content: message.content,
              messageType: message.messageType,
              targetType: message.targetType,
              targetIds: message.targetIds,
              timestamp: message.timestamp,
              metadata: message.metadata,
            }),
          }) as MessageEvent,
      ),
    );
  }

  /**
   * Broadcast message to streaming subscribers
   */
  private broadcastToStream(message: BusMessage): void {
    const subject = this.messageSubjects.get(message.spaceId);
    if (subject) {
      subject.next(message);
    }
  }

  /**
   * Clean up streaming resources for a space
   */
  closeStream(spaceId: string): void {
    const subject = this.messageSubjects.get(spaceId);
    if (subject) {
      subject.complete();
      this.messageSubjects.delete(spaceId);
    }
  }

  /**
   * Store message in memory
   */
  private storeMessage(message: BusMessage): void {
    if (!this.spaceMessages.has(message.spaceId)) {
      this.spaceMessages.set(message.spaceId, []);
    }

    const messages = this.spaceMessages.get(message.spaceId)!;
    messages.push(message);

    // Trim messages if exceeding limit
    if (messages.length > this.maxMessagesPerSpace) {
      messages.splice(0, messages.length - this.maxMessagesPerSpace);
    }
  }

  /**
   * Notify subscribers of new message
   */
  private notifySubscribers(message: BusMessage): void {
    const subscribers = this.spaceSubscriptions.get(message.spaceId);
    if (subscribers) {
      subscribers.forEach((callback) => {
        try {
          callback(message);
        } catch (error) {
          console.error('Error notifying subscriber:', error);
        }
      });
    }
  }

  /**
   * Clean up old messages to prevent memory leaks
   */
  private cleanupOldMessages(): void {
    const now = Date.now();

    // Clean up old messages
    for (const [spaceId, messages] of this.spaceMessages.entries()) {
      const validMessages = messages.filter(
        (msg) => now - msg.timestamp < this.messageRetentionMs,
      );

      if (validMessages.length !== messages.length) {
        this.spaceMessages.set(spaceId, validMessages);
      }

      // Clean up empty message arrays and corresponding streams
      if (validMessages.length === 0) {
        this.spaceMessages.delete(spaceId);
        this.closeStream(spaceId);
      }
    }
  }

  /**
   * Get statistics about the bus
   */
  getStatistics(): {
    totalSpaces: number;
    totalMessages: number;
    subscribers: number;
  } {
    let totalMessages = 0;
    for (const messages of this.spaceMessages.values()) {
      totalMessages += messages.length;
    }

    let totalSubscribers = 0;
    for (const subscribers of this.spaceSubscriptions.values()) {
      totalSubscribers += subscribers.size;
    }

    return {
      totalSpaces: this.spaceMessages.size,
      totalMessages,
      subscribers: totalSubscribers,
    };
  }

  /* ─────────────────────────  PRIVATE UTILITY METHODS  ───────────────────────── */

  /**
   * Extract common space setup logic
   */
  private async setupCollaborationSpace(
    spaceId: string | undefined,
    agentIds: string[],
    spaceName?: string,
    spaceDescription?: string,
  ): Promise<string> {
    let actualSpaceId = spaceId;
    if (!actualSpaceId) {
      const space = await this.spaceService.createSpace({
        name: spaceName || `Agent Collaboration - ${new Date().toISOString()}`,
        description:
          spaceDescription || `Shared space for agents: ${agentIds.join(', ')}`,
        createdBy: agentIds[0],
        createdByType: 'agent',
      });
      actualSpaceId = space.spaceId;
    }

    // Add all participants to the space (skip the creator who was already added if space was created)
    const agentsToAdd =
      actualSpaceId === spaceId ? agentIds : agentIds.slice(1);
    for (const agentId of agentsToAdd) {
      try {
        await this.spaceService.addMember({
          spaceId: actualSpaceId,
          memberId: agentId,
          memberType: 'agent',
          role: 'member',
        });
      } catch (error) {
        // Ignore "Member already exists" errors - this is expected behavior
        if (
          error instanceof Error &&
          error.message !== 'Member already exists in this space'
        ) {
          throw error; // Re-throw other errors
        }
      }
    }

    return actualSpaceId;
  }

  /**
   * Extract shared session creation logic
   */
  private async createSharedSession(spaceId: string, agentIds: string[]) {
    return await this.sessionService.createSession({
      value: {
        sessionId: uuidv4(),
        agentId: `space-${spaceId}`,
        initiator: agentIds[0],
        model: {
          name: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 2000,
          topP: 1,
          presencePenalty: 0,
          frequencyPenalty: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /* ─────────────────────────  COLLABORATION METHODS  ───────────────────────── */

  /**
   * Unified method to run multiple agents in a shared space (supports both streaming and non-streaming)
   * This method combines the capabilities of both previous collaboration methods
   */
  async runAgentsInSharedSpace(props: {
    agentIds: string[];
    initialMessage: string;
    spaceId?: string;
    spaceName?: string;
    stream?: boolean;
    timeoutMs?: number;
    enableCollaborationSummary?: boolean;
  }): Promise<{
    spaceId: string;
    sessionId: string;
    sessions?: Observable<any>[];
    results?: Array<{
      agentId: string;
      messages: any[];
      status: 'completed' | 'timeout' | 'error';
      error?: string;
    }>;
    collaborationSummary?: {
      totalMessages: number;
      duration: number;
      outcome: 'success' | 'timeout' | 'partial_success';
    };
    finalCompilation?: {
      message: string;
      synthesizedDeliverable: string;
      agentContributions: Array<{
        agentId: string;
        status: string;
        contribution: string;
        messageCount: number;
      }>;
    };
  }> {
    const {
      agentIds,
      initialMessage,
      spaceId,
      spaceName,
      stream = true,
      timeoutMs = 300000, // 5 minutes default
      enableCollaborationSummary = false,
    } = props;

    console.log(
      `Running ${agentIds.length} agents in shared space (streaming: ${stream}, summary: ${enableCollaborationSummary})`,
    );

    // Create or use existing space using shared utility
    const actualSpaceId = await this.setupCollaborationSpace(
      spaceId,
      agentIds,
      spaceName || `Agent Collaboration - ${new Date().toISOString()}`,
      `Shared space for agents: ${agentIds.join(', ')}`,
    );

    // Create a single shared session for the space using shared utility
    const sharedSession = await this.createSharedSession(
      actualSpaceId,
      agentIds,
    );

    const instructions =
      'SHARED BUS COLLABORATION TASK:\n' +
      initialMessage +
      `\n\nYou are collaborating with other agents. \n\nUse sendBusMessage to communicate with them and subscribeToSpaceBus to receive their messages. Focus on collaborative problem-solving.\n\nThis is a single collaborative session. When you finish, send a final message with type 'final' to indicate completion.`;

    // For streaming mode, return sessions immediately
    if (stream && !enableCollaborationSummary) {
      const sessions = agentIds.map((agentId) => {
        return this.agentService.runAgent({
          agentId,
          messages: [{ role: 'user', content: instructions }],
          sessionId: sharedSession.sessionId,
          initiator: agentIds[0],
          useSharedSpace: true,
          spaceId: actualSpaceId,
          collaboratorAgentIds: agentIds.filter((id) => id !== agentId),
          stream,
        });
      });

      return {
        spaceId: actualSpaceId,
        sessionId: sharedSession.sessionId,
        sessions,
      };
    }

    // For non-streaming mode or when collaboration summary is enabled,
    // wait for completion and provide detailed results
    const agentResults = new Map<
      string,
      {
        agentId: string;
        messages: any[];
        status: 'running' | 'completed' | 'timeout' | 'error';
        error?: string;
      }
    >();

    // Initialize agent results
    agentIds.forEach((agentId) => {
      agentResults.set(agentId, {
        agentId,
        messages: [],
        status: 'running',
      });
    });

    // Collaboration metrics
    let totalMessages = 0;
    const startTime = Date.now();

    // Completion tracking for non-streaming mode
    const collaborationPromise = new Promise<void>((resolve) => {
      let isCompleted = false;
      let finalMessageCount = 0;

      const checkCompletion = () => {
        const allCompleted = Array.from(agentResults.values()).every(
          (result) =>
            result.status === 'completed' || result.status === 'error',
        );

        const hasExplicitFinalMessages = finalMessageCount >= agentIds.length;

        if (allCompleted || hasExplicitFinalMessages) {
          if (!isCompleted) {
            isCompleted = true;
            resolve();
          }
        }
      };

      // Monitor space for messages if collaboration summary is enabled
      if (enableCollaborationSummary) {
        const subscription = this.subscribeToSpace(
          actualSpaceId,
          (message: any) => {
            totalMessages++;
            const agentResult = agentResults.get(message.senderId);
            if (agentResult) {
              agentResult.messages.push(message);
            }

            if (message.messageType === 'final' && agentResult) {
              finalMessageCount++;
              agentResult.status = 'completed';
            }

            checkCompletion();
          },
        );
      }

      setTimeout(() => {
        checkCompletion();
      }, timeoutMs);
    });

    // Start all agents in the shared space using the same session
    const agentPromises = agentIds.map(async (agentId) => {
      try {
        const session = this.agentService.runAgent({
          agentId,
          messages: [{ role: 'user', content: instructions }],
          sessionId: sharedSession.sessionId,
          initiator: agentIds[0],
          useSharedSpace: true,
          spaceId: actualSpaceId,
          collaboratorAgentIds: agentIds.filter((id) => id !== agentId),
          stream,
        });

        const result = agentResults.get(agentId)!;

        if (stream) {
          // For streaming mode, return the session observable
          return session;
        } else {
          // For non-streaming mode, collect results
          return new Promise<void>((resolve, reject) => {
            session.subscribe({
              next: (chunk) => {
                result.messages.push(chunk);
                if (chunk.type === 'final' || chunk.messageType === 'final') {
                  result.status = 'completed';
                }
              },
              error: (error) => {
                result.status = 'error';
                result.error = error.message;
                reject(error);
              },
              complete: () => {
                if (result.status === 'running') {
                  result.status = 'completed';
                }
                resolve();
              },
            });
          });
        }
      } catch (error) {
        const result = agentResults.get(agentId)!;
        result.status = 'error';
        result.error = error instanceof Error ? error.message : 'Unknown error';
        throw error;
      }
    });

    // For streaming mode with summary enabled, return sessions
    if (stream && enableCollaborationSummary) {
      const sessions = (await Promise.all(agentPromises)) as Observable<any>[];
      return {
        spaceId: actualSpaceId,
        sessionId: sharedSession.sessionId,
        sessions,
      };
    }

    // For non-streaming mode, wait for completion
    try {
      await Promise.race([
        Promise.all(agentPromises),
        collaborationPromise,
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error('Collaboration timeout')),
            timeoutMs,
          ),
        ),
      ]);
    } catch (error) {
      console.log('Collaboration ended with error or timeout:', error);
    }

    // Prepare results for non-streaming mode
    const duration = Date.now() - startTime;
    const results = Array.from(agentResults.values()).map((result) => ({
      agentId: result.agentId,
      messages: result.messages,
      status: result.status === 'running' ? 'timeout' : result.status,
      error: result.error,
    }));

    let collaborationSummary;
    let finalCompilation;

    if (enableCollaborationSummary) {
      const completedCount = results.filter(
        (r) => r.status === 'completed',
      ).length;

      const outcome: 'success' | 'timeout' | 'partial_success' =
        completedCount === agentIds.length
          ? 'success'
          : completedCount > 0
            ? 'partial_success'
            : 'timeout';

      // Create agent contributions summary
      const agentContributions = results.map((result) => {
        const agentFinalMessages = result.messages.filter(
          (msg) => msg.type === 'final' || msg.messageType === 'final',
        );
        return {
          agentId: result.agentId,
          status: result.status,
          contribution:
            agentFinalMessages.length > 0
              ? agentFinalMessages[agentFinalMessages.length - 1].payload
                  ?.content ||
                agentFinalMessages[agentFinalMessages.length - 1].content ||
                'No final message provided'
              : 'No contribution provided',
          messageCount: result.messages.length,
        };
      });

      // Create intelligent synthesis of actual deliverables
      const synthesizedDeliverable = await this.synthesizeCollaborationResults(
        initialMessage,
        agentResults,
        actualSpaceId,
      );

      // Create final compilation message
      const finalCompilationMessage = `
# Final Collaboration Result

## Task
${initialMessage}

## Deliverable
${synthesizedDeliverable}

---

## Collaboration Summary
- **Duration**: ${Math.round(duration / 1000)}s
- **Outcome**: ${outcome}
- **Total Messages**: ${totalMessages}
- **Participants**: ${agentIds.length}

## Agent Participation
${agentContributions
  .map(
    (contrib) => `
- **${contrib.agentId}**: ${contrib.status} (${contrib.messageCount} messages)
`,
  )
  .join('')}

---
*This result was automatically compiled by the system at the end of the collaboration.*
`;

      try {
        await this.spaceService.sendMessage({
          spaceId: actualSpaceId,
          senderId: 'system',
          senderType: 'agent',
          content: finalCompilationMessage,
          messageType: 'final_result',
          metadata: {
            isSystemMessage: true,
            collaborationSummary: {
              totalMessages,
              duration,
              outcome,
              agentContributions,
            },
          },
        });
      } catch (error) {
        console.error('Failed to send final compilation message:', error);
      }

      collaborationSummary = {
        totalMessages,
        duration,
        outcome,
      };

      finalCompilation = {
        message: finalCompilationMessage,
        synthesizedDeliverable,
        agentContributions,
      };
    }

    return {
      spaceId: actualSpaceId,
      sessionId: sharedSession.sessionId,
      results,
      collaborationSummary,
      finalCompilation,
    };
  }

  /**
   * Intelligently synthesize collaboration results to extract actual deliverables
   */
  private async synthesizeCollaborationResults(
    taskDescription: string,
    agentResults: Map<string, any>,
    actualSpaceId: string,
  ): Promise<string> {
    try {
      // Collect all meaningful content from agents
      const allMessages: Array<{
        agentId: string;
        content: string;
        timestamp: string;
      }> = [];

      const toolResults: Array<{
        agentId: string;
        toolName: string;
        result: any;
        timestamp: string;
      }> = [];

      for (const [agentId, result] of agentResults) {
        // Extract actual content from messages
        result.messages.forEach((msg: any) => {
          if (msg.payload?.content) {
            allMessages.push({
              agentId,
              content: msg.payload.content,
              timestamp: msg.timestamp,
            });
          }

          // Extract tool results that contain actual work products
          if (msg.type === 'tool' && msg.result) {
            toolResults.push({
              agentId,
              toolName: msg.name,
              result: msg.result,
              timestamp: msg.timestamp,
            });
          }
        });
      }

      // Get all space messages for additional context
      const spaceMessages = await this.db.query.spaceMessage.findMany({
        where: eq(schema.spaceMessage.spaceId, actualSpaceId),
        orderBy: desc(schema.spaceMessage.createdAt),
      });

      // Prepare context for synthesis
      const collaborationContext = {
        task: taskDescription,
        agentMessages: allMessages,
        toolResults: toolResults,
        spaceMessages: spaceMessages.map((msg) => ({
          senderId: msg.senderId,
          content: msg.content,
          messageType: msg.messageType,
          timestamp: msg.createdAt,
        })),
      };

      // Use AI to synthesize the actual deliverable
      const synthesisLlm = new ChatOpenAI({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 2000,
        apiKey: process.env.OPENAI_API_KEY,
      });

      const synthesisPrompt = `
You are tasked with synthesizing the results of a multi-agent collaboration to extract the actual deliverable/work product.

**Original Task**: ${taskDescription}

**Collaboration Data**:
${JSON.stringify(collaborationContext, null, 2)}

**Your Job**: 
Extract and compile the ACTUAL DELIVERABLE from this collaboration. Don't just summarize what happened - provide the actual work product that was requested.

For example:
- If it was a research task: Provide the actual research report/findings
- If it was a math problem: Provide the actual solution with steps
- If it was code review: Provide the actual code improvements and recommendations
- If it was planning: Provide the actual plan/roadmap
- If it was problem-solving: Provide the actual solution

Focus on the substantive content and deliverables, not the process. Organize the output in a clear, professional format that directly addresses what was requested in the original task.

**IMPORTANT**: Only include the actual work product/deliverable. Do not include meta-commentary about the collaboration process.
`;

      const response = await synthesisLlm.invoke([
        {
          role: 'system',
          content: synthesisPrompt,
        },
      ]);

      return response.content?.toString() || 'Unable to synthesize results';
    } catch (error) {
      console.error('Error synthesizing collaboration results:', error);
      return 'Error occurred while synthesizing collaboration results';
    }
  }
}
