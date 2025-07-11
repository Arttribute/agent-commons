/*
 *   Helper class to manage the session context for agent interactions.
 *   It maintains the state of messages, contributions, tool calls, and final results.
 *   It also provides a bus for event-driven communication in a shared space.
 */
import { Subject } from 'rxjs';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface AgentEvent {
  type: 'message' | 'tool' | 'agentCall' | 'final';
  agentId: string;
  payload: any;
  timestamp: number;
}

export class SpaceContext {
  /** In-process event bus for a session */
  public readonly bus = new Subject<AgentEvent>();

  /** Aggregated state */
  public messages: ChatCompletionMessageParam[] = [];
  public contributions: AgentEvent[] = [];
  public toolCalls: any[] = [];
  public agentInteractions: AgentEvent[] = [];
  public finalResult: any = null;

  constructor() {
    // Subscribe to bus to update read-model
    this.bus.subscribe((evt) => {
      console.log(`[SpaceContext] Event received:`, {
        type: evt.type,
        agentId: evt.agentId,
        timestamp: evt.timestamp,
      });
      this.contributions.push(evt);
      switch (evt.type) {
        case 'message':
          console.log(
            `[SpaceContext] Adding message to context for agent: ${evt.agentId}`,
          );
          this.messages.push(evt.payload);
          break;
        case 'tool':
          console.log(
            `[SpaceContext] Adding tool call to context for agent: ${evt.agentId}`,
          );
          this.toolCalls.push(evt.payload);
          break;
        case 'agentCall':
          console.log(`[SpaceContext] Agent interaction registered:`, {
            agentId: evt.agentId,
            initiator: evt.payload.initiator,
          });
          this.agentInteractions.push(evt);
          break;
        case 'final':
          console.log(
            `[SpaceContext] Final result received for agent: ${evt.agentId}`,
          );
          this.finalResult = evt.payload;
          break;
      }
    });
  }

  /** Get all messages in the session */
  getMessages(): ChatCompletionMessageParam[] {
    return this.messages;
  }

  /** Get all messages for a specific agent */
  getMessagesForAgent(agentId: string): ChatCompletionMessageParam[] {
    return this.contributions
      .filter((evt) => evt.type === 'message' && evt.agentId === agentId)
      .map((evt) => evt.payload);
  }

  /** Get all agent interactions in this session */
  getAgentInteractions(): AgentEvent[] {
    return this.agentInteractions;
  }

  /** Get all tool calls in this session */
  getToolCalls(): any[] {
    return this.toolCalls;
  }

  /** Get statistics for the shared space */
  getStatistics(): {
    totalMessages: number;
    totalToolCalls: number;
    totalAgentInteractions: number;
    totalEvents: number;
    hasFinalized: boolean;
    lastActivity: number | null;
    activeAgents: string[];
  } {
    return {
      totalMessages: this.getMessages().length,
      totalToolCalls: this.getToolCalls().length,
      totalAgentInteractions: this.getAgentInteractions().length,
      totalEvents: this.contributions.length,
      hasFinalized: !!this.finalResult,
      lastActivity:
        this.contributions.length > 0
          ? Math.max(...this.contributions.map((c) => c.timestamp))
          : null,
      activeAgents: [...new Set(this.contributions.map((c) => c.agentId))],
    };
  }
}
