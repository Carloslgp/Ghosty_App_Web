import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../shared/not-found.error.js';
import { InMemoryNoteRepository, seedNote } from '../../../../../test/fakes/notes.fakes.js';
import { DeleteNoteHandler } from './delete-note.handler.js';

const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';

describe('DeleteNoteHandler', () => {
  it('apaga a nota da conta; apagar de novo ou de outra conta responde NOT_FOUND', async () => {
    const notes = new InMemoryNoteRepository();
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'a' });
    const handler = new DeleteNoteHandler(notes);
    await expect(
      handler.execute({ ownerId: '01a15965-b480-79af-a113-000000000000', noteId: note.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await handler.execute({ ownerId: OWNER, noteId: note.id });
    expect(await notes.findById(OWNER, note.id)).toBeNull();
    await expect(handler.execute({ ownerId: OWNER, noteId: note.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});
