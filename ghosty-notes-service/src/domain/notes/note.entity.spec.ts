import { describe, expect, it } from 'vitest';
import { DomainError } from '../shared/domain-error.js';
import { Note, type NoteContent } from './note.entity.js';

const NOW = new Date('2026-11-06T22:10:00Z');
const LATER = new Date('2026-11-07T08:00:00Z');
const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';

function ids() {
  let next = 0;
  return () => `item-${++next}`;
}

function create(content: NoteContent, newItemId = ids()) {
  return Note.create({ id: 'n1', ownerId: OWNER, now: NOW, content, newItemId });
}

function expectDomainError(fn: () => unknown, code: string, field?: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    if (field) expect((error as DomainError).errors?.[0]?.field).toBe(field);
    return;
  }
  throw new Error('esperava um DomainError');
}

describe('Note: criação', () => {
  it('cria uma nota de texto com os valores padrão e a versão 1', () => {
    const note = create({ kind: 'text', title: '  Dentista  ', body: 'Levar a carteirinha.' });
    expect(note.toSnapshot()).toEqual({
      id: 'n1',
      ownerId: OWNER,
      kind: 'text',
      title: 'Dentista',
      body: 'Levar a carteirinha.',
      items: null,
      color: 'default',
      labels: [],
      pinned: false,
      archived: false,
      reminderAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });
  });

  it('cria um checklist gerando o id de cada item', () => {
    const note = create({
      kind: 'checklist',
      title: 'Mercado',
      items: [{ text: ' pão ' }, { text: 'café', done: true }],
      color: 'yellow',
      labels: ['casa', ' casa ', 'mercado'],
      pinned: true,
      reminderAt: LATER,
    });
    const snapshot = note.toSnapshot();
    expect(snapshot.body).toBeNull();
    expect(snapshot.items).toEqual([
      { id: 'item-1', text: 'pão', done: false },
      { id: 'item-2', text: 'café', done: true },
    ]);
    expect(snapshot.labels).toEqual(['casa', 'mercado']);
    expect(snapshot.pinned).toBe(true);
    expect(snapshot.reminderAt).toEqual(LATER);
  });

  it('exige título ou conteúdo', () => {
    expectDomainError(() => create({ kind: 'text', title: '   ', body: '  \n ' }), 'VALIDATION_FAILED');
    expectDomainError(() => create({ kind: 'checklist', items: [] }), 'VALIDATION_FAILED');
  });

  it('aceita nota só com conteúdo, sem título', () => {
    expect(create({ kind: 'text', body: 'só o texto' }).toSnapshot().title).toBe('');
    expect(create({ kind: 'checklist', items: [{ text: 'a' }] }).toSnapshot().items).toHaveLength(1);
  });

  it('nota de texto não aceita itens, e checklist não aceita texto livre', () => {
    expectDomainError(
      () => create({ kind: 'text', title: 't', items: [{ text: 'a' }] }),
      'VALIDATION_FAILED',
      'items',
    );
    expectDomainError(
      () => create({ kind: 'checklist', title: 't', body: 'texto' }),
      'VALIDATION_FAILED',
      'body',
    );
  });

  it('confere os limites de tamanho', () => {
    expectDomainError(() => create({ kind: 'text', title: 'x'.repeat(201) }), 'VALIDATION_FAILED', 'title');
    expectDomainError(() => create({ kind: 'text', body: 'x'.repeat(20_001) }), 'VALIDATION_FAILED', 'body');
    const tooMany = Array.from({ length: 201 }, () => ({ text: 'a' }));
    expectDomainError(() => create({ kind: 'checklist', items: tooMany }), 'VALIDATION_FAILED', 'items');
    expectDomainError(
      () => create({ kind: 'checklist', items: [{ text: 'ok' }, { text: 'x'.repeat(501) }] }),
      'VALIDATION_FAILED',
      'items.1.text',
    );
    expectDomainError(
      () => create({ kind: 'checklist', items: [{ text: '   ' }] }),
      'VALIDATION_FAILED',
      'items.0.text',
    );
    const labels = Array.from({ length: 11 }, (_, i) => `l${i}`);
    expectDomainError(() => create({ kind: 'text', title: 't', labels }), 'VALIDATION_FAILED', 'labels');
    expectDomainError(
      () => create({ kind: 'text', title: 't', labels: ['x'.repeat(31)] }),
      'VALIDATION_FAILED',
      'labels',
    );
    expectDomainError(
      () => create({ kind: 'text', title: 't', labels: [' '] }),
      'VALIDATION_FAILED',
      'labels',
    );
  });

  it('recusa tipo, cor e lembrete inválidos', () => {
    expectDomainError(() => create({ kind: 'drawing' as never, title: 't' }), 'VALIDATION_FAILED', 'kind');
    expectDomainError(
      () => create({ kind: 'text', title: 't', color: 'red' as never }),
      'VALIDATION_FAILED',
      'color',
    );
    expectDomainError(
      () => create({ kind: 'text', title: 't', reminderAt: new Date('invalid') }),
      'VALIDATION_FAILED',
      'reminderAt',
    );
  });
});

describe('Note: versão', () => {
  it('toda alteração incrementa a versão e atualiza o updatedAt', () => {
    const note = create({ kind: 'text', title: 'a' });
    note.patch({ pinned: true }, LATER, ids());
    expect(note.version).toBe(2);
    expect(note.toSnapshot().updatedAt).toEqual(LATER);
    expect(note.toSnapshot().createdAt).toEqual(NOW);
  });

  it('PUT com versão antiga gera VERSION_CONFLICT e não altera nada', () => {
    const note = create({ kind: 'text', title: 'a' });
    note.patch({ title: 'b' }, LATER, ids());
    const before = note.toSnapshot();
    expectDomainError(() => note.replace({ kind: 'text', title: 'c' }, 1, LATER, ids()), 'VERSION_CONFLICT');
    expect(note.toSnapshot()).toEqual(before);
  });

  it('PATCH confere a versão só quando ela vem', () => {
    const note = create({ kind: 'text', title: 'a' });
    expectDomainError(() => note.patch({ pinned: true }, LATER, ids(), 7), 'VERSION_CONFLICT');
    note.patch({ pinned: true }, LATER, ids(), 1);
    expect(note.version).toBe(2);
  });

  it('a mensagem do conflito cita a versão enviada e a atual', () => {
    const note = create({ kind: 'text', title: 'a' });
    expect(() => note.assertVersion(3)).toThrow('A nota foi alterada depois da versão 3. Versão atual 1.');
  });
});

describe('Note: substituição (PUT)', () => {
  it('mantém o id dos itens que já existem e cria os novos', () => {
    const note = create({ kind: 'checklist', title: 'Mercado', items: [{ text: 'pão' }, { text: 'leite' }] });
    note.replace(
      {
        kind: 'checklist',
        title: 'Mercado',
        items: [
          { id: 'item-1', text: 'pão', done: true },
          { id: 'item-2', text: 'leite integral' },
          { text: 'manteiga' },
          { id: 'desconhecido', text: 'ovos' },
          { id: 'item-1', text: 'pão de novo' },
        ],
      },
      1,
      LATER,
      () => 'novo',
    );
    expect(note.toSnapshot().items?.map((item) => [item.id, item.text, item.done])).toEqual([
      ['item-1', 'pão', true],
      ['item-2', 'leite integral', false],
      ['novo', 'manteiga', false],
      ['novo', 'ovos', false],
      ['novo', 'pão de novo', false],
    ]);
    expect(note.version).toBe(2);
  });

  it('mudar o tipo no PUT substitui o conteúdo pelo que foi enviado', () => {
    const note = create({ kind: 'checklist', title: 'Lista', items: [{ text: 'a' }] });
    note.replace({ kind: 'text', title: 'Lista', body: 'outro texto' }, 1, LATER, ids());
    expect(note.toSnapshot()).toMatchObject({ kind: 'text', body: 'outro texto', items: null });
  });

  it('o PUT também exige título ou conteúdo', () => {
    const note = create({ kind: 'text', title: 'a' });
    expectDomainError(() => note.replace({ kind: 'text', title: '' }, 1, LATER, ids()), 'VALIDATION_FAILED');
    expect(note.version).toBe(1);
  });
});

describe('Note: alteração parcial (PATCH)', () => {
  it('altera só os campos enviados', () => {
    const note = create({ kind: 'text', title: 'a', body: 'b', color: 'blue', labels: ['x'] });
    note.patch(
      { archived: true, color: 'green', labels: ['y'], reminderAt: LATER, title: ' c ' },
      LATER,
      ids(),
    );
    expect(note.toSnapshot()).toMatchObject({
      title: 'c',
      body: 'b',
      color: 'green',
      labels: ['y'],
      archived: true,
      pinned: false,
      reminderAt: LATER,
    });
    note.patch({ reminderAt: null }, LATER, ids());
    expect(note.toSnapshot().reminderAt).toBeNull();
  });

  it('recusa um PATCH vazio', () => {
    const note = create({ kind: 'text', title: 'a' });
    expectDomainError(() => note.patch({}, LATER, ids()), 'VALIDATION_FAILED');
  });

  it('não deixa a nota ficar sem título nem conteúdo', () => {
    const note = create({ kind: 'text', title: 'a' });
    expectDomainError(() => note.patch({ title: '' }, LATER, ids()), 'VALIDATION_FAILED');
    expect(note.toSnapshot().title).toBe('a');
  });

  it('marca e desmarca um item do checklist', () => {
    const note = create({ kind: 'checklist', title: 'Mercado', items: [{ text: 'pão' }, { text: 'leite' }] });
    note.patch({ item: { id: 'item-2', done: true } }, LATER, ids());
    expect(note.toSnapshot().items?.map((item) => item.done)).toEqual([false, true]);
    note.patch({ item: { id: 'item-2', done: false } }, LATER, ids());
    expect(note.toSnapshot().items?.map((item) => item.done)).toEqual([false, false]);
  });

  it('recusa marcar um item que não existe ou numa nota de texto', () => {
    const checklist = create({ kind: 'checklist', title: 'L', items: [{ text: 'a' }] });
    expectDomainError(
      () => checklist.patch({ item: { id: 'x', done: true } }, LATER, ids()),
      'VALIDATION_FAILED',
      'item.id',
    );
    const text = create({ kind: 'text', title: 'T' });
    expectDomainError(
      () => text.patch({ item: { id: 'x', done: true } }, LATER, ids()),
      'VALIDATION_FAILED',
      'item',
    );
  });
});

describe('Note: conversão entre texto e checklist', () => {
  it('cada linha não vazia do texto vira um item, e de volta o texto é preservado', () => {
    const note = create({ kind: 'text', title: 'Mercado', body: 'pão\r\n\nleite\n   \ncafé' });
    note.patch({ kind: 'checklist' }, LATER, ids());
    expect(note.toSnapshot()).toMatchObject({ kind: 'checklist', body: null });
    expect(note.toSnapshot().items?.map((item) => item.text)).toEqual(['pão', 'leite', 'café']);

    note.patch({ kind: 'text' }, LATER, ids());
    expect(note.toSnapshot()).toMatchObject({ kind: 'text', body: 'pão\nleite\ncafé', items: null });
    expect(note.version).toBe(3);
  });

  it('converter para o mesmo tipo não muda o conteúdo', () => {
    const note = create({ kind: 'text', title: 'a', body: 'b' });
    note.patch({ kind: 'text' }, LATER, ids());
    expect(note.toSnapshot().body).toBe('b');
  });

  it('recusa converter texto com linhas demais ou longas demais', () => {
    const many = create({ kind: 'text', body: Array.from({ length: 201 }, (_, i) => `l${i}`).join('\n') });
    expectDomainError(() => many.patch({ kind: 'checklist' }, LATER, ids()), 'VALIDATION_FAILED', 'kind');
    const long = create({ kind: 'text', body: 'x'.repeat(501) });
    expectDomainError(() => long.patch({ kind: 'checklist' }, LATER, ids()), 'VALIDATION_FAILED', 'kind');
  });

  it('recusa converter checklist cujo texto passaria do limite', () => {
    const items = Array.from({ length: 200 }, () => ({ text: 'x'.repeat(500) }));
    const note = create({ kind: 'checklist', items });
    expectDomainError(() => note.patch({ kind: 'text' }, LATER, ids()), 'VALIDATION_FAILED', 'kind');
  });

  it('converter mantém o título da nota', () => {
    const note = create({ kind: 'text', title: '', body: 'a' });
    note.patch({ title: 'agora tem título' }, LATER, ids());
    note.patch({ kind: 'checklist' }, LATER, ids());
    expect(note.toSnapshot().items).toHaveLength(1);
  });
});

describe('Note: restauração', () => {
  it('restore + toSnapshot devolvem os mesmos dados, sem compartilhar referências', () => {
    const original = create({ kind: 'checklist', title: 'L', items: [{ text: 'a' }], labels: ['x'] });
    const snapshot = original.toSnapshot();
    const restored = Note.restore(snapshot);
    expect(restored.toSnapshot()).toEqual(snapshot);
    snapshot.labels.push('mudou');
    expect(restored.toSnapshot().labels).toEqual(['x']);
    expect(restored.id).toBe('n1');
    expect(restored.ownerId).toBe(OWNER);
    expect(restored.kind).toBe('checklist');
  });
});
