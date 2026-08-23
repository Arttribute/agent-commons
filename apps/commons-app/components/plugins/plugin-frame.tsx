"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createPluginRpcLimiter,
  dispatchPluginRpc,
  isHostPluginRpcMethod,
  isSafePluginNavigationPath,
  parsePluginRpcRequest,
  pluginCapabilityNames,
  pluginRpcActionForRequest,
  pluginRpcCopilotPrompt,
  preflightPluginRpcRequest,
  type PluginRpcAction,
  type PluginRpcRequest,
  type PluginRpcResize,
  type PluginRpcResponse,
} from "./plugin-rpc";
import { createPluginStorage } from "./plugin-storage";
import type { UiPlugin, UiPluginSurfaceType } from "./types";
import { notifyUiPluginsChanged } from "@/lib/ui-plugin-events";

type CommonsTheme = "light" | "dark";

type FrameState =
  | {
      status: "ready";
      entryUrl: string;
      surface: UiPluginSurfaceType;
      src: string;
      origin: string;
    }
  | {
      status: "error";
      entryUrl: string;
      surface: UiPluginSurfaceType;
      message: string;
    };

export function PluginFrame({
  plugin,
  surface,
  title,
  className,
  onResizeRequest,
}: {
  plugin: UiPlugin;
  surface: UiPluginSurfaceType;
  title?: string;
  className?: string;
  onResizeRequest?: (
    requested: PluginRpcResize,
  ) => PluginRpcResize | Promise<PluginRpcResize>;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const rpcLimiter = useRef(createPluginRpcLimiter());
  const pendingConfirmation = useRef<
    | {
        action: PluginRpcAction;
        resolve: (accepted: boolean) => void;
      }
    | undefined
  >(undefined);
  const router = useRouter();
  const canReadTheme = plugin.manifest.permissions.includes("theme.read");
  const capabilities = useMemo(() => pluginCapabilityNames(plugin), [plugin]);
  const pluginStorage = useMemo(
    () => createPluginStorage(plugin.pluginId),
    [plugin.pluginId],
  );
  const [resolvedFrame, setResolvedFrame] = useState<FrameState | null>(null);
  const [confirmation, setConfirmation] = useState<PluginRpcAction | null>(
    null,
  );

  const settleConfirmation = useCallback((accepted: boolean) => {
    const pending = pendingConfirmation.current;
    pendingConfirmation.current = undefined;
    setConfirmation(null);
    pending?.resolve(accepted);
  }, []);

  const confirmAction = useCallback((action: PluginRpcAction) => {
    return new Promise<boolean>((resolve) => {
      if (pendingConfirmation.current) {
        resolve(false);
        return;
      }
      pendingConfirmation.current = { action, resolve };
      setConfirmation(action);
    });
  }, []);

  useEffect(
    () => () => {
      pendingConfirmation.current?.resolve(false);
      pendingConfirmation.current = undefined;
    },
    [],
  );

  useEffect(() => {
    setResolvedFrame(
      resolveFrame({
        entryUrl: plugin.entryUrl,
        deploymentId: plugin.deploymentId,
        schemaVersion: plugin.manifest.schemaVersion,
        declared: plugin.manifest.surfaces.some(
          (candidate) => candidate.type === surface,
        ),
        hostOrigin: window.location.origin,
        surface,
        theme: canReadTheme ? readTheme() : undefined,
      }),
    );
  }, [
    canReadTheme,
    plugin.deploymentId,
    plugin.entryUrl,
    plugin.manifest.schemaVersion,
    plugin.manifest.surfaces,
    surface,
  ]);

  const frameState =
    resolvedFrame?.entryUrl === plugin.entryUrl &&
    resolvedFrame.surface === surface
      ? resolvedFrame
      : null;
  const frame = frameState?.status === "ready" ? frameState : null;

  const sendContext = useCallback(
    (force = false) => {
      if (!frame || (!ready.current && !force)) return;
      const element = iframe.current;
      if (!element?.contentWindow) return;
      const bounds = element.getBoundingClientRect();
      element.contentWindow.postMessage(
        {
          type: "commons:context",
          pluginId: plugin.pluginId,
          surface,
          viewport: {
            width: Math.round(element.clientWidth || bounds.width),
            height: Math.round(element.clientHeight || bounds.height),
          },
          ...(canReadTheme ? { theme: readTheme() } : {}),
          capabilities,
        },
        frame.origin,
      );
    },
    [canReadTheme, capabilities, frame, plugin.pluginId, surface],
  );

  useEffect(() => {
    ready.current = false;
    rpcLimiter.current = createPluginRpcLimiter();
  }, [frame?.src]);

  useEffect(() => {
    if (!frame) return;
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== iframe.current?.contentWindow ||
        event.origin !== frame.origin
      ) {
        return;
      }
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "commons:ready") {
        ready.current = true;
        sendContext(true);
        return;
      }
      if (
        plugin.manifest.schemaVersion === "1" &&
        message.type === "commons:navigate" &&
        plugin.manifest.permissions.includes("navigation") &&
        isSafePluginNavigationPath(message.path)
      ) {
        router.push(message.path);
        return;
      }

      const limit = rpcLimiter.current.begin();
      const parsed = parsePluginRpcRequest(message);
      if (!parsed.ok) {
        if (parsed.id !== undefined && limit.allowed) {
          iframe.current?.contentWindow?.postMessage(
            {
              jsonrpc: "2.0",
              id: parsed.id,
              error: { code: parsed.code, message: parsed.message },
            },
            frame.origin,
          );
        }
        if (limit.allowed) limit.release();
        return;
      }

      if (!limit.allowed) {
        iframe.current?.contentWindow?.postMessage(
          {
            jsonrpc: "2.0",
            id: parsed.request.id,
            error: { code: -32029, message: limit.message },
          },
          frame.origin,
        );
        return;
      }

      const source = event.source;
      void executeRequest(parsed.request)
        .then((response) => {
          const contentWindow = iframe.current?.contentWindow;
          if (!contentWindow || source !== contentWindow) return;
          contentWindow.postMessage(response, frame.origin);
        })
        .finally(limit.release);

      async function executeRequest(
        request: PluginRpcRequest,
      ): Promise<PluginRpcResponse> {
        if (isHostPluginRpcMethod(request.method)) {
          return dispatchPluginRpc(request, {
            plugin,
            surface,
            confirmAction,
            navigate: (path) => router.push(path),
            openCopilot: () => undefined,
            resize: onResizeRequest,
            storage: pluginStorage,
          });
        }

        let confirmed = false;
        try {
          const authorization = preflightPluginRpcRequest(plugin, request);
          if (!authorization.ok) {
            return rpcError(
              request.id,
              authorization.code,
              authorization.message,
            );
          }
          const action = pluginRpcActionForRequest(request);
          if (action) {
            confirmed = await confirmAction(action);
            if (!confirmed) {
              return rpcError(
                request.id,
                -32003,
                "The user cancelled this action.",
              );
            }
          }
        } catch (cause) {
          return rpcError(
            request.id,
            -32602,
            cause instanceof Error ? cause.message : "Invalid Commons request.",
          );
        }

        try {
          const response = await fetch(
            `/api/ui-plugins/${encodeURIComponent(plugin.pluginId)}/rpc`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ request, confirmed }),
            },
          );
          const payload = await response.json().catch(() => null);
          if (!isRpcResponse(payload, request.id)) {
            return rpcError(
              request.id,
              -32050,
              "Commons returned an invalid app response.",
            );
          }
          const error = "error" in payload ? payload.error : undefined;
          if (
            error?.code === -32001 &&
            error.message.includes("no longer enabled")
          ) {
            notifyUiPluginsChanged({
              pluginId: plugin.pluginId,
              status: "disabled",
            });
          }
          if (request.method === "copilot.open" && !error) {
            window.dispatchEvent(
              new CustomEvent("commons-copilot-prompt", {
                detail: {
                  text: pluginRpcCopilotPrompt(request),
                  mode: "draft",
                },
              }),
            );
          }
          return payload;
        } catch {
          return rpcError(
            request.id,
            -32050,
            "Commons is temporarily unavailable.",
          );
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    confirmAction,
    frame,
    onResizeRequest,
    plugin,
    pluginStorage,
    router,
    sendContext,
    surface,
  ]);

  useEffect(() => {
    if (!frame) return;
    const element = iframe.current;
    const resizeObserver =
      element && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => sendContext())
        : null;
    if (element) resizeObserver?.observe(element);

    const themeObserver = canReadTheme
      ? new MutationObserver(() => sendContext())
      : null;
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
    };
  }, [canReadTheme, frame, sendContext]);

  if (!frameState) {
    return <div aria-busy="true" className={className} />;
  }
  if (frameState.status === "error") {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center justify-center bg-muted/30 p-5 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {frameState.message}
      </div>
    );
  }

  return (
    <>
      <iframe
        ref={iframe}
        src={frameState.src}
        title={title || plugin.name}
        className={cn("block", className)}
        // Only the trusted relay keeps its API origin. Generated code is always
        // one level deeper in an opaque-origin iframe owned by that relay.
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        scrolling={surface === "widget" ? "no" : undefined}
        data-commons-surface={surface}
        onLoad={() => {
          ready.current = true;
          sendContext(true);
        }}
      />
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) settleConfirmation(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow {plugin.name} to act?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.summary}{" "}
              {confirmation?.method === "copilot.open"
                ? "Nothing will be sent until you review the draft and press Send in Copilot."
                : "Commons will perform this action using your account only after you confirm."}
            </AlertDialogDescription>
            {confirmation?.details.length ? (
              <dl className="max-h-72 space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm">
                {confirmation.details.map((detail) => (
                  <div key={detail.label} className="grid gap-1">
                    <dt className="text-xs font-medium text-muted-foreground">
                      {detail.label}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settleConfirmation(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => settleConfirmation(true)}>
              {confirmation?.method === "copilot.open"
                ? "Add to composer"
                : "Confirm action"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function resolveFrame(args: {
  entryUrl: string;
  deploymentId: string | null;
  schemaVersion: "1" | "2";
  declared: boolean;
  hostOrigin: string;
  surface: UiPluginSurfaceType;
  theme?: CommonsTheme;
}): FrameState {
  try {
    if (!args.declared) {
      return {
        status: "error",
        entryUrl: args.entryUrl,
        surface: args.surface,
        message: `This app was not reviewed for the ${args.surface} surface.`,
      };
    }
    const url = new URL(args.entryUrl);
    if (!isSafePreviewProtocol(url) || url.username || url.password) {
      throw new Error("unsafe URL");
    }
    if (url.origin === args.hostOrigin) {
      return {
        status: "error",
        entryUrl: args.entryUrl,
        surface: args.surface,
        message: "This custom app must use a dedicated preview origin.",
      };
    }
    if (!args.deploymentId) throw new Error("missing deployment pin");
    const frameUrl = new URL("/v1/ui-plugin-host", url.origin);
    frameUrl.searchParams.set("entry", url.toString());
    frameUrl.searchParams.set("commonsSurface", args.surface);
    frameUrl.searchParams.set("commonsHostOrigin", args.hostOrigin);
    if (args.theme) frameUrl.searchParams.set("commonsTheme", args.theme);
    return {
      status: "ready",
      entryUrl: args.entryUrl,
      surface: args.surface,
      src: frameUrl.toString(),
      origin: frameUrl.origin,
    };
  } catch {
    return {
      status: "error",
      entryUrl: args.entryUrl,
      surface: args.surface,
      message: "This custom app has an invalid preview URL.",
    };
  }
}

function isRpcResponse(
  value: unknown,
  id: string | number,
): value is PluginRpcResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<PluginRpcResponse>;
  if (response.jsonrpc !== "2.0" || response.id !== id) return false;
  return "result" in response || "error" in response;
}

function rpcError(
  id: string | number,
  code: number,
  message: string,
): PluginRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isSafePreviewProtocol(url: URL) {
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

function readTheme(): CommonsTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
