import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

export interface HttpSetupOptions {
  corsOrigins: string[];
  trustProxyHops: number;
}

/**
 * Cabeçalhos de segurança (`helmet`), CORS só para as origens do front e quantos proxies confiar
 * (o IP certo para o limite de taxa). Na Azure, o CORS também é feito pelo APIM.
 */
export function configureHttp(app: INestApplication, options: HttpSetupOptions): void {
  const express = app as NestExpressApplication;
  if (options.trustProxyHops > 0) express.set('trust proxy', options.trustProxyHops);
  // O Swagger UI precisa de scripts inline; o BFF só devolve JSON, então a CSP estrita fica no front.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.enableCors({
    origin: options.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Safety-Token',
      'X-Correlation-Id',
      'Idempotency-Key',
      'Ocp-Apim-Subscription-Key',
    ],
    exposedHeaders: ['X-Correlation-Id', 'Location', 'Retry-After'],
    credentials: false,
    maxAge: 600,
  });
}
