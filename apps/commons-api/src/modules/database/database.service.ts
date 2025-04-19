import * as schema from '#/models/schema';
import { FactoryProvider, Injectable } from '@nestjs/common';
import { PgTableWithColumns, PgColumn } from 'drizzle-orm/pg-core';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export interface DatabaseService extends PostgresJsDatabase<typeof schema> {}

@Injectable()
export class DatabaseService {
  from(
    taskDependency: PgTableWithColumns<{
      name: 'task_dependency';
      schema: undefined;
      columns: {
        id: PgColumn<
          {
            name: 'id';
            tableName: 'task_dependency';
            dataType: 'string';
            columnType: 'PgUUID';
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
        dependentTaskId: PgColumn<
          {
            name: 'dependent_task_id';
            tableName: 'task_dependency';
            dataType: 'string';
            columnType: 'PgUUID';
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
        dependencyTaskId: PgColumn<
          {
            name: 'dependency_task_id';
            tableName: 'task_dependency';
            dataType: 'string';
            columnType: 'PgUUID';
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
        dependencyType: PgColumn<
          {
            name: 'dependency_type';
            tableName: 'task_dependency';
            dataType: 'string';
            columnType: 'PgText';
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
        createdAt: PgColumn<
          {
            name: 'created_at';
            tableName: 'task_dependency';
            dataType: 'date';
            columnType: 'PgTimestamp';
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
          },
          {},
          {}
        >;
      };
      dialect: 'pg';
    }>,
  ) {
    throw new Error('Method not implemented.');
  }
  fn: any;
}

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
