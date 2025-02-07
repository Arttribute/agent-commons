import { config } from 'dotenv';
config();

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './models',
  schema: './models/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.POSTGRES_HOST || '',
    port: Number.parseInt(process.env.POSTGRES_PORT || '') || undefined,
    database: process.env.POSTGRES_DATABASE || '',
    user: process.env.POSTGRES_USER || '',
    password: process.env.POSTGRES_PASSWORD || '',
    ssl: false,
  },
});
