import type { NoteRepository } from '../../../ports/note.repository.js';
import { toNoteView, type NotePageView } from '../../../shared/note.view.js';
import type { ListNotesQuery } from './list-notes.query.js';

export const MAX_PAGE_SIZE = 100;

export class ListNotesHandler {
  constructor(private readonly notes: NoteRepository) {}

  async execute(query: ListNotesQuery): Promise<NotePageView> {
    const page = Math.max(1, Math.trunc(query.page));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize)));
    const q = query.q?.trim() || undefined;
    const label = query.label?.trim() || undefined;
    const result = await this.notes.list(
      query.ownerId,
      { archived: query.archived, label, q },
      { page, pageSize },
    );
    return { items: result.items.map(toNoteView), page, pageSize, total: result.total };
  }
}
