"use client";

import { useState } from "react";
import { Play } from "lucide-react";

export type VideoEmbed = {
  key: string;
  provider: "youtube" | "vimeo" | "loom";
  id: string;
  url: string;
  title?: string;
};

const MAX_EMBEDS = 2;

/** Recognises video links worth playing in place. */
export function videoEmbedFor(raw: string, title?: string): VideoEmbed | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? /^\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(url.pathname)?.[1] ?? null;
    if (id) return { key: `youtube:${id}`, provider: "youtube", id, url: raw, title };
  }
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0] || null;
    if (id) return { key: `youtube:${id}`, provider: "youtube", id, url: raw, title };
  }
  if (host === "vimeo.com") {
    id = /^\/(\d{6,})/.exec(url.pathname)?.[1] ?? null;
    if (id) return { key: `vimeo:${id}`, provider: "vimeo", id, url: raw, title };
  }
  if (host === "loom.com") {
    id = /^\/share\/([\da-f]{20,})/.exec(url.pathname)?.[1] ?? null;
    if (id) return { key: `loom:${id}`, provider: "loom", id, url: raw, title };
  }
  return null;
}

/**
 * Video links in a reply, capped so a message with many links stays readable.
 * Plain links elsewhere in the text are left as links.
 */
export function collectVideoEmbeds(markdown: string) {
  const embeds = new Map<string, VideoEmbed>();
  const links = [
    ...[...markdown.matchAll(/\[([^\]]{0,200})\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => ({ url: match[2], title: match[1] })),
    ...[...markdown.matchAll(/(?<![(\[])(https?:\/\/[^\s)>\]]+)/g)].map((match) => ({ url: match[1], title: undefined })),
  ];
  for (const link of links) {
    const embed = videoEmbedFor(link.url, link.title);
    if (embed && !embeds.has(embed.key)) embeds.set(embed.key, embed);
    if (embeds.size >= MAX_EMBEDS) break;
  }
  return [...embeds.values()];
}

function playerUrl(embed: VideoEmbed) {
  if (embed.provider === "youtube") return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(embed.id)}?autoplay=1&rel=0`;
  if (embed.provider === "vimeo") return `https://player.vimeo.com/video/${encodeURIComponent(embed.id)}?autoplay=1`;
  return `https://www.loom.com/embed/${encodeURIComponent(embed.id)}?autoplay=1`;
}

/** A thumbnail card that becomes the player only when asked. */
export function VideoEmbedCard({ embed }: { embed: VideoEmbed }) {
  const [playing, setPlaying] = useState(false);
  const thumbnail = embed.provider === "youtube" ? `https://i.ytimg.com/vi/${encodeURIComponent(embed.id)}/hqdefault.jpg` : null;
  const label = embed.title && !/^https?:/.test(embed.title) ? embed.title : embed.provider === "youtube" ? "YouTube video" : embed.provider === "vimeo" ? "Vimeo video" : "Loom video";
  return (
    <div className="not-prose my-2 w-full max-w-[480px] overflow-hidden rounded-xl border border-border bg-background">
      <div className="relative aspect-video w-full bg-stone-900">
        {playing ? (
          <iframe
            src={playerUrl(embed)}
            title={label}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 flex items-center justify-center" aria-label={`Play ${label}`}>
            {thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" loading="lazy" />
            )}
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-transform group-hover:scale-105">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </button>
        )}
      </div>
      <a href={embed.url} target="_blank" rel="noopener noreferrer" className="block truncate px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
        {label}
      </a>
    </div>
  );
}
