"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useCommonsApps } from "@/lib/commons-apps-store";
import { AppIcon } from "./app-icon";
import { PluginFrame, type PluginChatContext } from "./plugin-frame";
import type { PluginRpcResize } from "./plugin-rpc";
import type { UiPlugin } from "./types";

export type CommonsAppWidgetRef = {
  widgetId: string;
  pluginId: string;
  slug: string;
  name: string;
  reason?: string;
  input?: Record<string, unknown>;
};

export type AppChatResponse = {
  widgetId: string;
  plugin: Pick<UiPlugin, "pluginId" | "name">;
  message: string;
  data?: Record<string, unknown>;
};

const RESPONDED_KEY = "commons-app-chat-responded";

/** Finds widgets that showCommonsApp placed in a turn's tool results. */
export function collectCommonsAppWidgets(results: unknown[]) {
  const widgets = new Map<string, CommonsAppWidgetRef>();
  for (const result of results) {
    const candidate = unwrap(result)?.commonsAppWidget;
    if (
      candidate &&
      typeof candidate.widgetId === "string" &&
      typeof candidate.pluginId === "string" &&
      typeof candidate.name === "string"
    ) {
      widgets.set(candidate.widgetId, candidate);
    }
  }
  return [...widgets.values()];
}

function unwrap(result: any): any {
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value?.data !== undefined) return unwrap(value.data);
  if (value?.toolData !== undefined) return unwrap(value.toolData);
  return value;
}

/**
 * An app an agent brought into the conversation. The app's response becomes
 * the user's next message, once per widget.
 */
export function AppChatCard({
  widget,
  sessionId,
  onRespond,
}: {
  widget: CommonsAppWidgetRef;
  sessionId?: string;
  onRespond?: (response: AppChatResponse) => void;
}) {
  const { plugins, loaded } = useCommonsApps();
  const plugin = plugins.find(
    (candidate) =>
      candidate.pluginId === widget.pluginId && candidate.status === "active",
  );
  const surface = plugin?.manifest.surfaces.find(
    (candidate) => candidate.type === "widget",
  );
  const [height, setHeight] = useState(
    Math.min(520, Math.max(240, surface?.height ?? 360)),
  );
  const [responded, setResponded] = useState(() => hasResponded(widget.widgetId));
  const sentRef = useRef(false);

  const chat = useMemo<PluginChatContext>(
    () => ({
      widgetId: widget.widgetId,
      sessionId,
      reason: widget.reason,
      input: widget.input ?? {},
    }),
    [sessionId, widget.input, widget.reason, widget.widgetId],
  );

  const respond = useCallback(
    (response: { message: string; data?: Record<string, unknown> }) => {
      if (
        !plugin ||
        !onRespond ||
        sentRef.current ||
        hasResponded(widget.widgetId)
      ) {
        return false;
      }
      sentRef.current = true;
      markResponded(widget.widgetId);
      setResponded(true);
      onRespond({
        widgetId: widget.widgetId,
        plugin,
        message: response.message,
        data: response.data,
      });
      return true;
    },
    [onRespond, plugin, widget.widgetId],
  );

  const resize = useCallback((requested: PluginRpcResize) => {
    const next = Math.min(520, Math.max(240, requested.height));
    setHeight(next);
    return { width: requested.width, height: next };
  }, []);

  if (!loaded) return null;

  return (
    <div className="not-prose my-3 w-full max-w-[520px] overflow-hidden rounded-xl border border-border bg-background shadow-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <AppIcon
          plugin={plugin ?? { pluginId: widget.pluginId, name: widget.name }}
          size={16}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {plugin?.name ?? widget.name}
        </span>
        {responded && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3 w-3" /> Responded
          </span>
        )}
      </div>
      {widget.reason && (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {widget.reason}
        </p>
      )}
      {plugin && surface ? (
        <div style={{ height }}>
          <PluginFrame
            plugin={plugin}
            surface="widget"
            placement="chat"
            chat={chat}
            onChatRespond={respond}
            onResizeRequest={resize}
            className="h-full w-full border-0"
            title={plugin.name}
          />
        </div>
      ) : (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          This app is no longer enabled.
        </p>
      )}
    </div>
  );
}

function readResponded(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(RESPONDED_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function hasResponded(widgetId: string) {
  if (typeof window === "undefined") return false;
  return readResponded().includes(widgetId);
}

function markResponded(widgetId: string) {
  try {
    const next = [...readResponded().filter((id) => id !== widgetId), widgetId];
    window.localStorage.setItem(RESPONDED_KEY, JSON.stringify(next.slice(-200)));
  } catch {
    // Without storage the in-memory state still prevents a second send.
  }
}

/** The chat message sent for an app response. */
export function appResponseMessage(response: AppChatResponse) {
  const data =
    response.data && Object.keys(response.data).length
      ? `\n\n\`\`\`json\n${JSON.stringify(response.data, null, 2)}\n\`\`\``
      : "";
  return `${response.message}\n\n_Sent from ${response.plugin.name}_${data}`;
}
