import { config } from 'dotenv';
config();

process.env.COINBASE_API_KEY_SECRET =
  process.env.COINBASE_API_KEY_SECRET &&
  decodeURIComponent(process.env.COINBASE_API_KEY_SECRET);
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL && decodeURI(process.env.SUPABASE_URL);

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableVersioning();

  const port = process.env.PORT ?? 3001;
  console.log(`Listening on port: ${port}`);
  await app.listen(port);
}
bootstrap();
