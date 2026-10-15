import { and, eq, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';

/** Shared by web/desktop lists and suggestions; retain other sources for API/CLI callers. */
export function commonsSessionPredicate(session: Pick<typeof schema.session, 'initiatorType' | 'agentId'>) {
  return and(
    eq(session.initiatorType, 'web'),
    // Historical Arcade/system sessions reference virtual or removed agents.
    // They remain accessible by ID but do not belong in product chat recents.
    sql`exists (select 1 from agent where agent.agent_id = ${session.agentId})`,
  );
}
