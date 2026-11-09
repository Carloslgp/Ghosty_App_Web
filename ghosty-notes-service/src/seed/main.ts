import { existsSync } from 'node:fs';
import { loadEnv } from '../infrastructure/config/env.js';
import { MongoConnection } from '../infrastructure/persistence/mongo-connection.js';
import { MongoNoteRepository } from '../infrastructure/persistence/mongo-note.repository.js';
import { UuidV7Generator } from '../infrastructure/system/uuid-id-generator.js';
import { seedDemoNotes } from './demo-seed.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(message: string): never {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

/**
 * `npm run seed:demo` grava as 8 notas da conta de demonstração; `npm run seed:reset` apaga só elas.
 * Grava direto no MongoDB do `.env` (o Atlas, na preparação do vídeo). O `DEMO_ACCOUNT_ID` é o mesmo
 * do seed do safety-service.
 */
async function main(): Promise<void> {
  const command = process.argv[2] ?? 'demo';
  if (command !== 'demo' && command !== 'reset') fail('Use: seed demo | seed reset');
  if (existsSync('.env')) process.loadEnvFile('.env');
  let env;
  try {
    env = loadEnv();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const ownerId = (process.env.DEMO_ACCOUNT_ID ?? '').toLowerCase();
  if (!UUID.test(ownerId)) fail('DEMO_ACCOUNT_ID: precisa ser um UUID (o mesmo do safety-service).');
  if (env.MONGODB_URI === '') {
    fail(
      'MONGODB_URI vazia: o MongoDB em memória some quando o serviço para, então não há onde gravar o seed.\n' +
        'Use a URI do Atlas (ou de um mongod local) no .env.',
    );
  }

  const connection = MongoConnection.create(env.MONGODB_URI, env.MONGODB_DB);
  try {
    const notes = new MongoNoteRepository(connection.db);
    await notes.ensureIndexes();
    if (command === 'reset') {
      const removed = await notes.deleteAllOfOwner(ownerId);
      process.stdout.write(`Notas da conta demo apagadas: ${removed}.\n`);
      return;
    }
    const count = await seedDemoNotes(notes, new UuidV7Generator(), ownerId, new Date());
    process.stdout.write(`Notas da conta demo gravadas em ${env.MONGODB_DB}: ${count}.\n`);
  } finally {
    await connection.close();
  }
}

void main();
