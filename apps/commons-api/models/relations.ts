import { relations } from 'drizzle-orm/relations';
import { space, spaceMember, spaceMessage, session } from './schema';

// Space relations
export const spaceRelations = relations(space, ({ many, one }) => ({
  members: many(spaceMember),
  messages: many(spaceMessage),
  session: one(session, {
    fields: [space.sessionId],
    references: [session.sessionId],
  }),
}));

// Space member relations
export const spaceMemberRelations = relations(spaceMember, ({ one }) => ({
  space: one(space, {
    fields: [spaceMember.spaceId],
    references: [space.spaceId],
  }),
}));

// Space message relations
export const spaceMessageRelations = relations(spaceMessage, ({ one }) => ({
  space: one(space, {
    fields: [spaceMessage.spaceId],
    references: [space.spaceId],
  }),
}));

// Session relations (extend existing if needed)
export const sessionRelations = relations(session, ({ many }) => ({
  spaces: many(space),
}));
