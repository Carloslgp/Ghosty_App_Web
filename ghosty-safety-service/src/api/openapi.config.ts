import type { OpenApiOptions } from './platform/openapi.js';

export const OPENAPI: OpenApiOptions = {
  title: 'safety-service',
  version: '0.1.0',
  description: [
    'Microserviço do domínio **Conta e Rede de apoio**, com Azure SQL (SQLite na máquina local).',
    '',
    '- Chamado pelo BFF e pela Function. Toda rota, exceto `/health`, exige `X-Internal-Key`.',
    '- As rotas da pessoa usuária exigem `X-User-Id`. Um recurso de outra conta responde 404.',
    '- IDs em UUID v7. Datas em ISO 8601 (UTC). Erros em `application/problem+json` (RFC 9457), com `code`.',
    '- Código secreto errado e conta bloqueada recebem **a mesma resposta** (401). Depois de 5 erros, a',
    '  verificação fica bloqueada por 15 minutos.',
    '- Apelidos, chats do Telegram, modelo da mensagem, destino do check-in, localização e textos dos',
    '  avisos ficam cifrados no banco (AES-256-GCM). Não existe telefone.',
  ].join('\n'),
  configure: (builder) =>
    builder
      .addServer('http://localhost:3002', 'Máquina local')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Internal-Key' }, 'internalKey'),
};
