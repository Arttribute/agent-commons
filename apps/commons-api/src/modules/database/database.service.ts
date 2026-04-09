import * as schema from '#/models/schema';
import { FactoryProvider, Injectable } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export interface DatabaseService extends PostgresJsDatabase<typeof schema> {}

@Injectable()
export class DatabaseService {}

export const DatabaseServiceProvider: FactoryProvider<
  PostgresJsDatabase<typeof schema>
> = {
  provide: DatabaseService,
  useFactory: () => {
    const isLambda = Boolean(process.env.LAMBDA_TASK_ROOT);

    const queryClient = postgres({
      host: process.env.POSTGRES_HOST || '',
      port: isLambda
        ? 6543
        : parseInt(process.env.POSTGRES_PORT || '') || undefined,
      database: process.env.POSTGRES_DATABASE || '',
      user: process.env.POSTGRES_USER || '',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: false,
      prepare: isLambda ? false : undefined,
    });

    return drizzle({
      client: queryClient,
      schema,
    });
  },
};
