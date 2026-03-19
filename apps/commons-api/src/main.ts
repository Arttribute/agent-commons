import { config } from 'dotenv';
config();

process.env.COINBASE_API_KEY_SECRET =
  process.env.COINBASE_API_KEY_SECRET &&
  decodeURIComponent(process.env.COINBASE_API_KEY_SECRET);
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL && decodeURIComponent(process.env.SUPABASE_URL);

import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ApiKeyGuard is registered globally via AuthModule (APP_GUARD provider)

  // ── Versioning ────────────────────────────────────────────────────────────
  app.enableVersioning({ type: VersioningType.URI });

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-initiator',
      'x-agent-id',
      'Cache-Control',
    ],
    credentials: true,
  });

  // ── SSE / streaming headers via global middleware ─────────────────────────
  // Disables proxy buffering for SSE endpoints so tokens reach the client
  // immediately rather than being held in a proxy buffer.
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Accel-Buffering', 'no');
    next();
  });

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Agent Commons API')
      .setDescription(
        'Agent Commons platform API — agents, workflows, tasks, tools, MCP, OAuth',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-initiator', in: 'header' }, 'initiator')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  const address = await app.getUrl();
  console.log(`Listening on: ${address}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger docs: ${address}/docs`);
  }
}

bootstrap();
