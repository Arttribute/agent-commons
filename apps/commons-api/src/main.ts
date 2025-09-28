import { config } from 'dotenv';
config();

process.env.COINBASE_API_KEY_SECRET =
  process.env.COINBASE_API_KEY_SECRET &&
  decodeURIComponent(process.env.COINBASE_API_KEY_SECRET);
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL && decodeURIComponent(process.env.SUPABASE_URL);

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableVersioning();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  const address = await app.getUrl();
  console.log(`Listening on: ${address}`);
}
bootstrap();
