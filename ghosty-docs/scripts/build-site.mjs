#!/usr/bin/env node
// Gera o site de documentação (Static Web App "web-docs"): a página de links da entrega, um Swagger UI
// para cada API (os contratos e o OpenAPI exportado do API Management) e os eventos (AsyncAPI).
//
//   npm run asyncapi:html        # opcional: HTML navegável dos eventos em site/events
//   FRONT_URL=... GATEWAY_URL=... BFF_URL=... NOTES_URL=... SAFETY_URL=... FUNCTIONS_URL=... \
//   APIM_EXPORTS=<pasta com apim-*.json> DOCKERHUB_USER=... VIDEO_URL=... REPO_URL=... npm run site:build
//
// Todas as variáveis são opcionais: o que faltar aparece como "—" na página.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.resolve(process.env.SITE_DIR ?? path.join(docs, 'site'));
const env = (name) => (process.env[name] ?? '').replace(/\/+$/, '');
/** Versão fixa do Swagger UI (a mesma da página /api/docs da Function). */
const SWAGGER_UI = 'https://unpkg.com/swagger-ui-dist@5.34.1';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

mkdirSync(path.join(site, 'openapi'), { recursive: true });
mkdirSync(path.join(site, 'events'), { recursive: true });

// ---------------------------------------------------------------- especificações

/** nome do arquivo → título exibido. */
const specs = [];
for (const [file, title] of [
  ['bff', 'BFF (contrato)'],
  ['notes-service', 'notes-service (contrato)'],
  ['safety-service', 'safety-service (contrato)'],
  ['functions', 'Azure Functions (contrato)'],
]) {
  const document = parse(readFileSync(path.join(docs, 'contracts', `${file}.openapi.yaml`), 'utf8'));
  writeFileSync(
    path.join(site, 'openapi', `contract-${file}.json`),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  specs.push({ id: `contract-${file}`, title });
}

const exports = process.env.APIM_EXPORTS;
if (exports && existsSync(exports)) {
  for (const file of readdirSync(exports)
    .filter((name) => /^apim-[a-z-]+\.json$/.test(name))
    .sort()) {
    const raw = JSON.parse(readFileSync(path.join(exports, file), 'utf8'));
    // A exportação do APIM pode vir como texto ou como objeto.
    const document = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const id = file.replace(/\.json$/, '');
    writeFileSync(path.join(site, 'openapi', `${id}.json`), `${JSON.stringify(document, null, 2)}\n`);
    specs.push({ id, title: `API Gateway: ${id.replace(/^apim-/, '')}` });
  }
}

const style = `
  :root { color-scheme: light dark; --bg: #f7f6f3; --fg: #1f2328; --muted: #57606a; --card: #fff; --line: #d0d7de; --link: #0b5cad; }
  @media (prefers-color-scheme: dark) { :root { --bg: #16181c; --fg: #e6e6e6; --muted: #a0a7b0; --card: #1f2227; --line: #343a42; --link: #7ab7ff; } }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); }
  main { max-width: 880px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; } h2 { font-size: 1.15rem; margin: 32px 0 8px; }
  p.lead { color: var(--muted); margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; } th { width: 34%; font-weight: 600; }
  a { color: var(--link); word-break: break-all; } .muted { color: var(--muted); }
`;

const link = (url, label = url) =>
  url ? `<a href="${escape(url)}">${escape(label)}</a>` : '<span class="muted">—</span>';
const row = (label, value) => `<tr><th>${escape(label)}</th><td>${value}</td></tr>`;

// ---------------------------------------------------------------- Swagger UI

const allowed = JSON.stringify(Object.fromEntries(specs.map((spec) => [spec.id, spec.title])));
writeFileSync(
  path.join(site, 'swagger.html'),
  `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Swagger</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <p style="font: 14px system-ui; margin: 12px 16px"><a href="./">← Voltar aos links</a></p>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      // Só abre as especificações publicadas aqui (o parâmetro não aceita URLs de fora).
      const specs = ${allowed};
      const id = new URLSearchParams(location.search).get('spec');
      const chosen = Object.hasOwn(specs, id) ? id : Object.keys(specs)[0];
      document.title = specs[chosen] + ' · Swagger';
      window.ui = SwaggerUIBundle({ url: 'openapi/' + chosen + '.json', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>
`,
);

// ---------------------------------------------------------------- eventos

copyFileSync(path.join(docs, 'asyncapi', 'asyncapi.yaml'), path.join(site, 'events', 'asyncapi.yaml'));
mkdirSync(path.join(site, 'events', 'schemas'), { recursive: true });
for (const file of readdirSync(path.join(docs, 'asyncapi', 'schemas'))) {
  copyFileSync(path.join(docs, 'asyncapi', 'schemas', file), path.join(site, 'events', 'schemas', file));
}
const eventsHtml = path.join(site, 'events', 'index.html');
const hasGeneratedEvents = existsSync(eventsHtml) && readFileSync(eventsHtml, 'utf8').includes('asyncapi');
if (!hasGeneratedEvents) {
  // Sem o HTML do gerador oficial: a especificação abre no AsyncAPI Studio.
  writeFileSync(
    eventsHtml,
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" /><title>Eventos (AsyncAPI)</title><style>${style}</style></head><body><main>
<h1>Eventos (AsyncAPI 3.0)</h1><p class="lead">As 3 filas do Azure Storage, as mensagens e quem publica e consome cada uma.</p>
<p><a id="studio" href="#">Abrir no AsyncAPI Studio</a> · <a href="asyncapi.yaml">asyncapi.yaml</a></p>
<p>JSON Schemas: ${readdirSync(path.join(docs, 'asyncapi', 'schemas'))
      .map((file) => `<a href="schemas/${escape(file)}">${escape(file)}</a>`)
      .join(' · ')}</p>
<script>document.getElementById('studio').href = 'https://studio.asyncapi.com/?url=' + encodeURIComponent(new URL('asyncapi.yaml', location.href));</script>
<p><a href="../">← Voltar aos links</a></p></main></body></html>
`,
  );
}

// ---------------------------------------------------------------- página de links

const front = env('FRONT_URL');
const gateway = env('GATEWAY_URL');
const swaggerRows = specs.map((spec) =>
  row(`Swagger: ${spec.title}`, link(`swagger.html?spec=${spec.id}`, 'abrir')),
);
const dockerHub = process.env.DOCKERHUB_USER ? `https://hub.docker.com/u/${process.env.DOCKERHUB_USER}` : '';
const service = (name) => (env(name) ? `${env(name)}/docs` : '');

writeFileSync(
  path.join(site, 'index.html'),
  `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Documentação da entrega</title>
    <style>${style}</style>
  </head>
  <body>
    <main>
      <h1>Ghosty: documentação da entrega</h1>
      <p class="lead">Projeto acadêmico de Soluções Cloud. Links do ambiente na Azure, Swaggers e eventos.</p>
      <h2>Aplicação</h2>
      <table>
        ${row('Frontend (shell)', link(front))}
        ${row('API Gateway (API Management)', link(gateway))}
        ${row('Repositório', link(env('REPO_URL')))}
        ${row('Imagens no Docker Hub', link(dockerHub))}
        ${row('Vídeo', link(env('VIDEO_URL')))}
      </table>
      <h2>Swagger</h2>
      <table>
        ${swaggerRows.join('\n        ')}
        ${row('Swagger ao vivo: BFF', link(service('BFF_URL')))}
        ${row('Swagger ao vivo: notes-service', link(service('NOTES_URL')))}
        ${row('Swagger ao vivo: safety-service', link(service('SAFETY_URL')))}
        ${row('Swagger ao vivo: Azure Functions', link(env('FUNCTIONS_URL') ? `${env('FUNCTIONS_URL')}/api/docs` : ''))}
      </table>
      <h2>Eventos</h2>
      <table>
        ${row('AsyncAPI ("Swagger" dos eventos)', link('events/', 'abrir'))}
        ${row('Especificação', link('events/asyncapi.yaml', 'asyncapi.yaml'))}
      </table>
      <p class="muted">Gerado em ${new Date().toISOString().slice(0, 10)}.</p>
    </main>
  </body>
</html>
`,
);

writeFileSync(
  path.join(site, 'staticwebapp.config.json'),
  `${JSON.stringify(
    {
      routes: [{ route: '/events/asyncapi.yaml', headers: { 'Access-Control-Allow-Origin': '*' } }],
      globalHeaders: {
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
        'Referrer-Policy': 'no-referrer',
      },
      mimeTypes: { '.yaml': 'text/yaml' },
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `Site gerado em ${path.relative(process.cwd(), site) || site}: ${specs.length} especificações.\n`,
);
