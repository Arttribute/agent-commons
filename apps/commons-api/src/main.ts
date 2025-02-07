import { config } from 'dotenv';
config();

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
