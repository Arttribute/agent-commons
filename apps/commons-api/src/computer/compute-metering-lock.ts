import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';

/** Metering holds its lock while credit services use the application pool.
 * A separate, bounded pool prevents waiting lock holders from exhausting the
 * connections that the running action needs to finish and release its lock.
 */
export class ComputeMeteringLock implements OnModuleDestroy {
  private readonly logger = new Logger(ComputeMeteringLock.name);
  private readonly pool: Pool;

  constructor(options: PoolConfig = {}) {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DATABASE,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      ssl: process.env.POSTGRES_SSL === 'require'
        ? { rejectUnauthorized: false }
        : undefined,
      ...options,
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: 'commons-compute-locks',
    });
    this.pool.on('error', (error) =>
      this.logger.error(`Idle metering lock connection failed: ${error.message}`),
    );
  }

  async withInstanceLock<T>(
    computerId: string,
    action: () => Promise<T>,
    skipIfBusy = false,
  ): Promise<T | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      if (skipIfBusy) {
        const { rows } = await client.query(
          'select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked',
          [computerId],
        );
        if (!rows[0]?.locked) {
          await client.query('ROLLBACK');
          return;
        }
      } else {
        await client.query(
          'select pg_advisory_xact_lock(hashtextextended($1, 0))',
          [computerId],
        );
      }
      const result = await action();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
