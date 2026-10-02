"use client";

import { useParams } from "next/navigation";
import { CanvasViewer } from "@/components/canvas/canvas-viewer";
import { LibraryNavToggle } from "@/components/library/library-nav-toggle";

export default function LibraryItemPage() {
  const { itemId } = useParams() as { itemId: string };
  return <CanvasViewer itemId={decodeURIComponent(itemId)} leading={<LibraryNavToggle />} />;
}
