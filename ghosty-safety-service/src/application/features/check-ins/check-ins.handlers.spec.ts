import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSafetyKit, type SafetyKit } from '../../../../test/support/safety-kit.js';
import { Account } from '../../../domain/accounts/account.entity.js';
import { DomainError } from '../../../domain/shared/domain-error.js';
import { UpdateAlertSettingsHandler } from '../alert-settings/update-alert-settings/update-alert-settings.handler.js';
import { NotFoundError } from '../../shared/errors.js';
import { CancelCheckInHandler } from './cancel-check-in/cancel-check-in.handler.js';
import { ConfirmArrivalHandler } from './confirm-arrival/confirm-arrival.handler.js';
import { ExpireCheckInHandler } from './expire-check-in/expire-check-in.handler.js';
import { ExtendCheckInHandler } from './extend-check-in/extend-check-in.handler.js';
import { GetCheckInHandler } from './get-check-in/get-check-in.handler.js';
import { ListCheckInsHandler } from './list-check-ins/list-check-ins.handler.js';
import { StartCheckInHandler, type StartCheckInCommand } from './start-check-in/start-check-in.handler.js';

const ACCOUNT = '01a15965-b480-79af-a113-29b2fc82e5ef';
const OTHER = '01a15965-b480-79af-a113-000000000000';
const DEADLINE = 'ghosty.safety.check-in.deadline-scheduled.v1';
const TRIGGERED = 'ghosty.safety.help-request.triggered.v1';
const MINUTE = 60_000;

describe('Check-ins: casos de uso', () => {
  let kit: SafetyKit;
  const inMinutes = (minutes: number) => new Date(kit.clock.now().getTime() + minutes * MINUTE);
  const start = (overrides: Partial<StartCheckInCommand> = {}) =>
    new StartCheckInHandler(kit.uow, kit.tokens, kit.clock, kit.ids).execute({
      accountId: ACCOUNT,
      destination: 'Casa',
      dueAt: inMinutes(30),
      mode: 'real',
      idempotencyKey: 'chave-de-teste-1',
      correlationId: 'corr-1',
      ...overrides,
    });
  const expire = (checkInId: string, version: number) =>
    new ExpireCheckInHandler(kit.uow, kit.clock, kit.ids, kit.config).execute({
      checkInId,
      version,
      correlationId: 'corr-prazo',
    });
  const get = (checkInId: string, accountId = ACCOUNT) =>
    new GetCheckInHandler(kit.uow).execute({ accountId, checkInId });

  beforeEach(async () => {
    kit = await createSafetyKit();
    await kit.repos(({ accounts }) =>
      accounts.insert(
        Account.create({
          id: ACCOUNT,
          email: 'm@example.com',
          displayName: 'Maria',
          passwordHash: 'h',
          now: kit.clock.now(),
        }),
      ),
    );
  });

  afterEach(() => kit.close());

  it('inicia com a tolerância padrão da mensagem, cifra o destino e agenda o prazo com atraso', async () => {
    const checkIn = await start({ destination: ' Casa ' });
    expect(checkIn).toMatchObject({
      destination: 'Casa',
      toleranceMinutes: 10,
      status: 'active',
      mode: 'real',
      version: 1,
      helpRequestId: null,
    });
    expect(checkIn.deadlineAt).toBe(inMinutes(40).toISOString());

    const [event] = await kit.outboxEvents();
    expect(event).toMatchObject({ type: DEADLINE, correlationId: 'corr-1', visibleAfter: inMinutes(40) });
    expect(event?.data).toMatchObject({
      checkInId: checkIn.id,
      accountId: ACCOUNT,
      version: 1,
      mode: 'real',
    });

    const rows = await kit.query<{ DestinationEnc: string }>('SELECT DestinationEnc FROM CheckIns');
    expect(rows[0]?.DestinationEnc.startsWith('v1:')).toBe(true);
    expect(rows[0]?.DestinationEnc).not.toContain('Casa');
  });

  it('usa a tolerância configurada na mensagem quando a requisição não informa', async () => {
    await new UpdateAlertSettingsHandler(kit.uow, kit.clock).execute({
      accountId: ACCOUNT,
      messageTemplate: 'Oi, {apelido}.',
      includeLocation: true,
      countdownSeconds: 10,
      checkInToleranceMinutes: 25,
    });
    expect((await start()).toleranceMinutes).toBe(25);
    expect(
      (await start({ mode: 'test', toleranceMinutes: 0, idempotencyKey: 'outra-chave' })).toleranceMinutes,
    ).toBe(0);
  });

  it('a mesma Idempotency-Key devolve o mesmo check-in e não agenda de novo', async () => {
    const first = await start();
    const again = await start();
    expect(again.id).toBe(first.id);
    expect(await kit.outboxEvents()).toHaveLength(1);
  });

  it('a chave vale por 24 horas: depois disso, é uma tentativa nova', async () => {
    const first = await start();
    await new CancelCheckInHandler(kit.uow).execute({ accountId: ACCOUNT, checkInId: first.id });
    kit.clock.advance(25 * 60 * MINUTE);
    expect((await start()).id).not.toBe(first.id);
  });

  it('só um check-in ativo por modo, e a conta precisa existir', async () => {
    await start();
    await expect(start({ idempotencyKey: 'segunda-chave' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      message: 'Já existe um check-in ativo.',
    });
    // O Teste seguro corre em paralelo ao check-in real.
    await expect(start({ mode: 'test', idempotencyKey: 'chave-do-teste' })).resolves.toMatchObject({
      mode: 'test',
    });
    await expect(start({ accountId: OTHER, idempotencyKey: 'chave-de-outra' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('recusa prazo fora do intervalo de 1 minuto a 24 horas', async () => {
    await expect(start({ dueAt: inMinutes(0) })).rejects.toBeInstanceOf(DomainError);
    await expect(start({ dueAt: inMinutes(24 * 60 + 1) })).rejects.toBeInstanceOf(DomainError);
    await expect(start({ dueAt: new Date('invalida') })).rejects.toBeInstanceOf(DomainError);
    expect(await kit.outboxEvents()).toEqual([]);
  });

  it('estender sobe a versão, agenda um prazo novo e torna o antigo sem efeito', async () => {
    const checkIn = await start();
    const extended = await new ExtendCheckInHandler(kit.uow, kit.clock, kit.ids).execute({
      accountId: ACCOUNT,
      checkInId: checkIn.id,
      dueAt: inMinutes(60),
      toleranceMinutes: 5,
      correlationId: 'corr-2',
    });
    expect(extended).toMatchObject({ version: 2, toleranceMinutes: 5, status: 'active' });
    expect(extended.deadlineAt).toBe(inMinutes(65).toISOString());

    const events = await kit.outboxEvents();
    expect(events.map((event) => event.data.version)).toEqual([1, 2]);
    expect(events[1]?.visibleAfter).toEqual(inMinutes(65));

    // A mensagem do prazo antigo (versão 1) chega e é ignorada.
    expect(await expire(checkIn.id, 1)).toEqual({ result: 'ignored', helpRequestId: null });
    expect((await get(checkIn.id)).status).toBe('active');
  });

  it('cheguei bem: confirma, e a mensagem de prazo que chegar depois é ignorada', async () => {
    const checkIn = await start();
    kit.clock.advance(20 * MINUTE);
    const confirmed = await new ConfirmArrivalHandler(kit.uow, kit.clock).execute({
      accountId: ACCOUNT,
      checkInId: checkIn.id,
    });
    expect(confirmed).toMatchObject({ status: 'confirmed', confirmedAt: kit.clock.now().toISOString() });
    expect(await expire(checkIn.id, 1)).toEqual({ result: 'ignored', helpRequestId: null });
    await expect(
      new ConfirmArrivalHandler(kit.uow, kit.clock).execute({ accountId: ACCOUNT, checkInId: checkIn.id }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('cancelar mantém o registro e libera um check-in novo', async () => {
    const checkIn = await start();
    await new CancelCheckInHandler(kit.uow).execute({ accountId: ACCOUNT, checkInId: checkIn.id });
    expect((await get(checkIn.id)).status).toBe('cancelled');
    await expect(
      new CancelCheckInHandler(kit.uow).execute({ accountId: ACCOUNT, checkInId: checkIn.id }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(start({ idempotencyKey: 'depois-de-cancelar' })).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('o prazo vence: o check-in expira e nasce um pedido de ajuda de origem check_in, com o evento', async () => {
    const checkIn = await start({ mode: 'test', toleranceMinutes: 0, dueAt: inMinutes(1) });
    kit.clock.advance(MINUTE);

    const result = await expire(checkIn.id, 1);
    expect(result.result).toBe('expired');
    expect(await get(checkIn.id)).toMatchObject({
      status: 'expired',
      expiredAt: kit.clock.now().toISOString(),
      helpRequestId: result.helpRequestId,
    });

    const triggered = (await kit.outboxEvents()).filter((event) => event.type === TRIGGERED);
    expect(triggered).toHaveLength(1);
    expect(triggered[0]).toMatchObject({ correlationId: 'corr-prazo', visibleAfter: null });
    expect(triggered[0]?.data).toMatchObject({
      helpRequestId: result.helpRequestId,
      origin: 'check_in',
      checkInId: checkIn.id,
      mode: 'test',
      location: null,
      displayName: 'Maria',
      timezone: 'America/Sao_Paulo',
    });

    // A fila pode entregar a mesma mensagem de novo: o resultado é o mesmo e nada é duplicado.
    expect(await expire(checkIn.id, 1)).toEqual(result);
    expect((await kit.outboxEvents()).filter((event) => event.type === TRIGGERED)).toHaveLength(1);
  });

  it('check-in desconhecido ou de outra conta: 404', async () => {
    const checkIn = await start();
    await expect(expire('01a1b2e9-0000-7000-8000-0000000000ff', 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(get(checkIn.id, OTHER)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      new ExtendCheckInHandler(kit.uow, kit.clock, kit.ids).execute({
        accountId: OTHER,
        checkInId: checkIn.id,
        dueAt: inMinutes(60),
        correlationId: 'c',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lista do mais novo para o mais antigo, com filtros e paginação', async () => {
    const first = await start({ idempotencyKey: 'chave-lista-1' });
    await new CancelCheckInHandler(kit.uow).execute({ accountId: ACCOUNT, checkInId: first.id });
    kit.clock.advance(MINUTE);
    const second = await start({ idempotencyKey: 'chave-lista-2', destination: 'Trabalho' });
    kit.clock.advance(MINUTE);
    const test = await start({ idempotencyKey: 'chave-lista-3', mode: 'test', destination: 'Teste' });

    const list = new ListCheckInsHandler(kit.uow);
    const all = await list.execute({ accountId: ACCOUNT });
    expect(all).toMatchObject({ page: 1, pageSize: 20, total: 3 });
    expect(all.items.map((item) => item.id)).toEqual([test.id, second.id, first.id]);

    expect((await list.execute({ accountId: ACCOUNT, status: 'active', mode: 'real' })).items).toHaveLength(
      1,
    );
    const paged = await list.execute({ accountId: ACCOUNT, page: 2, pageSize: 2 });
    expect(paged).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(paged.items.map((item) => item.id)).toEqual([first.id]);
    expect((await list.execute({ accountId: OTHER })).total).toBe(0);
  });
});
