import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { container } from "tsyringe";
import * as schema from "../models/schema.js";

const isLambda = Boolean(process.env.LAMBDA_TASK_ROOT);

export class DatabaseService extends PostgresJsDatabase<typeof schema> {}

const queryClient = postgres({
	host: process.env.POSTGRES_HOST || "",
	port: isLambda
		? 6543
		: parseInt(process.env.POSTGRES_PORT || "") || undefined,
	database: process.env.POSTGRES_DATABASE || "",
	user: process.env.POSTGRES_USER || "",
	password: process.env.POSTGRES_PASSWORD || "",
	ssl: false,
	prepare: isLambda ? false : undefined,
});

export const database = drizzle({
	client: queryClient,
	schema,
});

container.register(DatabaseService, {
	useValue: database as unknown as PostgresJsDatabase<typeof schema>,
});
