type RunProgressStatus = 'queued' | 'running' | 'completed' | 'failed';

export type AgentRunProgressEvent = {
  type: 'status' | 'toolProgress';
  phase?: 'commentary';
  stage?: string;
  status?: RunProgressStatus;
  message?: string;
  detail?: string;
  toolName?: string;
  payload?: Record<string, any>;
  timestamp?: string;
  sessionId?: string;
};

type Listener = (event: AgentRunProgressEvent) => void;

class AgentRunProgressBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(runId: string, listener: Listener) {
    const listeners = this.listeners.get(runId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => {
      const current = this.listeners.get(runId);
      if (!current) return;
      current.delete(listener);
      if (!current.size) this.listeners.delete(runId);
    };
  }

  emit(runId: string | undefined, event: AgentRunProgressEvent) {
    if (!runId) return;
    const listeners = this.listeners.get(runId);
    if (!listeners?.size) return;
    const payload = {
      ...event,
      phase: event.phase ?? 'commentary',
      timestamp: event.timestamp ?? new Date().toISOString(),
    } satisfies AgentRunProgressEvent;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // A broken listener must not interrupt the tool that is doing work.
      }
    }
  }
}

export const agentRunProgress = new AgentRunProgressBus();
