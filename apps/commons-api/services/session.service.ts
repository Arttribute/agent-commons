import * as schema from "../models/schema.js";
import { HTTPException } from "hono/http-exception";
import { eq, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { first } from "lodash-es";
import { database as db } from "./database.service.js";

export class SessionService {
  public async createSession(props: {
    value: InferInsertModel<typeof schema.session>;
  }) {
    const { value } = props;
    const sessionEntry = await db
      .insert(schema.session)
      .values(value)
      .returning()
      .then(first<InferSelectModel<typeof schema.session>>);

    if (!sessionEntry) {
      throw new HTTPException(500, { message: "Failed to create session" });
    }
    return sessionEntry;
  }

  public async getSession(props: { id: string }) {
    const { id } = props;

    const sessionEntry = await db.query.session.findFirst({
      where: (t) => eq(t.sessionId, id),
    });
    return sessionEntry;
  }

  public async updateSession(props: {
    id: string;
    delta: Partial<InferInsertModel<typeof schema.session>>;
  }) {
    const { id, delta } = props;
    const sessionEntry = await db
      .update(schema.session)
      .set(delta)
      .where(eq(schema.session.sessionId, id))
      .returning();
    return sessionEntry;
  }
}

export const sessionService = new SessionService();
