"use client";

import { useCallback, useEffect, useState } from "react";
import { useAgentContext } from "@/context/AgentContext";
import type { ComposerLaunch } from "@/components/sessions/chat/chat-input-box";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { normalizeSessionHistory } from "@/lib/session-history";
import { useChatLaunchStore } from "@/stores/chat-launch-store";
import { SESSIONS_CHANGED } from "@/hooks/sessions/use-user-sessions";
import { useSessionRunRecovery } from "@/hooks/sessions/use-session-run-recovery";

/**
 * Loads a chat for display: the session and its history, its agent, a first
 * message queued by a launcher, any run to resume, and the live title.
 * Shared by the session page and the agents chat app.
 */
export function useSessionView(sessionId: string, options: { loadAgent?: boolean } = {}) {
  const loadAgent = options.loadAgent ?? true;
  const { activateSession, setSessionHistory, getSessionMessages } = useAgentContext();

  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loadedSessionId, setLoadedSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  // A chat opened from a launcher sends its first message here, once.
  const [launch, setLaunch] = useState<ComposerLaunch | null>(() =>
    sessionId ? useChatLaunchStore.getState().peekLaunch(sessionId) : null,
  );
  const hostActionUrl = useSessionRunRecovery(sessionId, loadedSessionId === sessionId && !loading && Boolean(session));

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLaunch(useChatLaunchStore.getState().peekLaunch(sessionId));

    async function fetchData() {
      setLoading(true);
      setSession(null);
      if (loadAgent) setAgent(null);
      activateSession(sessionId);

      try {
        const sessionRes = await desktopApiFetch(`/api/sessions/${sessionId}?full=true`);
        const sessionData = await sessionRes.json();
        if (cancelled) return;
        const loadedSession = sessionRes.ok ? (sessionData.data ?? null) : null;
        setSession(loadedSession);
        const history = normalizeSessionHistory(loadedSession?.history);
        // Keep the streaming first message if the launch already started it.
        if (history.length || !getSessionMessages(sessionId)?.length) setSessionHistory(sessionId, history);

        if (!loadAgent) return;
        if (loadedSession?.agentId) {
          const agentRes = await desktopApiFetch(`/api/agents/${loadedSession.agentId}`);
          const agentData = await agentRes.json();
          if (cancelled) return;
          setAgent(agentRes.ok ? (agentData.data ?? null) : null);
        } else {
          setAgent(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching session:", err);
        setAgent(null);
        setSession(null);
        if (!getSessionMessages(sessionId)?.length) setSessionHistory(sessionId, []);
      } finally {
        if (!cancelled) {
          setLoadedSessionId(sessionId);
          setLoading(false);
        }
      }
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, loadAgent]);

  const [liveTitle, setLiveTitle] = useState<string | null>(null);
  useEffect(() => {
    setLiveTitle(null);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; title?: string }>).detail;
      if (detail?.sessionId === sessionId && detail.title && detail.title !== "New chat") setLiveTitle(detail.title);
    };
    window.addEventListener(SESSIONS_CHANGED, onChange);
    const unsubscribe = window.agentCommonsLocal?.onEvent((event) => {
      if (event.type !== "state") return;
      const title = event.state.conversations.find((item) => item.id === sessionId)?.title;
      if (title && title !== "New chat") setLiveTitle(title);
    });
    return () => {
      window.removeEventListener(SESSIONS_CHANGED, onChange);
      unsubscribe?.();
    };
  }, [sessionId]);
  const storedTitle = session?.title && !["New chat", "New Session"].includes(session.title) ? session.title : null;

  const clearLaunch = useCallback(() => {
    useChatLaunchStore.getState().clearLaunch(sessionId);
    setLaunch(null);
  }, [sessionId]);

  return {
    agent,
    session,
    loading,
    /** False until the current session id has finished its first load. */
    ready: loadedSessionId === sessionId,
    launch,
    clearLaunch,
    hostActionUrl,
    title: (liveTitle ?? storedTitle) as string | null,
  };
}
