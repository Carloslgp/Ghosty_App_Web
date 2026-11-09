import type { Clock } from '../../src/application/ports/clock.js';
import type { IdGenerator } from '../../src/application/ports/id-generator.js';
import type {
  NoteListFilter,
  NoteListResult,
  NoteRepository,
  PageRequest,
} from '../../src/application/ports/note.repository.js';
import { Note, type NoteContent, type NoteSnapshot } from '../../src/domain/notes/note.entity.js';
import type { NotesSummary, SummaryWindow } from '../../src/domain/notes/notes-summary.js';

/** Repositório em memória com as mesmas regras do MongoDB (dono, ordem, versão), para os testes dos handlers. */
export class InMemoryNoteRepository implements NoteRepository {
  private readonly rows = new Map<string, NoteSnapshot>();
  private sequence = 0;

  nextId(): string {
    this.sequence += 1;
    return this.sequence.toString(16).padStart(24, '0');
  }

  async findById(ownerId: string, id: string): Promise<Note | null> {
    const row = this.rows.get(id);
    return row && row.ownerId === ownerId ? Note.restore(row) : null;
  }

  async list(ownerId: string, filter: NoteListFilter, page: PageRequest): Promise<NoteListResult> {
    const q = filter.q?.toLowerCase();
    const matches = [...this.rows.values()]
      .filter((row) => row.ownerId === ownerId && row.archived === filter.archived)
      .filter((row) => !filter.label || row.labels.includes(filter.label))
      .filter(
        (row) =>
          !q ||
          [row.title, row.body ?? '', ...(row.items ?? []).map((item) => item.text)].some((text) =>
            text.toLowerCase().includes(q),
          ),
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (page.page - 1) * page.pageSize;
    return {
      items: matches.slice(start, start + page.pageSize).map((row) => Note.restore(row)),
      total: matches.length,
    };
  }

  async insert(note: Note): Promise<void> {
    this.rows.set(note.id, note.toSnapshot());
  }

  async update(note: Note, expectedVersion: number): Promise<boolean> {
    const row = this.rows.get(note.id);
    if (!row || row.ownerId !== note.ownerId || row.version !== expectedVersion) return false;
    this.rows.set(note.id, note.toSnapshot());
    return true;
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.ownerId !== ownerId) return false;
    return this.rows.delete(id);
  }

  async deleteAllOfOwner(ownerId: string): Promise<number> {
    const ids = [...this.rows.values()].filter((row) => row.ownerId === ownerId).map((row) => row.id);
    for (const id of ids) this.rows.delete(id);
    return ids.length;
  }

  async summarize(ownerId: string, window: SummaryWindow): Promise<NotesSummary> {
    const rows = [...this.rows.values()].filter((row) => row.ownerId === ownerId);
    const active = rows.filter((row) => !row.archived);
    return {
      total: active.length,
      pinned: active.filter((row) => row.pinned).length,
      archived: rows.length - active.length,
      updatedLast14Days: rows.filter((row) => row.updatedAt >= window.recentSince).length,
      remindersToday: active.filter(
        (row) =>
          row.reminderAt && row.reminderAt >= window.todayStart && row.reminderAt < window.tomorrowStart,
      ).length,
    };
  }

  /** Simula outra escrita chegando entre a leitura e a gravação. */
  bumpVersion(id: string): void {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, version: row.version + 1 });
  }
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIds implements IdGenerator {
  private next = 0;

  newId(): string {
    this.next += 1;
    return `00000000-0000-7000-8000-${this.next.toString().padStart(12, '0')}`;
  }
}

/** Grava uma nota direto no repositório, sem passar por outro caso de uso. */
export async function seedNote(
  notes: InMemoryNoteRepository,
  ownerId: string,
  content: NoteContent,
  now = new Date('2026-11-05T12:00:00Z'),
): Promise<Note> {
  const ids = new SequentialIds();
  const note = Note.create({ id: notes.nextId(), ownerId, now, content, newItemId: () => ids.newId() });
  await notes.insert(note);
  return note;
}
