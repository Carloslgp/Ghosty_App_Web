import { summaryWindow, type NotesSummary } from '../../../../domain/notes/notes-summary.js';
import type { Clock } from '../../../ports/clock.js';
import type { NoteRepository } from '../../../ports/note.repository.js';
import type { GetNotesSummaryQuery } from './get-notes-summary.query.js';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export class GetNotesSummaryHandler {
  constructor(
    private readonly notes: NoteRepository,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetNotesSummaryQuery): Promise<NotesSummary> {
    const window = summaryWindow(this.clock.now(), query.timezone || DEFAULT_TIMEZONE);
    return this.notes.summarize(query.ownerId, window);
  }
}
