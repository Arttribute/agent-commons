import { config } from 'dotenv';
config();

process.env.COINBASE_API_KEY_SECRET =
  process.env.COINBASE_API_KEY_SECRET &&
  decodeURIComponent(process.env.COINBASE_API_KEY_SECRET);
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL && decodeURIComponent(process.env.SUPABASE_URL);

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody is required for Stripe webhook signature verification. Default
  // parsers are disabled so the explicit registrations below (with size
  // limits) are the ones that actually run.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  // ApiKeyGuard is registered globally via AuthModule (APP_GUARD provider)

  // Behind CloudFront/gateway/ALB — trust X-Forwarded-For so req.ip is the
  // client address (rate limiting keys on it).
  app.set('trust proxy', true);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );

  // ── Versioning ────────────────────────────────────────────────────────────
  app.enableVersioning({ type: VersioningType.URI });

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Credentials are allowed, so a wildcard origin is never acceptable. In
  // production the allowlist must be explicit; local dev falls back to
  // localhost origins only.
  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!corsOrigins?.length && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CORS_ORIGIN must be set in production (comma-separated origin allowlist)',
    );
  }
  app.enableCors({
    origin: corsOrigins ?? [/^https?:\/\/localhost(:\d+)?$/],
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
