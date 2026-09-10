import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';

class ObservedPostgresSaver extends PostgresSaver {
  override putWrites(...args: Parameters<PostgresSaver['putWrites']>) {
    const pending = super.putWrites(...args);
    // LangGraph queues this promise and awaits it later. Handle a fast rejection
    // now, while returning the original promise so the graph still fails.
    void pending.catch(() => {});
    return pending;
  }
}

/** One bounded pool per API process, shared by every conversation thread.
 * Creating a saver per model turn leaked a new pool for each Arcade move.
 */
export class AgentCheckpointStore {
  readonly pool: Pool;
  readonly saver: PostgresSaver;

  constructor(reportError: (message: string) => void) {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DATABASE,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      max: 2,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      application_name: 'commons-agent-checkpoints',
      options: '-c search_path=public',
      ssl:
        process.env.POSTGRES_SSL === 'require'
          ? { rejectUnauthorized: false }
          : undefined,
    });
    // pg emits connection failures on idle clients outside query promises.
    this.pool.on('error', (error) =>
      reportError(`Idle checkpoint connection failed: ${error.message}`),
    );
    this.saver = new ObservedPostgresSaver(this.pool);
  }

  async close() {
    await this.pool.end();
  }
}
