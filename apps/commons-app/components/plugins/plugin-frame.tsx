"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { UiPlugin } from "./types";

export function PluginFrame({
  plugin,
  title,
  className,
}: {
  plugin: UiPlugin;
  title?: string;
  className?: string;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const permissions = plugin.manifest.permissions;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow) return;
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "commons:ready") {
        iframe.current?.contentWindow?.postMessage(
          {
            type: "commons:context",
            pluginId: plugin.pluginId,
            theme: document.documentElement.classList.contains("dark")
              ? "dark"
              : "light",
          },
          "*"
        );
      }
      if (
        message.type === "commons:navigate" &&
        permissions.includes("navigation") &&
        isSafeInternalPath(message.path)
      ) {
        router.push(message.path);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [permissions, plugin.pluginId, router]);

  return (
    <iframe
      ref={iframe}
      src={plugin.entryUrl}
      title={title || plugin.name}
      className={className}
      sandbox="allow-scripts allow-forms allow-popups allow-downloads"
      referrerPolicy="no-referrer"
      allow="clipboard-write"
    />
  );
}

function isSafeInternalPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    value.length <= 500
  );
}
