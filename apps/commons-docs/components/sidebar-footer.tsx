/**
 * The one thing every reader eventually needs, parked where it is always in
 * reach. One line, so it never competes with the page tree above it.
 */
export function SidebarFooter() {
  return (
    <code className="block select-all truncate rounded-md border border-fd-border bg-fd-muted/70 px-2 py-1.5 font-mono text-[11px] text-fd-muted-foreground">
      npm i -g @agent-commons/cli
    </code>
  );
}
