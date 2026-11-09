import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { summaryWindow } from '../../src/domain/notes/notes-summary.js';
import { MongoNoteRepository } from '../../src/infrastructure/persistence/mongo-note.repository.js';
import { UuidV7Generator } from '../../src/infrastructure/system/uuid-id-generator.js';
import { nextThursdayAt14, seedDemoNotes } from '../../src/seed/demo-seed.js';

const DEMO = '01a15965-b480-79af-a113-29b2fc82e5ef';
const OTHER = '01a15965-b480-79af-a113-000000000000';
// Uma segunda-feira, 10h em Brasília.
const NOW = new Date('2026-11-09T13:00:00Z');

describe('Seed de demonstração das notas', () => {
  let mongo: MongoMemoryServer;
  let client: MongoClient;
  let notes: MongoNoteRepository;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongo.getUri());
    notes = new MongoNoteRepository(client.db('notes_seed'));
    await notes.ensureIndexes();
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await mongo?.stop();
  });

  it('grava 8 notas, 5 atualizadas nos últimos 14 dias, 1 fixada e o lembrete do dentista', async () => {
    expect(await seedDemoNotes(notes, new UuidV7Generator(), DEMO, NOW)).toBe(8);
    const summary = await notes.summarize(DEMO, summaryWindow(NOW, 'America/Sao_Paulo'));
    expect(summary).toEqual({ total: 8, pinned: 1, archived: 0, updatedLast14Days: 5, remindersToday: 0 });

    const page = await notes.list(DEMO, { archived: false }, { page: 1, pageSize: 20 });
    expect(page.items[0]?.toSnapshot()).toMatchObject({
      title: 'Lista do mercado',
      kind: 'checklist',
      pinned: true,
    });
    const dentist = page.items.find((note) => note.toSnapshot().title === 'Dentista quinta 14h');
    expect(dentist?.toSnapshot().reminderAt).toEqual(new Date('2026-11-12T17:00:00Z'));
  });

  it('rodar de novo recomeça do zero, e não toca nas notas de outra conta', async () => {
    await seedDemoNotes(notes, new UuidV7Generator(), OTHER, NOW);
    await seedDemoNotes(notes, new UuidV7Generator(), DEMO, NOW);
    await seedDemoNotes(notes, new UuidV7Generator(), DEMO, NOW);
    expect((await notes.list(DEMO, { archived: false }, { page: 1, pageSize: 50 })).total).toBe(8);
    expect(await notes.deleteAllOfOwner(DEMO)).toBe(8);
    expect((await notes.list(OTHER, { archived: false }, { page: 1, pageSize: 50 })).total).toBe(8);
  });

  it('a próxima quinta às 14h: na própria quinta antes das 14h é hoje; depois, a da semana seguinte', () => {
    expect(nextThursdayAt14(new Date('2026-11-12T12:00:00Z'))).toEqual(new Date('2026-11-12T17:00:00Z'));
    expect(nextThursdayAt14(new Date('2026-11-12T18:00:00Z'))).toEqual(new Date('2026-11-19T17:00:00Z'));
    expect(nextThursdayAt14(new Date('2026-11-14T02:00:00Z'))).toEqual(new Date('2026-11-19T17:00:00Z'));
  });
});
