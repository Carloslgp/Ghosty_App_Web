#!/usr/bin/env node
// Cria (ou atualiza a senha de) o usuário da aplicação no banco "safety" do Azure SQL, com privilégio
// mínimo: só lê e grava (db_datareader + db_datawriter). Roda com o usuário admin, da máquina de quem
// administra. Usa o driver mssql que já vem no ghosty-safety-service.
//
//   MSSQL_HOST=<servidor>.database.windows.net MSSQL_ADMIN_USER=sqladmin MSSQL_ADMIN_PASSWORD=... \
//   APP_USER=app_safety APP_PASSWORD=... node ghosty-docs/infra/sql-setup.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'ghosty-safety-service', 'package.json'));
const sql = require('mssql');

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta a variável ${name}.`);
  return value;
};

const user = env('APP_USER');
const password = env('APP_PASSWORD');
// O nome e a senha entram no comando T-SQL (CREATE USER não aceita parâmetros): só letras e dígitos.
if (!/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(user)) throw new Error('APP_USER fora do formato.');
if (!/^[A-Za-z0-9]{16,128}$/.test(password))
  throw new Error('APP_PASSWORD precisa ter 16+ letras e dígitos.');

const pool = await sql.connect({
  server: env('MSSQL_HOST'),
  database: process.env.MSSQL_DATABASE ?? 'safety',
  user: env('MSSQL_ADMIN_USER'),
  password: env('MSSQL_ADMIN_PASSWORD'),
  options: { encrypt: true, trustServerCertificate: false },
  // O banco gratuito pausa sem uso e leva até 1 minuto para voltar.
  connectionTimeout: 90_000,
  requestTimeout: 60_000,
});
try {
  const found = await pool
    .request()
    .input('name', sql.NVarChar, user)
    .query('SELECT 1 AS found FROM sys.database_principals WHERE name = @name');
  if (found.recordset.length === 0) {
    await pool.request().batch(`CREATE USER [${user}] WITH PASSWORD = '${password}'`);
    process.stdout.write(`Usuário ${user} criado.\n`);
  } else {
    await pool.request().batch(`ALTER USER [${user}] WITH PASSWORD = '${password}'`);
    process.stdout.write(`Usuário ${user} já existia: senha atualizada.\n`);
  }
  await pool
    .request()
    .batch(`ALTER ROLE db_datareader ADD MEMBER [${user}]; ALTER ROLE db_datawriter ADD MEMBER [${user}];`);
  process.stdout.write(`${user}: db_datareader e db_datawriter (sem DDL).\n`);
} finally {
  await pool.close();
}
