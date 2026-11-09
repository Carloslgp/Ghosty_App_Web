import { DomainError } from '../shared/domain-error.js';
import { ChecklistItem, type ChecklistItemSnapshot } from './checklist-item.js';
import { isNoteColor, type NoteColor } from './note-color.js';
import { isNoteKind, type NoteKind } from './note-kind.js';
import { NOTE_LIMITS } from './note-limits.js';

export interface ChecklistItemInput {
  /** Id de um item que já existe. Sem id (ou com um id desconhecido), o item é novo. */
  id?: string;
  text: string;
  done?: boolean;
}

/** O conteúdo completo de uma nota (criação e `PUT`). */
export interface NoteContent {
  kind: NoteKind;
  title?: string;
  body?: string;
  items?: ChecklistItemInput[];
  color?: NoteColor;
  labels?: string[];
  pinned?: boolean;
  archived?: boolean;
  reminderAt?: Date | null;
}

/** Alteração parcial (`PATCH`). Só os campos presentes mudam. */
export interface NotePatch {
  title?: string;
  kind?: NoteKind;
  pinned?: boolean;
  archived?: boolean;
  color?: NoteColor;
  labels?: string[];
  reminderAt?: Date | null;
  item?: { id: string; done: boolean };
}

export interface NoteSnapshot {
  id: string;
  ownerId: string;
  kind: NoteKind;
  title: string;
  /** Só em notas `text`. */
  body: string | null;
  /** Só em notas `checklist`. */
  items: ChecklistItemSnapshot[] | null;
  color: NoteColor;
  labels: string[];
  pinned: boolean;
  archived: boolean;
  reminderAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/** Gera ids novos para os itens de checklist (UUID v7). */
export type ItemIdFactory = () => string;

interface State {
  id: string;
  ownerId: string;
  kind: NoteKind;
  title: string;
  body: string | null;
  items: ChecklistItem[] | null;
  color: NoteColor;
  labels: string[];
  pinned: boolean;
  archived: boolean;
  reminderAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export function versionConflict(sent: number, current: number): DomainError {
  return new DomainError(
    'VERSION_CONFLICT',
    `A nota foi alterada depois da versão ${sent}. Versão atual ${current}.`,
  );
}

/**
 * Nota de texto ou checklist.
 *
 * - Precisa de título ou conteúdo.
 * - Nota `text` não tem itens; nota `checklist` não tem `body`.
 * - Converter entre os tipos preserva o texto (linhas ↔ itens).
 * - Toda alteração incrementa `version` (concorrência otimista).
 */
export class Note {
  private constructor(private state: State) {}

  static create(params: {
    id: string;
    ownerId: string;
    now: Date;
    content: NoteContent;
    newItemId: ItemIdFactory;
  }): Note {
    const content = normalizeContent(params.content, [], params.newItemId);
    const note = new Note({
      id: params.id,
      ownerId: params.ownerId,
      ...content,
      createdAt: params.now,
      updatedAt: params.now,
      version: 1,
    });
    note.assertHasContent();
    return note;
  }

  /** Reconstrói uma nota já gravada, sem validar de novo. */
  static restore(snapshot: NoteSnapshot): Note {
    return new Note({
      ...snapshot,
      labels: [...snapshot.labels],
      items: snapshot.items?.map((item) => ChecklistItem.restore(item)) ?? null,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get ownerId(): string {
    return this.state.ownerId;
  }

  get kind(): NoteKind {
    return this.state.kind;
  }

  get version(): number {
    return this.state.version;
  }

  /** Recusa a alteração se o cliente leu uma versão diferente da atual. */
  assertVersion(expected: number): void {
    if (expected !== this.state.version) throw versionConflict(expected, this.state.version);
  }

  /** Substitui o conteúdo inteiro (`PUT`). Exige a versão atual. */
  replace(content: NoteContent, expectedVersion: number, now: Date, newItemId: ItemIdFactory): void {
    this.assertVersion(expectedVersion);
    const normalized = normalizeContent(content, this.state.items ?? [], newItemId);
    this.commit({ ...this.state, ...normalized }, now);
  }

  /** Altera só os campos enviados (`PATCH`). A versão é conferida se vier. */
  patch(changes: NotePatch, now: Date, newItemId: ItemIdFactory, expectedVersion?: number): void {
    if (expectedVersion !== undefined) this.assertVersion(expectedVersion);
    if (Object.values(changes).every((value) => value === undefined)) {
      throw new DomainError('VALIDATION_FAILED', 'Informe pelo menos um campo para alterar.');
    }

    const next: State = { ...this.state };
    if (changes.kind !== undefined && changes.kind !== next.kind) {
      Object.assign(next, convert(next, assertKind(changes.kind), newItemId));
    }
    if (changes.title !== undefined) next.title = normalizeTitle(changes.title);
    if (changes.color !== undefined) next.color = assertColor(changes.color);
    if (changes.labels !== undefined) next.labels = normalizeLabels(changes.labels);
    if (changes.pinned !== undefined) next.pinned = changes.pinned;
    if (changes.archived !== undefined) next.archived = changes.archived;
    if (changes.reminderAt !== undefined) next.reminderAt = normalizeReminder(changes.reminderAt);
    if (changes.item !== undefined) next.items = toggleItem(next, changes.item);

    this.commit(next, now);
  }

  toSnapshot(): NoteSnapshot {
    return {
      ...this.state,
      labels: [...this.state.labels],
      items: this.state.items?.map((item) => item.toSnapshot()) ?? null,
    };
  }

  private commit(next: State, now: Date): void {
    const candidate = new Note({ ...next, updatedAt: now, version: this.state.version + 1 });
    candidate.assertHasContent();
    this.state = candidate.state;
  }

  private assertHasContent(): void {
    const { title, body, items } = this.state;
    const hasContent = title.length > 0 || (body ?? '').trim().length > 0 || (items ?? []).length > 0;
    if (!hasContent) throw new DomainError('VALIDATION_FAILED', 'A nota precisa de título ou conteúdo.');
  }
}

type Content = Pick<
  State,
  'kind' | 'title' | 'body' | 'items' | 'color' | 'labels' | 'pinned' | 'archived' | 'reminderAt'
>;

function normalizeContent(
  content: NoteContent,
  existing: ChecklistItem[],
  newItemId: ItemIdFactory,
): Content {
  const kind = assertKind(content.kind);
  const common = {
    kind,
    title: normalizeTitle(content.title ?? ''),
    color: assertColor(content.color ?? 'default'),
    labels: normalizeLabels(content.labels ?? []),
    pinned: content.pinned ?? false,
    archived: content.archived ?? false,
    reminderAt: normalizeReminder(content.reminderAt ?? null),
  };

  if (kind === 'text') {
    if ((content.items ?? []).length > 0)
      throw DomainError.invalidField('items', 'nota de texto não tem itens');
    return { ...common, body: normalizeBody(content.body ?? ''), items: null };
  }
  if ((content.body ?? '').length > 0)
    throw DomainError.invalidField('body', 'checklist não tem texto livre');
  return { ...common, body: null, items: buildItems(content.items ?? [], existing, newItemId) };
}

function assertKind(kind: unknown): NoteKind {
  if (!isNoteKind(kind)) throw DomainError.invalidField('kind', 'use text ou checklist');
  return kind;
}

function assertColor(color: unknown): NoteColor {
  if (!isNoteColor(color)) throw DomainError.invalidField('color', 'cor desconhecida');
  return color;
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length > NOTE_LIMITS.title) {
    throw DomainError.invalidField('title', `máximo de ${NOTE_LIMITS.title} caracteres`);
  }
  return trimmed;
}

function normalizeBody(body: string): string {
  if (body.length > NOTE_LIMITS.body) {
    throw DomainError.invalidField('body', `máximo de ${NOTE_LIMITS.body} caracteres`);
  }
  return body;
}

/** Tira espaços, remove repetidas (mantendo a ordem) e confere os limites. */
function normalizeLabels(labels: string[]): string[] {
  const unique: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (label.length === 0) throw DomainError.invalidField('labels', 'etiqueta vazia');
    if (label.length > NOTE_LIMITS.label) {
      throw DomainError.invalidField('labels', `máximo de ${NOTE_LIMITS.label} caracteres por etiqueta`);
    }
    if (!unique.includes(label)) unique.push(label);
  }
  if (unique.length > NOTE_LIMITS.labels) {
    throw DomainError.invalidField('labels', `máximo de ${NOTE_LIMITS.labels} etiquetas`);
  }
  return unique;
}

function normalizeReminder(reminderAt: Date | null): Date | null {
  if (reminderAt !== null && Number.isNaN(reminderAt.getTime())) {
    throw DomainError.invalidField('reminderAt', 'data inválida');
  }
  return reminderAt;
}

/** Mantém o id dos itens que já existem; itens sem id (ou com id desconhecido) recebem um novo. */
function buildItems(inputs: ChecklistItemInput[], existing: ChecklistItem[], newItemId: ItemIdFactory) {
  if (inputs.length > NOTE_LIMITS.items) {
    throw DomainError.invalidField('items', `máximo de ${NOTE_LIMITS.items} itens`);
  }
  const known = new Set(existing.map((item) => item.id));
  const used = new Set<string>();
  return inputs.map((input, index) => {
    const reuse = input.id !== undefined && known.has(input.id) && !used.has(input.id);
    const id = reuse && input.id !== undefined ? input.id : newItemId();
    used.add(id);
    return ChecklistItem.create(id, input.text, input.done ?? false, `items.${index}`);
  });
}

/** Converte entre texto e checklist preservando o texto: cada linha não vazia vira um item, e vice-versa. */
function convert(
  state: State,
  kind: NoteKind,
  newItemId: ItemIdFactory,
): Pick<State, 'kind' | 'body' | 'items'> {
  if (kind === 'checklist') {
    const lines = (state.body ?? '').split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length > NOTE_LIMITS.items) {
      throw DomainError.invalidField('kind', `o texto tem mais de ${NOTE_LIMITS.items} linhas`);
    }
    const items = lines.map((line) => {
      if (line.trim().length > NOTE_LIMITS.itemText) {
        throw DomainError.invalidField('kind', `uma linha passa de ${NOTE_LIMITS.itemText} caracteres`);
      }
      return ChecklistItem.create(newItemId(), line);
    });
    return { kind, body: null, items };
  }
  const body = (state.items ?? []).map((item) => item.text).join('\n');
  if (body.length > NOTE_LIMITS.body) {
    throw DomainError.invalidField('kind', `o texto passaria de ${NOTE_LIMITS.body} caracteres`);
  }
  return { kind, body, items: null };
}

function toggleItem(state: State, change: { id: string; done: boolean }): ChecklistItem[] {
  if (state.kind !== 'checklist' || state.items === null) {
    throw DomainError.invalidField('item', 'só notas checklist têm itens');
  }
  const index = state.items.findIndex((item) => item.id === change.id);
  const current = state.items[index];
  if (current === undefined) throw DomainError.invalidField('item.id', 'item não encontrado nesta nota');
  const items = [...state.items];
  items[index] = current.withDone(change.done);
  return items;
}
