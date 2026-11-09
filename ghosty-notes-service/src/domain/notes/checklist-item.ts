import { DomainError } from '../shared/domain-error.js';
import { NOTE_LIMITS } from './note-limits.js';

export interface ChecklistItemSnapshot {
  id: string;
  text: string;
  done: boolean;
}

/** Um item de checklist. O texto é guardado sem espaços nas pontas e não pode ficar vazio. */
export class ChecklistItem {
  private constructor(
    readonly id: string,
    readonly text: string,
    readonly done: boolean,
  ) {}

  static create(id: string, text: string, done = false, field = 'items'): ChecklistItem {
    const trimmed = text.trim();
    if (trimmed.length === 0) throw DomainError.invalidField(`${field}.text`, 'não pode ficar vazio');
    if (trimmed.length > NOTE_LIMITS.itemText) {
      throw DomainError.invalidField(`${field}.text`, `máximo de ${NOTE_LIMITS.itemText} caracteres`);
    }
    return new ChecklistItem(id, trimmed, done);
  }

  static restore(snapshot: ChecklistItemSnapshot): ChecklistItem {
    return new ChecklistItem(snapshot.id, snapshot.text, snapshot.done);
  }

  withDone(done: boolean): ChecklistItem {
    return new ChecklistItem(this.id, this.text, done);
  }

  toSnapshot(): ChecklistItemSnapshot {
    return { id: this.id, text: this.text, done: this.done };
  }
}
