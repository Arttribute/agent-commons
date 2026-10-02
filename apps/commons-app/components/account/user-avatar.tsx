"use client";

import { useEffect, useState } from "react";
import RandomPixelAvatar from "@/components/account/random-avatar";
import { cn } from "@/lib/utils";

/**
 * The account's picture, or a generated placeholder when there is none or it
 * cannot load. Local mode has no cloud session, so a synced picture that needs
 * one, or whose link has expired, must not leave a broken image.
 */
export function UserAvatar({
  image,
  seed,
  size,
  alt = "",
  className,
}: {
  image?: string | null;
  seed: string;
  size: number;
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);

  if (!image || failed) {
    return <RandomPixelAvatar username={seed || "account"} size={size} />;
  }
  return (
    <img
      src={image}
      alt={alt}
      className={cn("object-cover", className)}
      style={{ width: size, height: size }}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
