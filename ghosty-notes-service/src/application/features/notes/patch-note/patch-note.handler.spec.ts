import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../shared/not-found.error.js';
import {
  FixedClock,
  InMemoryNoteRepository,
  SequentialIds,
  seedNote,
} from '../../../../../test/fakes/notes.fakes.js';
import { PatchNoteHandler } from './patch-note.handler.js';

const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';

describe('PatchNoteHandler', () => {
  let notes: InMemoryNoteRepository;
  let handler: PatchNoteHandler;

  beforeEach(() => {
    notes = new InMemoryNoteRepository();
    handler = new PatchNoteHandler(
      notes,
      new FixedClock(new Date('2026-11-06T22:10:00Z')),
      new SequentialIds(),
    );
  });

  it('fixa a nota e marca um item, subindo a versão a cada alteração', async () => {
    const note = await seedNote(notes, OWNER, {
      kind: 'checklist',
      title: 'Mercado',
      items: [{ text: 'pão' }],
    });
    const itemId = note.toSnapshot().items?.[0]?.id ?? '';
    const pinned = await handler.execute({ ownerId: OWNER, noteId: note.id, changes: { pinned: true } });
    expect(pinned.version).toBe(2);
    const view = await handler.execute({
      ownerId: OWNER,
      noteId: note.id,
      changes: { item: { id: itemId, done: true } },
    });
    expect(view.items?.[0]?.done).toBe(true);
    expect(view.version).toBe(3);
  });

  it('converte texto em checklist preservando as linhas', async () => {
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'Mercado', body: 'pão\nleite' });
    const view = await handler.execute({
      ownerId: OWNER,
      noteId: note.id,
      version: 1,
      changes: { kind: 'checklist' },
    });
    expect(view.items?.map((item) => item.text)).toEqual(['pão', 'leite']);
    expect(view).not.toHaveProperty('body');
  });

  it('confere a versão quando ela vem', async () => {
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'a' });
    await expect(
      handler.execute({ ownerId: OWNER, noteId: note.id, version: 5, changes: { pinned: true } }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('corrida com outra escrita vira VERSION_CONFLICT', async () => {
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'a' });
    const original = notes.update.bind(notes);
    notes.update = async (n, expected) => {
      notes.bumpVersion(n.id);
      return original(n, expected);
    };
    await expect(
      handler.execute({ ownerId: OWNER, noteId: note.id, changes: { pinned: true } }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('nota de outra conta responde NOT_FOUND', async () => {
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'a' });
    await expect(
      handler.execute({
        ownerId: '01a15965-b480-79af-a113-000000000000',
        noteId: note.id,
        changes: { pinned: true },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
