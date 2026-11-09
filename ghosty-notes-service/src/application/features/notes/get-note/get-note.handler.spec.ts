import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../shared/not-found.error.js';
import { InMemoryNoteRepository, seedNote } from '../../../../../test/fakes/notes.fakes.js';
import { GetNoteHandler } from './get-note.handler.js';

const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';

describe('GetNoteHandler', () => {
  it('devolve a nota da conta e responde "não encontrada" para nota de outra conta', async () => {
    const notes = new InMemoryNoteRepository();
    const note = await seedNote(notes, OWNER, { kind: 'text', title: 'Dentista' });
    const handler = new GetNoteHandler(notes);
    expect((await handler.execute({ ownerId: OWNER, noteId: note.id })).title).toBe('Dentista');
    await expect(
      handler.execute({ ownerId: '01a15965-b480-79af-a113-000000000000', noteId: note.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(handler.execute({ ownerId: OWNER, noteId: 'ffffffffffffffffffffffff' })).rejects.toThrow(
      'Nota não encontrada.',
    );
  });
});
