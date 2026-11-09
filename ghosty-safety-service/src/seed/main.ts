import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { loadEnv, type Env } from '../infrastructure/config/env.js';
import { createDataSource } from '../infrastructure/persistence/data-source.js';
import { TypeOrmUnitOfWork } from '../infrastructure/persistence/typeorm.unit-of-work.js';
import { AesGcmFieldCipher } from '../infrastructure/security/aes-gcm.field-cipher.js';
import { Argon2PasswordHasher } from '../infrastructure/security/argon2.password-hasher.js';
import { RandomOpaqueTokens } from '../infrastructure/security/opaque-tokens.js';
import { SystemClock } from '../infrastructure/system/system-clock.js';
import { UuidV7Generator } from '../infrastructure/system/uuid-id-generator.js';
import { resetDemo, seedDemo } from './demo-seed.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(message: string): never {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

/** Lê as variáveis `DEMO_*` do `.env`, sem mostrar valores nas mensagens de erro. */
function demoParams(needsSecrets: boolean) {
  const accountId = (process.env.DEMO_ACCOUNT_ID ?? '').toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? '';
  const lockCode = process.env.DEMO_LOCK_CODE ?? '';
  const telegramChatId = process.env.DEMO_TELEGRAM_CHAT_ID || undefined;
  const problems: string[] = [];
  if (!UUID.test(accountId)) problems.push('DEMO_ACCOUNT_ID: precisa ser um UUID (o mesmo no notes-service)');
  if (needsSecrets) {
    if (password.length < 8 || password.length > 128) problems.push('DEMO_PASSWORD: de 8 a 128 caracteres');
    if (!/^[0-9]{6,8}$/.test(lockCode)) problems.push('DEMO_LOCK_CODE: de 6 a 8 dígitos');
    if (telegramChatId && !/^-?[0-9]{1,20}$/.test(telegramChatId))
      problems.push('DEMO_TELEGRAM_CHAT_ID: só dígitos (o chat de quem fará o papel da Ana)');
  }
  if (problems.length > 0)
    fail(`Variáveis do seed inválidas no .env:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  return { accountId, password, lockCode, telegramChatId };
}

/**
 * `npm run seed:demo` cria (ou recria) a conta de demonstração; `npm run seed:reset` apaga só ela.
 * Usa o mesmo `.env` do serviço: na máquina local grava no SQLite, e com `DB_PROVIDER=mssql` grava no
 * Azure SQL (é assim que os dados do vídeo são preparados na nuvem).
 */
async function main(): Promise<void> {
  const command = process.argv[2] ?? 'demo';
  if (command !== 'demo' && command !== 'reset') fail('Use: seed demo | seed reset');
  if (existsSync('.env')) process.loadEnvFile('.env');

  let env: Env;
  try {
    env = loadEnv();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const params = demoParams(command === 'demo');

  const { dataSource, schemas } = createDataSource(
    env.DB_PROVIDER === 'sqlite'
      ? { provider: 'sqlite', sqlitePath: env.SQLITE_PATH }
      : {
          provider: 'mssql',
          mssql: {
            host: env.MSSQL_HOST,
            port: env.MSSQL_PORT,
            database: env.MSSQL_DATABASE,
            user: env.MSSQL_USER,
            password: env.MSSQL_PASSWORD,
          },
        },
  );
  await dataSource.initialize();
  try {
    const uow = new TypeOrmUnitOfWork(
      dataSource,
      schemas,
      new AesGcmFieldCipher(env.DATA_ENCRYPTION_KEY),
      env.DB_PROVIDER === 'sqlite',
    );
    if (command === 'reset') {
      const found = await resetDemo(uow, params.accountId);
      process.stdout.write(found ? 'Conta de demonstração apagada.\n' : 'Não havia conta de demonstração.\n');
      return;
    }

    const result = await seedDemo(
      {
        uow,
        hasher: new Argon2PasswordHasher(),
        tokens: new RandomOpaqueTokens(),
        clock: new SystemClock(),
        ids: new UuidV7Generator(),
        config: {
          codeLock: { maxAttempts: env.CODE_MAX_ATTEMPTS, lockMinutes: env.CODE_LOCK_MINUTES },
          inviteTtlHours: env.INVITE_TTL_HOURS,
          inviteBaseUrl: env.INVITE_BASE_URL,
          telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
          timezone: env.APP_TIMEZONE,
        },
      },
      params,
    );
    // A senha e o código não são mostrados: estão no .env de quem rodou o seed.
    const lines = [
      `Conta de demonstração pronta (${env.DB_PROVIDER}).`,
      `  E-mail: ${result.email}`,
      `  Id:     ${result.accountId}`,
      '  Rede de apoio (o link só aparece aqui; o banco guarda apenas o hash):',
      ...result.contacts.map(
        (c) => `    - ${c.nickname}: ${c.status}${c.channel ? ` (${c.channel})` : ''} · ${c.inviteUrl}`,
      ),
      `  Teste seguro de 3 dias atrás: ${result.safeTestId}`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
  } finally {
    await dataSource.destroy();
  }
}

void main();
