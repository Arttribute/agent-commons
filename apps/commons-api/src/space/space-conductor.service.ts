import {
  BadRequestException,
  Injectable,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SpaceContext } from './space-context';
import { SessionService } from '~/session/session.service';

@Injectable()
export class SpaceConductor {
  private contexts = new Map<string, SpaceContext>();

  constructor(
    @Inject(forwardRef(() => SessionService))
    private readonly session: SessionService,
  ) {}

  /** Get or create the shared context for a sessionId */
  getOrCreateContext(sessionId: string): SpaceContext {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, new SpaceContext());
    }
    return this.contexts.get(sessionId)!;
  }

  /** Clear/remove the context for a sessionId */
  clearContext(sessionId: string): boolean {
    return this.contexts.delete(sessionId);
  }

  /** Get all active session IDs */
  getActiveSessionIds(): string[] {
    return Array.from(this.contexts.keys());
  }

  /** Get the count of active sessions */
  getActiveSessionCount(): number {
    return this.contexts.size;
  }

  /** Check if a session context exists */
  hasContext(sessionId: string): boolean {
    return this.contexts.has(sessionId);
  }

  /* ─────────────────────────  SHARED CONTEXT PERSISTENCE  ───────────────────────── */

  /**
   * Save shared session context information to database
   * This persists the session state including messages, tool calls, and agent interactions
   */
  async saveSharedContextToDB(sessionId: string) {
    try {
      const spaceContext = this.getOrCreateContext(sessionId);

      // Get current session from DB
      const currentSession = await this.session.getSession({ id: sessionId });
      if (!currentSession) {
        throw new BadRequestException('Session not found');
      }

      // Prepare the context data for storage
      const contextData = {
        messages: spaceContext.getMessages(),
        toolCalls: spaceContext.getToolCalls(),
        agentInteractions: spaceContext.getAgentInteractions(),
        contributions: spaceContext.contributions,
        finalResult: spaceContext.finalResult,
        lastUpdated: new Date().toISOString(),
        totalEvents: spaceContext.contributions.length,
      };

      // Update session with context data
      await this.session.updateSession({
        id: sessionId,
        delta: {
          // Update the history with all messages from shared context
          history: [
            ...spaceContext.getMessages().map((msg, index) => ({
              role: msg.role,
              content:
                typeof msg.content === 'string'
                  ? msg.content
                  : JSON.stringify(msg.content),
              timestamp: new Date().toISOString(),
              metadata: {
                messageIndex: index,
                fromSharedContext: true,
              },
            })),
            // Add a special entry for context metadata
            {
              role: 'system',
              content: JSON.stringify({
                type: 'shared_context_metadata',
                data: contextData,
              }),
              timestamp: new Date().toISOString(),
              metadata: {
                isContextMetadata: true,
                fromSharedContext: true,
              },
            },
          ],
          // Update metrics based on shared context
          metrics: {
            totalTokens: spaceContext
              .getToolCalls()
              .reduce((acc, tool) => acc + (tool.duration || 0), 0),
            toolCalls: spaceContext.getToolCalls().length,
            errorCount: spaceContext
              .getToolCalls()
              .filter((tool) => tool.status === 'error').length,
          },
          updatedAt: new Date(),
        },
      });

      console.log(`[SharedContext] Saved context for session ${sessionId}:`, {
        messages: contextData.messages.length,
        toolCalls: contextData.toolCalls.length,
        agentInteractions: contextData.agentInteractions.length,
        totalEvents: contextData.totalEvents,
      });

      return {
        success: true,
        sessionId,
        contextData,
      };
    } catch (error) {
      console.error(
        `[SharedContext] Error saving context for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Load shared session context from database
   * This restores the session state from persisted data
   */
  async loadSharedContextFromDB(sessionId: string) {
    try {
      const session = await this.session.getSession({ id: sessionId });
      if (!session) {
        throw new BadRequestException('Session not found');
      }

      const spaceContext = this.getOrCreateContext(sessionId);

      // Extract context data from session history
      let contextData = null;
      if (session.history) {
        const contextMetadataEntry = session.history.find(
          (entry) => entry.metadata?.isContextMetadata,
        );
        if (contextMetadataEntry) {
          try {
            const parsedContent = JSON.parse(contextMetadataEntry.content);
            if (parsedContent.type === 'shared_context_metadata') {
              contextData = parsedContent.data;
            }
          } catch (error) {
            console.error('Error parsing context metadata:', error);
          }
        }
      }

      // If session has stored context data, restore it
      if (contextData) {
        // Restore messages to shared context
        if (contextData.messages) {
          contextData.messages.forEach((msg: any) => {
            spaceContext.bus.next({
              type: 'message',
              agentId: session.agentId,
              payload: msg,
              timestamp: Date.now(),
            });
          });
        }

        // Restore tool calls
        if (contextData.toolCalls) {
          contextData.toolCalls.forEach((toolCall: any) => {
            spaceContext.bus.next({
              type: 'tool',
              agentId: session.agentId,
              payload: toolCall,
              timestamp: Date.now(),
            });
          });
        }

        // Restore agent interactions
        if (contextData.agentInteractions) {
          contextData.agentInteractions.forEach((interaction: any) => {
            spaceContext.bus.next({
              type: 'agentCall',
              agentId: interaction.agentId,
              payload: interaction.payload,
              timestamp: Date.now(),
            });
          });
        }

        console.log(
          `[SharedContext] Loaded context for session ${sessionId}:`,
          {
            messages: contextData.messages?.length || 0,
            toolCalls: contextData.toolCalls?.length || 0,
            agentInteractions: contextData.agentInteractions?.length || 0,
          },
        );
      }

      return spaceContext;
    } catch (error) {
      console.error(
        `[SharedContext] Error loading context for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Clear shared context for a session
   * Useful for resetting or cleaning up sessions
   */
  async clearSharedContext(sessionId: string) {
    try {
      // Clear the context by creating a new one
      this.clearContext(sessionId);

      // Update database to reflect the clearing
      await this.session.updateSession({
        id: sessionId,
        delta: {
          history: [],
          metrics: {
            totalTokens: 0,
            toolCalls: 0,
            errorCount: 0,
          },
          updatedAt: new Date(),
        },
      });

      console.log(`[SharedContext] Cleared context for session: ${sessionId}`);

      return { success: true, sessionId };
    } catch (error) {
      console.error(
        `[SharedContext] Error clearing context for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Auto-save shared context periodically during agent execution
   */
  // private async autoSaveSharedContext(sessionId: string) {
  //   try {
  //     // Save every 30 seconds during execution
  //     setTimeout(async () => {
  //       await this.saveSharedContextToDB(sessionId);
  //     }, 30000);
  //   } catch (error) {
  //     console.error(
  //       `[SharedContext] Auto-save failed for session ${sessionId}:`,
  //       error,
  //     );
  //   }
}
