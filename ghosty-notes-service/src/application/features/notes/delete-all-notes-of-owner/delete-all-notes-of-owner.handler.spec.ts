import { describe, expect, it } from 'vitest';
import { InMemoryNoteRepository, seedNote } from '../../../../../test/fakes/notes.fakes.js';
import { DeleteAllNotesOfOwnerHandler } from './delete-all-notes-of-owner.handler.js';

const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';
const OTHER = '01a15965-b480-79af-a113-000000000000';

describe('DeleteAllNotesOfOwnerHandler', () => {
  it('apaga só as notas da conta e é idempotente', async () => {
    const notes = new InMemoryNoteRepository();
    await seedNote(notes, OWNER, { kind: 'text', title: 'a' });
    await seedNote(notes, OWNER, { kind: 'text', title: 'b', archived: true });
    const other = await seedNote(notes, OTHER, { kind: 'text', title: 'c' });
    const handler = new DeleteAllNotesOfOwnerHandler(notes);
    expect(await handler.execute({ ownerId: OWNER })).toEqual({ deleted: 2 });
    expect(await handler.execute({ ownerId: OWNER })).toEqual({ deleted: 0 });
    expect(await notes.findById(OTHER, other.id)).not.toBeNull();
  });
});
