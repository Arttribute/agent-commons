/**
 * Utility functions for calculating dynamic grid layouts for space stream cards
 * Inspired by Google Meet and Discord Huddles
 */

export interface GridLayout {
  columns: number;
  rows: number;
  focusedSize?: "full" | "large" | "medium";
}

/**
 * Calculate optimal grid layout based on number of streams
 * Aims to fill the available space efficiently like Google Meet
 */
export function calculateGridLayout(
  streamCount: number,
  isExpanded: boolean = false
): GridLayout {
  if (streamCount === 0) {
    return { columns: 1, rows: 1 };
  }

  if (streamCount === 1) {
    return { columns: 1, rows: 1, focusedSize: "full" };
  }

  if (!isExpanded) {
    // Compact mode: single column
    return { columns: 1, rows: streamCount };
  }

  // Expanded mode: optimize for aspect ratio
  if (streamCount === 2) {
    return { columns: 2, rows: 1 };
  }

  if (streamCount === 3 || streamCount === 4) {
    return { columns: 2, rows: 2 };
  }

  if (streamCount <= 6) {
    return { columns: 3, rows: 2 };
  }

  if (streamCount <= 9) {
    return { columns: 3, rows: 3 };
  }

  if (streamCount <= 12) {
    return { columns: 4, rows: 3 };
  }

  // For larger numbers, use a 4-column grid
  const rows = Math.ceil(streamCount / 4);
  return { columns: 4, rows };
}

/**
 * Determine if a stream should be auto-focused (expanded)
 * Screen shares and URL shares should be prominently displayed
 */
export function shouldAutoFocus(stream: {
  isScreenShare?: boolean;
  isUrlShare?: boolean;
}): boolean {
  return !!(stream.isScreenShare || stream.isUrlShare);
}

/**
 * Sort streams to prioritize screen shares and URL shares
 */
export function sortStreamsByPriority<T extends {
  isScreenShare?: boolean;
  isUrlShare?: boolean;
  isLocal?: boolean;
}>(streams: T[]): T[] {
  return [...streams].sort((a, b) => {
    // URL shares first
    if (a.isUrlShare && !b.isUrlShare) return -1;
    if (!a.isUrlShare && b.isUrlShare) return 1;

    // Screen shares second
    if (a.isScreenShare && !b.isScreenShare) return -1;
    if (!a.isScreenShare && b.isScreenShare) return 1;

    // Local stream last
    if (a.isLocal && !b.isLocal) return 1;
    if (!a.isLocal && b.isLocal) return -1;

    return 0;
  });
}

/**
 * Calculate container class for grid layout
 */
export function getGridContainerClass(layout: GridLayout): string {
  return `grid gap-3 grid-cols-${layout.columns}`;
}

/**
 * Get dynamic grid template columns style
 */
export function getGridStyle(columns: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: "12px",
  };
}
