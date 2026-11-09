import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryNoteRepository, seedNote } from '../../../../../test/fakes/notes.fakes.js';
import { GetNotesSummaryHandler } from './get-notes-summary.handler.js';

const OWNER = '01a15965-b480-79af-a113-29b2fc82e5ef';

describe('GetNotesSummaryHandler', () => {
  it('conta totais, fixadas, arquivadas, recentes e lembretes de hoje no fuso pedido', async () => {
    const notes = new InMemoryNoteRepository();
    const now = new Date('2026-11-06T22:10:00Z'); // 19:10 em São Paulo
    const old = new Date('2026-10-01T12:00:00Z');
    const todayInSaoPaulo = new Date('2026-11-07T02:30:00Z'); // 23:30 do dia 6 em São Paulo
    const tomorrowInSaoPaulo = new Date('2026-11-07T03:30:00Z'); // 00:30 do dia 7 em São Paulo
    await seedNote(notes, OWNER, { kind: 'text', title: 'fixada', pinned: true }, now);
    await seedNote(notes, OWNER, { kind: 'text', title: 'hoje', reminderAt: todayInSaoPaulo }, now);
    await seedNote(notes, OWNER, { kind: 'text', title: 'amanhã', reminderAt: tomorrowInSaoPaulo }, old);
    await seedNote(notes, OWNER, { kind: 'text', title: 'arquivada', archived: true, reminderAt: now }, old);
    await seedNote(notes, '01a15965-b480-79af-a113-000000000000', { kind: 'text', title: 'outra' }, now);

    const handler = new GetNotesSummaryHandler(notes, new FixedClock(now));
    expect(await handler.execute({ ownerId: OWNER, timezone: 'America/Sao_Paulo' })).toEqual({
      total: 3,
      pinned: 1,
      archived: 1,
      updatedLast14Days: 2,
      remindersToday: 1,
    });
    // Em UTC, "hoje" é o dia 6, e os dois lembretes caem no dia 7.
    expect((await handler.execute({ ownerId: OWNER, timezone: 'UTC' })).remindersToday).toBe(0);
    // Sem fuso, vale America/Sao_Paulo.
    expect((await handler.execute({ ownerId: OWNER, timezone: '' })).remindersToday).toBe(1);
  });

  it('fuso desconhecido é recusado', async () => {
    const handler = new GetNotesSummaryHandler(new InMemoryNoteRepository(), new FixedClock(new Date()));
    await expect(handler.execute({ ownerId: OWNER, timezone: 'Marte/Base' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
