import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseService } from '~/modules/database';

const MIGRATION_ID = '2026-07-10-persistent-agent-computers';

@Injectable()
export class ComputerMigrationService implements OnModuleInit {
  private readonly logger = new Logger(ComputerMigrationService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    const client = (this.db as any).$client;
    if (!client?.begin) {
      throw new Error('Postgres migration client is unavailable');
    }

    const migrationPath = [
      join(process.cwd(), 'migrations', 'persistent-agent-computers.sql'),
      join(
        process.cwd(),
        'apps',
        'commons-api',
        'migrations',
        'persistent-agent-computers.sql',
      ),
    ].find(existsSync);
    if (!migrationPath) {
      throw new Error('Persistent computer migration SQL is missing');
    }
    const statements = readFileSync(migrationPath, 'utf8')
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    await client.begin(async (tx: any) => {
      await tx.unsafe(`
        CREATE TABLE IF NOT EXISTS app_schema_migration (
          migration_id text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT timezone('utc', now())
        )
      `);
      await tx`SELECT pg_advisory_xact_lock(hashtext(${MIGRATION_ID}))`;
      const applied = await tx`
        SELECT migration_id
        FROM app_schema_migration
        WHERE migration_id = ${MIGRATION_ID}
      `;
      if (applied.length > 0) return;

      for (const statement of statements) {
        await tx.unsafe(statement);
      }
      await tx`
        INSERT INTO app_schema_migration (migration_id)
        VALUES (${MIGRATION_ID})
      `;
      this.logger.log(`Applied database migration ${MIGRATION_ID}`);
    });
  }
}
