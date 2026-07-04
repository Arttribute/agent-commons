/**
 * Classic calendar overlap layout: groups events into clusters of mutually
 * overlapping intervals, assigns each a column within its cluster (reusing
 * columns once they free up), and reports the cluster's total column count
 * so callers can render `width: 100 / columnCount`.
 */
export function layoutOverlappingEvents<T extends { start: Date; end: Date }>(
  events: T[],
): Array<T & { column: number; columnCount: number }> {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const result: Array<T & { column: number; columnCount: number }> = [];

  let cluster: Array<T & { column: number }> = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const columnCount = columnEnds.length;
    for (const item of cluster) result.push({ ...item, columnCount });
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    const startMs = ev.start.getTime();
    if (startMs >= clusterEnd) flush();

    let column = columnEnds.findIndex((end) => end <= startMs);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(ev.end.getTime());
    } else {
      columnEnds[column] = ev.end.getTime();
    }

    cluster.push({ ...ev, column });
    clusterEnd = Math.max(clusterEnd, ev.end.getTime());
  }
  flush();

  return result;
}
