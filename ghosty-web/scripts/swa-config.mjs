#!/usr/bin/env node
// Gera o staticwebapp.config.json de cada app, depois do build, com as origens reais da nuvem.
//
//   SHELL_ORIGIN=https://<web-main> NOTES_ORIGIN=https://<web-n> SAFETY_ORIGIN=https://<web-s> \
//   API_ORIGIN=https://<apim>.azure-api.net node scripts/swa-config.mjs
//
// - shell: SPA (navigationFallback) e cabeçalhos de segurança (CSP com as origens dos remotes e da API).
// - remotes: CORS só para o shell (o remoteEntry.js e os chunks são módulos carregados de outra origem),
//   e o index.html de desenvolvimento sai do pacote (a raiz do remote responde 404).
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function origin(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta a variável ${name} (ex.: https://exemplo.azurestaticapps.net).`);
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost')
    throw new Error(`${name} precisa ser https.`);
  return url.origin;
}

const shell = origin('SHELL_ORIGIN');
const notes = origin('NOTES_ORIGIN');
const safety = origin('SAFETY_ORIGIN');
const api = origin('API_ORIGIN');

const common = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

const csp = [
  "default-src 'self'",
  `script-src 'self' ${notes} ${safety}`,
  `style-src 'self' 'unsafe-inline' ${notes} ${safety}`,
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${api} ${notes} ${safety}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const configs = {
  shell: {
    navigationFallback: {
      rewrite: '/index.html',
      exclude: ['/assets/*', '/icons/*', '/sw.js', '/manifest.webmanifest', '/favicon.png'],
    },
    routes: [
      { route: '/sw.js', headers: { 'Cache-Control': 'no-cache' } },
      { route: '/index.html', headers: { 'Cache-Control': 'no-cache' } },
    ],
    globalHeaders: {
      ...common,
      'Content-Security-Policy': csp,
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
    },
    mimeTypes: { '.webmanifest': 'application/manifest+json' },
  },
  remote: {
    routes: [{ route: '/remoteEntry.js', headers: { 'Cache-Control': 'no-cache' } }],
    globalHeaders: { ...common, 'Access-Control-Allow-Origin': shell, Vary: 'Origin' },
  },
};

for (const [app, kind] of [
  ['shell', 'shell'],
  ['notes', 'remote'],
  ['safety', 'remote'],
]) {
  const dist = path.join(root, 'apps', app, 'dist');
  if (!existsSync(dist)) throw new Error(`Rode o build antes: falta ${path.relative(root, dist)}.`);
  writeFileSync(path.join(dist, 'staticwebapp.config.json'), `${JSON.stringify(configs[kind], null, 2)}\n`);
  if (kind === 'remote') rmSync(path.join(dist, 'index.html'), { force: true });
  process.stdout.write(`${app}: staticwebapp.config.json gravado\n`);
}
