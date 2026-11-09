import { app } from '@azure/functions';
import { CalculateReadinessHandler } from '../application/features/calculate-readiness/calculate-readiness.handler.js';
import { jsonHandler } from './shared/http.js';
import { systemClock } from './shared/runtime.js';
import { readinessRequestSchema } from './shared/schemas.js';

const handler = new CalculateReadinessHandler(systemClock);

/** `POST /api/readiness`: pontuação de prontidão, itens com recomendação e prévia da mensagem. */
export const readiness = jsonHandler(readinessRequestSchema, (input) => handler.execute(input));

app.http('readiness', { methods: ['POST'], authLevel: 'function', route: 'readiness', handler: readiness });
