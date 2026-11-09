import type { OpenApiOptions } from './platform/openapi.js';

export const OPENAPI: OpenApiOptions = {
  title: 'ghosty-bff',
  version: '0.1.0',
  description: [
    'Backend for Frontend do Ghosty: o único backend que o front chama, sempre pelo API Management.',
    '',
    '- `Authorization: Bearer <jwt>`: JWT de acesso (RS256, 15 minutos, `aud` = `notes-web`).',
    '- `X-Safety-Token`: sessão segura (`scope=safety`), exigida em toda rota `/safety/...` (exceto `/safety/session`).',
    '- `401` = sessão inválida (renove o JWT e repita uma vez). `403` na área de segurança = saída rápida.',
    '- `POST /safety/session` com código errado ou conta bloqueada responde `403`, sempre igual.',
    '- `429` traz `Retry-After`. `503` indica um serviço interno fora do ar.',
    '- Erros em `application/problem+json` (RFC 9457) com `code`; `X-Correlation-Id` em todas as respostas.',
  ].join('\n'),
  configure: (builder) =>
    builder
      .addServer('http://localhost:3000', 'Máquina local')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Safety-Token' }, 'safetyToken'),
};
