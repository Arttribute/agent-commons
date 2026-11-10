"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  isProjectPageChatRequest,
  projectPageFrameUrl,
  type ProjectPageFrameData,
  type ProjectPageFrameSession,
} from "./page-bridge";
/**
 * An opaque frame with an opt-in chat-draft bridge. No agent or credential is exposed.
 * Pass a server-created `session` so the frame is in the server HTML and starts
 * loading immediately; without one, the frame appears after hydration.
 */
export function ProjectPageFrame({
  page,
  onChatDraftRequest,
  session,
}: {
  page: ProjectPageFrameData;
  onChatDraftRequest: () => void;
  session?: ProjectPageFrameSession;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [nonce, setNonce] = useState(session?.nonce ?? "");
  const [hostOrigin, setHostOrigin] = useState(session?.hostOrigin ?? "");
  useEffect(() => {
    setNonce((current) => current || crypto.randomUUID());
    // The browser's origin is authoritative if a proxy reported another one.
    setHostOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (!nonce) return;
    const receive = (event: MessageEvent) => {
      let origin: string;
      try {
        origin = new URL(page.entryUrl).origin;
      } catch {
        return;
      }
      if (
        !isProjectPageChatRequest(
          event,
          frame.current?.contentWindow,
          nonce,
          origin,
        )
      )
        return;
      let ok = page.chatEnabled;
      let error = ok ? "" : "Chat is not enabled for this page.";
      try {
        if (ok) onChatDraftRequest();
      } catch {
        ok = false;
        error = "The chat draft could not be opened.";
      }
      (event.source as Window).postMessage(
        { type: "commons-page:reply", nonce, id: event.data.id, ok, error },
        "*",
      );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [nonce, page, onChatDraftRequest]);
  let url = "";
  let error = "";
  try {
    if (nonce && hostOrigin)
      url = projectPageFrameUrl(
        page.entryUrl,
        page.slug,
        hostOrigin,
        nonce,
        page.chatEnabled,
      );
  } catch {
    error = "This page has an invalid asset address.";
  }
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {error ? (
        <p role="alert" style={{ padding: 24 }}>
          {error}
        </p>
      ) : url ? (
        <iframe
          ref={frame}
          src={url}
          title={page.title}
          style={{ height: "100%", width: "100%", border: 0 }}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          aria-label="Loading page"
          style={{ height: "100%", background: "#faf8f2" }}
        />
      )}
    </div>
  );
}
