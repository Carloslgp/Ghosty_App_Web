// Converte o contrato da Function (ghosty-docs/contracts/functions.openapi.yaml) no JSON servido em
// /api/openapi.json. Rode depois de mudar o contrato: npm run openapi:sync
// Um teste falha se o JSON estiver diferente do contrato.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';

const source = new URL('../../ghosty-docs/contracts/functions.openapi.yaml', import.meta.url);
const target = new URL('../src/api/openapi/functions.openapi.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(parse(readFileSync(source, 'utf8')), null, 2)}\n`);
process.stdout.write('OpenAPI da Function atualizado a partir do contrato.\n');
