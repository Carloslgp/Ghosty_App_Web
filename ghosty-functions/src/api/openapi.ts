import { app, type HttpResponseInit } from '@azure/functions';
import document from './openapi/functions.openapi.json' with { type: 'json' };

/** Versão fixa do Swagger UI (carregado da CDN só nesta página de documentação). */
const SWAGGER_UI = 'https://unpkg.com/swagger-ui-dist@5.34.1';

/**
 * O contrato convertido. Na nuvem, o Swagger mostra só o endereço público da Function App
 * (`OPENAPI_SERVER_URL`, sem `/api`), e não o localhost do contrato.
 */
export function openApiJson(serverUrl = process.env.OPENAPI_SERVER_URL ?? ''): HttpResponseInit {
  const url = serverUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/.test(url)) return { status: 200, jsonBody: document };
  return { status: 200, jsonBody: { ...document, servers: [{ url, description: 'Azure Functions' }] } };
}

export function swaggerUi(): HttpResponseInit {
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Functions · Swagger</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
    <script>window.ui = SwaggerUIBundle({ url: 'openapi.json', dom_id: '#swagger-ui' });</script>
  </body>
</html>`;
  return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: html };
}

// Anônimas: só documentação.
app.http('openapi', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'openapi.json',
  handler: () => openApiJson(),
});
app.http('docs', { methods: ['GET'], authLevel: 'anonymous', route: 'docs', handler: () => swaggerUi() });
