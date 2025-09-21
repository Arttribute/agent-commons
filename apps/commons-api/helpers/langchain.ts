import type { RunnableConfig } from "@langchain/core/runnables";
import {
	BaseCheckpointSaver,
	type ChannelVersions,
	type Checkpoint,
	type CheckpointListOptions,
	type CheckpointMetadata,
	type CheckpointTuple,
	type PendingWrite,
	type SerializerProtocol,
	WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

interface PostgresSaverOptions {
	schema: string;
}

export class ChronologicalPostgresSaver extends PostgresSaver {
	/**
	 * Creates a new instance of PostgresSaver from a connection string.
	 *
	 * @param {string} connString - The connection string to connect to the Postgres database.
	 * @param {PostgresSaverOptions} [options] - Optional configuration object.
	 * @returns {PostgresSaver} A new instance of PostgresSaver.
	 *
	 * @example
	 * const connString = "postgresql://user:password@localhost:5432/db";
	 * const checkpointer = PostgresSaver.fromConnString(connString, {
	 *  schema: "custom_schema" // defaults to "public"
	 * });
	 * await checkpointer.setup();
	 */
	static fromConnString(
		connString: string,
		options?: Partial<PostgresSaverOptions>,
	): PostgresSaver {
		const postgresSaver = PostgresSaver.fromConnString(connString);
		return new ChronologicalPostgresSaver(
			// @ts-expect-error
			postgresSaver.pool,
			undefined,
			options,
		);
	}

	static fromParent(parent: PostgresSaver) {
		return new ChronologicalPostgresSaver(
			// @ts-expect-error
			parent.pool,
			undefined,
			// @ts-expect-error
			parent.options,
		);
	}
	/**
	 * List checkpoints from the database.
	 *
	 * This method retrieves a list of checkpoint tuples from the Postgres database based
	 * on the provided config. The checkpoints are ordered by checkpoint ID in descending order (newest first).
	 */
	async *list(
		config: RunnableConfig,
		options?: CheckpointListOptions,
	): AsyncGenerator<CheckpointTuple> {
		const { filter, before, limit } = options ?? {};
		const [where, args] = this._searchWhere(config, filter, before);
		// @ts-expect-error
		let query = `${this.SQL_STATEMENTS.SELECT_SQL}${where} ORDER BY checkpoint_id ASC`;
		if (limit !== undefined) {
			query += ` LIMIT ${Number.parseInt(limit.toString(), 10)}`; // sanitize via parseInt, as limit could be an externally provided value
		}

		// @ts-expect-error
		const result = await this.pool.query(query, args);
		for (const value of result.rows) {
			yield {
				config: {
					configurable: {
						thread_id: value.thread_id,
						checkpoint_ns: value.checkpoint_ns,
						checkpoint_id: value.checkpoint_id,
					},
				},
				checkpoint: await this._loadCheckpoint(
					value.checkpoint,
					value.channel_values,
				),
				metadata: await this._loadMetadata(value.metadata),
				parentConfig: value.parent_checkpoint_id
					? {
							configurable: {
								thread_id: value.thread_id,
								checkpoint_ns: value.checkpoint_ns,
								checkpoint_id: value.parent_checkpoint_id,
							},
						}
					: undefined,
				pendingWrites: await this._loadWrites(value.pending_writes),
			};
		}
	}
}

export const postgresCheckpointer = PostgresSaver.fromConnString(
	`postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`,
);

export const chronologicalPostgresCheckpointer =
	ChronologicalPostgresSaver.fromParent(postgresCheckpointer);
