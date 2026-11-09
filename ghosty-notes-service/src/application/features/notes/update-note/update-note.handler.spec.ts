import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../../../domain/shared/domain-error.js';
import { NotFoundError } from '../../../shared/not-found.error.js';
import {
  FixedClock,
  InMemoryNoteRepository,
  SequentialIds,
  seedNote,
} from '../../../../../test/fakes/notes.fakes.js';
import { UpdateNoteHandler } from './update-note.handler.js';

const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';

describe('UpdateNoteHandler', () => {
  let notes: InMemoryNoteRepository;
  let handler: UpdateNoteHandler;

  beforeEach(() => {
    notes = new InMemoryNoteRepository();
    handler = new UpdateNoteHandler(
      notes,
      new FixedClock(new Date('2026-11-06T22:10:00Z')),
      new SequentialIds(),
    );
  });

  it('substitui o conteúdo e sobe a versão', async () => {
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'a', body: 'b' });
    const view = await handler.execute({
      ownerId: OWNER,
      noteId: note.id,
      version: 1,
      content: {
        kind: 'text',
        title: 'novo',
        body: 'texto',
        color: 'pink',
        labels: [],
        pinned: true,
        archived: false,
        reminderAt: null,
      },
    });
    expect(view).toMatchObject({ title: 'novo', body: 'texto', color: 'pink', pinned: true, version: 2 });
    expect(view.updatedAt).toBe('2026-11-06T22:10:00.000Z');
  });

  it('versão antiga responde VERSION_CONFLICT e não altera nada', async () => {
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'a' });
    const attempt = handler.execute({
      ownerId: OWNER,
      noteId: note.id,
      version: 0,
      content: { kind: 'text', title: 'b' },
    });
    await expect(attempt).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await notes.findById(OWNER, note.id))?.toSnapshot()).toMatchObject({ title: 'a', version: 1 });
  });

  it('outra escrita entre a leitura e a gravação também vira VERSION_CONFLICT', async () => {
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'a' });
    const original = notes.update.bind(notes);
    notes.update = async (n, expected) => {
      notes.bumpVersion(n.id);
      return original(n, expected);
    };
    await expect(
      handler.execute({ ownerId: OWNER, noteId: note.id, version: 1, content: { kind: 'text', title: 'b' } }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('nota inexistente ou de outra conta responde NOT_FOUND', async () => {
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'a' });
    await expect(
      handler.execute({
        ownerId: '01a15965-b480-79af-a113-000000000000',
        noteId: note.id,
        version: 1,
        content: { kind: 'text', title: 'b' },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
