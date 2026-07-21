/**
 * App integration workflow ops (Gmail, Calendar, GitHub, Linear, Notion, …) are
 * defined client-side in the Studio editor (see commons-app app-nodes.ts). Their
 * node `toolId` uses a "service:op" / "app:op" / "mcp:op" form — for example
 * "google:gmail.send" or "app:linear.createIssue" — and they are resolved at
 * execution time by `toolName`, not by a `tool` table row or a static tool id.
 *
 * These ids therefore will not resolve against the DB or static tool catalog,
 * and workflow validation must NOT reject them: doing so drops every node in the
 * graph on save. UUID and static tool ids never contain a colon, so the colon is
 * a reliable discriminator.
 */
export function isAppIntegrationToolId(toolId?: string | null): boolean {
  return typeof toolId === 'string' && toolId.includes(':');
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `tool.toolId` column is a Postgres `uuid`. Comparing it against a
 * non-uuid string (e.g. an app-integration "service:op" id) throws
 * `invalid input syntax for type uuid`, which aborts whatever query it's in —
 * so any lookup that filters on `toolId` MUST guard with this first.
 */
export function isUuid(value?: string | null): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}
