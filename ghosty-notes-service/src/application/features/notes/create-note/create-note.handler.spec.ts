import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../../../domain/shared/domain-error.js';
import { FixedClock, InMemoryNoteRepository, SequentialIds } from '../../../../../test/fakes/notes.fakes.js';
import { CreateNoteHandler } from './create-note.handler.js';

const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';

describe('CreateNoteHandler', () => {
  let notes: InMemoryNoteRepository;
  let handler: CreateNoteHandler;

  beforeEach(() => {
    notes = new InMemoryNoteRepository();
    handler = new CreateNoteHandler(
      notes,
      new FixedClock(new Date('2026-11-05T12:00:00Z')),
      new SequentialIds(),
    );
  });

  it('grava a nota e devolve a visão com datas em ISO, versão 1 e itens com UUID', async () => {
    const view = await handler.execute({
      ownerId: OWNER,
      content: {
        kind: 'checklist',
        title: 'Lista do mercado',
        items: [{ text: 'pão' }, { text: 'café', done: true }],
      },
    });
    expect(view).toMatchObject({
      ownerId: OWNER,
      kind: 'checklist',
      title: 'Lista do mercado',
      version: 1,
      reminderAt: null,
      createdAt: '2026-11-05T12:00:00.000Z',
      items: [
        { id: '00000000-0000-7000-8000-000000000001', text: 'pão', done: false },
        { id: '00000000-0000-7000-8000-000000000002', text: 'café', done: true },
      ],
    });
    expect(view).not.toHaveProperty('body');
    expect(await notes.findById(OWNER, view.id)).not.toBeNull();
  });

  it('nota de texto sai com body e sem items', async () => {
    const view = await handler.execute({ ownerId: OWNER, content: { kind: 'text', title: 'Dentista' } });
    expect(view.body).toBe('');
    expect(view).not.toHaveProperty('items');
  });

  it('não grava nada se a regra da nota for violada', async () => {
    await expect(handler.execute({ ownerId: OWNER, content: { kind: 'text' } })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect((await notes.list(OWNER, { archived: false }, { page: 1, pageSize: 10 })).total).toBe(0);
  });
});
