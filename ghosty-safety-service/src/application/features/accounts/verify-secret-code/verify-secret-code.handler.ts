import type { Clock } from '../../../ports/clock.js';
import type { PasswordHasher } from '../../../ports/password-hasher.js';
import type { SafetyConfig } from '../../../ports/safety-config.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError, UnauthenticatedError } from '../../../shared/errors.js';

export interface VerifySecretCodeCommand {
  accountId: string;
  code: string;
}

/**
 * Código certo: as tentativas voltam a zero. Código errado, conta sem código ou conta bloqueada:
 * sempre a mesma resposta (401), para não revelar o estado da conta. Cada erro conta uma tentativa
 * e é gravado antes da resposta; ao chegar no limite, a conta fica bloqueada, sem aviso.
 */
export class VerifySecretCodeHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly config: SafetyConfig,
  ) {}

  async execute(command: VerifySecretCodeCommand): Promise<void> {
    const now = this.clock.now();
    const account = await this.uow.run(({ accounts }) => accounts.findById(command.accountId));
    if (!account) throw new NotFoundError('Conta não encontrada.');

    const codeHash = account.secretCodeHash;
    const locked = account.isCodeLocked(now);
    // Formato inválido também é só "código errado": nada de 400, que revelaria a regra.
    const correct =
      !locked &&
      codeHash !== null &&
      /^[0-9]{6,8}$/.test(command.code) &&
      (await this.hasher.verify(codeHash, command.code));

    await this.uow.run(async ({ accounts }) => {
      const fresh = await accounts.findById(command.accountId);
      if (!fresh || locked || codeHash === null) return;
      if (correct) fresh.registerCorrectCode(now);
      else fresh.registerFailedCodeAttempt(now, this.config.codeLock);
      await accounts.update(fresh);
    });
    if (!correct) throw new UnauthenticatedError();
  }
}
