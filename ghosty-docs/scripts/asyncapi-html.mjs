#!/usr/bin/env node
// Gera o HTML navegável dos eventos (AsyncAPI) em site/events, com o gerador oficial baixado na hora
// pelo npx, em versões fixas. A especificação é copiada antes para uma pasta temporária: o gerador não
// resolve os $ref relativos quando o caminho tem espaços.
//
//   npm run asyncapi:html
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = '@asyncapi/cli@6.2.1';
const TEMPLATE = '@asyncapi/html-template@3.5.6';

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(path.resolve(process.env.SITE_DIR ?? path.join(docs, 'site')), 'events');
const work = mkdtempSync(path.join(tmpdir(), 'asyncapi-'));
try {
  cpSync(path.join(docs, 'asyncapi'), path.join(work, 'spec'), { recursive: true });
  const result = spawnSync(
    'npx',
    [
      '--yes',
      CLI,
      'generate',
      'fromTemplate',
      path.join(work, 'spec', 'asyncapi.yaml'),
      TEMPLATE,
      '-o',
      path.join(work, 'out'),
      '--force-write',
    ],
    { stdio: 'inherit', env: { ...process.env, SUPPRESS_NO_CONFIG_WARNING: 'true' } },
  );
  if (result.status !== 0) throw new Error('O gerador do AsyncAPI falhou (veja acima).');
  mkdirSync(target, { recursive: true });
  cpSync(path.join(work, 'out'), target, { recursive: true });
  process.stdout.write(`HTML dos eventos gerado em ${path.relative(process.cwd(), target) || target}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
