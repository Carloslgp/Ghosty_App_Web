import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryNoteRepository, seedNote } from '../../../../../test/fakes/notes.fakes.js';
import { ListNotesHandler } from './list-notes.handler.js';

const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';
const OTHER = '01a15965-b480-79af-a113-000000000000';

describe('ListNotesHandler', () => {
  let notes: InMemoryNoteRepository;
  let handler: ListNotesHandler;

  beforeEach(async () => {
    notes = new InMemoryNoteRepository();
    let minute = 0;
    const add = (ownerId: string, title: string, extra: object = {}) =>
      seedNote(
        notes,
        ownerId,
        { kind: 'text', title, ...extra },
        new Date(Date.UTC(2026, 10, 1, 10, ++minute)),
      );
    await add(OWNER, 'Ideias de presente', { body: 'Mãe: livro' });
    await add(OWNER, 'Lista do mercado', { pinned: true, labels: ['casa'] });
    await add(OWNER, 'Dentista', { labels: ['saúde'] });
    await add(OWNER, 'Antiga', { archived: true });
    await add(OTHER, 'De outra conta');
    handler = new ListNotesHandler(notes);
  });

  const query = (extra: object = {}) => ({
    ownerId: OWNER,
    archived: false,
    page: 1,
    pageSize: 20,
    ...extra,
  });

  it('lista só as notas ativas da conta: fixadas primeiro, depois as mais recentes', async () => {
    const page = await handler.execute(query());
    expect(page.items.map((note) => note.title)).toEqual([
      'Lista do mercado',
      'Dentista',
      'Ideias de presente',
    ]);
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 3 });
  });

  it('filtra arquivadas, etiqueta e busca (sem diferenciar maiúsculas, também no texto)', async () => {
    const titles = async (extra: object) => (await handler.execute(query(extra))).items.map((n) => n.title);
    expect(await titles({ archived: true })).toEqual(['Antiga']);
    expect(await titles({ label: 'casa' })).toEqual(['Lista do mercado']);
    expect(await titles({ q: 'MERCADO' })).toEqual(['Lista do mercado']);
    expect(await titles({ q: 'livro' })).toEqual(['Ideias de presente']);
    expect((await handler.execute(query({ q: '   ' }))).total).toBe(3);
  });

  it('pagina e limita o tamanho da página a 100', async () => {
    const second = await handler.execute(query({ page: 2, pageSize: 2 }));
    expect(second.items.map((note) => note.title)).toEqual(['Ideias de presente']);
    expect(second.total).toBe(3);
    expect((await handler.execute(query({ pageSize: 500 }))).pageSize).toBe(100);
    expect(await handler.execute(query({ page: 0, pageSize: 0 }))).toMatchObject({ page: 1, pageSize: 1 });
  });
});
