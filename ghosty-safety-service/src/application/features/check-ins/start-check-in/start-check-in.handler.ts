import { AlertSettings } from '../../../../domain/alert-settings/alert-settings.entity.js';
import { CheckIn } from '../../../../domain/check-ins/check-in.entity.js';
import { DomainError, type Mode } from '../../../../domain/shared/domain-error.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { checkInDeadlineScheduledMessage } from '../../../shared/events.js';
import { idempotencyKeyHash, idempotencyNotBefore } from '../../../shared/idempotency.js';
import { toCheckInView, type CheckInView } from '../../../shared/views.js';

export interface StartCheckInCommand {
  accountId: string;
  destination: string;
  dueAt: Date;
  /** Sem valor, vale a tolerância configurada na mensagem do aviso. */
  toleranceMinutes?: number;
  mode: Mode;
  idempotencyKey: string;
  correlationId: string;
}

/**
 * Inicia o check-in "cheguei bem" e agenda o prazo (`CheckInDeadlineScheduled`, invisível na fila até
 * `dueAt` + tolerância). Só pode haver um check-in ativo por modo. A mesma `Idempotency-Key` devolve o
 * mesmo check-in, sem agendar de novo.
 */
export class StartCheckInHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  execute(command: StartCheckInCommand): Promise<CheckInView> {
    const now = this.clock.now();
    const keyHash = idempotencyKeyHash(this.tokens, 'check-in', command.idempotencyKey);
    return this.uow.run(
      async ({ accounts, alertSettings, checkIns, helpRequests, idempotencyKeys, outbox }) => {
        const knownId = await idempotencyKeys.find(command.accountId, keyHash, idempotencyNotBefore(now));
        const known = knownId ? await checkIns.findById(command.accountId, knownId) : null;
        if (known) {
          const helpRequestId = (await helpRequests.findIdsByCheckIns([known.id])).get(known.id) ?? null;
          return toCheckInView(known, helpRequestId);
        }

        if (!(await accounts.findById(command.accountId))) throw new NotFoundError('Conta não encontrada.');
        if (await checkIns.findActive(command.accountId, command.mode)) {
          throw DomainError.invalidState('Já existe um check-in ativo.');
        }
        const settings =
          (await alertSettings.findByAccount(command.accountId)) ??
          AlertSettings.createDefault(command.accountId);
        const checkIn = CheckIn.start({
          id: this.ids.newId(),
          accountId: command.accountId,
          destination: command.destination,
          dueAt: command.dueAt,
          toleranceMinutes: command.toleranceMinutes ?? settings.toSnapshot().checkInToleranceMinutes,
          mode: command.mode,
          now,
        });
        await checkIns.insert(checkIn);
        await idempotencyKeys.save(command.accountId, keyHash, checkIn.id, now);
        await outbox.add(
          checkInDeadlineScheduledMessage({
            eventId: this.ids.newId(),
            correlationId: command.correlationId,
            now,
            checkIn,
          }),
        );
        return toCheckInView(checkIn, null);
      },
    );
  }
}
