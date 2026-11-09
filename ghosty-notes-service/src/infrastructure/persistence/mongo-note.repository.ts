import { ObjectId, type Collection, type Db, type Filter } from 'mongodb';
import type {
  NoteListFilter,
  NoteListResult,
  NoteRepository,
  PageRequest,
} from '../../application/ports/note.repository.js';
import type { Note } from '../../domain/notes/note.entity.js';
import type { NotesSummary, SummaryWindow } from '../../domain/notes/notes-summary.js';
import { fromDocument, toDocument, type NoteDocument } from './note.document.js';

export const NOTES_COLLECTION = 'notes';

const OBJECT_ID = /^[0-9a-f]{24}$/;

function toObjectId(id: string): ObjectId | null {
  return OBJECT_ID.test(id) ? new ObjectId(id) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class MongoNoteRepository implements NoteRepository {
  private readonly notes: Collection<NoteDocument>;

  constructor(db: Db) {
    this.notes = db.collection<NoteDocument>(NOTES_COLLECTION);
  }

  /** Índices de listagem, de etiquetas e de lembretes (parcial). Criar de novo não faz nada. */
  async ensureIndexes(): Promise<void> {
    await this.notes.createIndexes([
      { key: { ownerId: 1, archived: 1, pinned: -1, updatedAt: -1 }, name: 'owner_list' },
      { key: { ownerId: 1, labels: 1 }, name: 'owner_labels' },
      {
        key: { ownerId: 1, reminderAt: 1 },
        name: 'owner_reminders',
        partialFilterExpression: { reminderAt: { $exists: true } },
      },
    ]);
  }

  nextId(): string {
    return new ObjectId().toHexString();
  }

  async findById(ownerId: string, id: string): Promise<Note | null> {
    const _id = toObjectId(id);
    if (!_id) return null;
    const doc = await this.notes.findOne({ _id, ownerId });
    return doc ? fromDocument(doc) : null;
  }

  async list(ownerId: string, filter: NoteListFilter, page: PageRequest): Promise<NoteListResult> {
    const query: Filter<NoteDocument> = { ownerId, archived: filter.archived };
    if (filter.label) query.labels = filter.label;
    if (filter.q) {
      const pattern = { $regex: escapeRegExp(filter.q), $options: 'i' };
      query.$or = [{ title: pattern }, { body: pattern }, { 'items.text': pattern }];
    }
    const [docs, total] = await Promise.all([
      this.notes
        .find(query)
        .sort({ pinned: -1, updatedAt: -1, _id: -1 })
        .skip((page.page - 1) * page.pageSize)
        .limit(page.pageSize)
        .toArray(),
      this.notes.countDocuments(query),
    ]);
    return { items: docs.map(fromDocument), total };
  }

  async insert(note: Note): Promise<void> {
    await this.notes.insertOne(toDocument(note));
  }

  async update(note: Note, expectedVersion: number): Promise<boolean> {
    const doc = toDocument(note);
    // replaceOne troca o documento inteiro: campos que deixaram de existir (body, items, reminderAt) somem.
    const result = await this.notes.replaceOne(
      { _id: doc._id, ownerId: doc.ownerId, version: expectedVersion },
      doc,
    );
    return result.matchedCount === 1;
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const _id = toObjectId(id);
    if (!_id) return false;
    const result = await this.notes.deleteOne({ _id, ownerId });
    return result.deletedCount === 1;
  }

  async deleteAllOfOwner(ownerId: string): Promise<number> {
    const result = await this.notes.deleteMany({ ownerId });
    return result.deletedCount;
  }

  async summarize(ownerId: string, window: SummaryWindow): Promise<NotesSummary> {
    const [total, pinned, archived, updatedLast14Days, remindersToday] = await Promise.all([
      this.notes.countDocuments({ ownerId, archived: false }),
      this.notes.countDocuments({ ownerId, archived: false, pinned: true }),
      this.notes.countDocuments({ ownerId, archived: true }),
      this.notes.countDocuments({ ownerId, updatedAt: { $gte: window.recentSince } }),
      this.notes.countDocuments({
        ownerId,
        archived: false,
        reminderAt: { $gte: window.todayStart, $lt: window.tomorrowStart },
      }),
    ]);
    return { total, pinned, archived, updatedLast14Days, remindersToday };
  }
}
