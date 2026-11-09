import type { OpenApiOptions } from './platform/openapi.js';

export const OPENAPI: OpenApiOptions = {
  title: 'notes-service',
  version: '0.1.0',
  description: [
    'Microserviço do domínio **Notas** (a fachada do app), com MongoDB.',
    '',
    '- Só é chamado pelo BFF. Toda rota, exceto `/health`, exige `X-Internal-Key`.',
    '- As rotas de notas exigem `X-User-Id`. Uma nota de outra conta responde 404, como se não existisse.',
    '- IDs das notas são o ObjectId do MongoDB em texto; os itens de checklist usam UUID v7.',
    '- Datas em ISO 8601 (UTC). Erros em `application/problem+json` (RFC 9457), com o campo `code`.',
    '- Toda alteração incrementa `version`. O `PUT` exige a versão atual e responde 409 se ela for antiga.',
  ].join('\n'),
  configure: (builder) =>
    builder
      .addServer('http://localhost:3001', 'Máquina local')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Internal-Key' }, 'internalKey'),
};
