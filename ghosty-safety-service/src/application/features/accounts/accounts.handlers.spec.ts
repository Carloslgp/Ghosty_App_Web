import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSafetyKit, type SafetyKit } from '../../../../test/support/safety-kit.js';
import { DomainError } from '../../../domain/shared/domain-error.js';
import { EmailInUseError, NotFoundError, UnauthenticatedError } from '../../shared/errors.js';
import { AuthenticateAccountHandler } from './authenticate-account/authenticate-account.handler.js';
import { CreateAccountHandler } from './create-account/create-account.handler.js';
import { DeleteAccountHandler } from './delete-account/delete-account.handler.js';
import { GetAccountHandler } from './get-account/get-account.handler.js';
import { SetSecretCodeHandler } from './set-secret-code/set-secret-code.handler.js';
import { UpdateAccountHandler } from './update-account/update-account.handler.js';
import { VerifySecretCodeHandler } from './verify-secret-code/verify-secret-code.handler.js';

describe('Contas: casos de uso', () => {
  let kit: SafetyKit;
  let accountId: string;

  beforeEach(async () => {
    kit = await createSafetyKit();
    const created = await new CreateAccountHandler(kit.uow, kit.hasher, kit.clock, kit.ids).execute({
      email: ' Maria@Example.com ',
      displayName: 'Maria',
      password: 'senha-forte-1',
    });
    accountId = created.id;
  });

  afterEach(() => kit.close());

  const verify = (code: string) =>
    new VerifySecretCodeHandler(kit.uow, kit.hasher, kit.clock, kit.config).execute({ accountId, code });
  const setCode = (code: string, currentPassword = 'senha-forte-1') =>
    new SetSecretCodeHandler(kit.uow, kit.hasher, kit.clock).execute({ accountId, currentPassword, code });

  it('cria a conta com e-mail normalizado e a mensagem padrão; e-mail repetido dá EMAIL_IN_USE', async () => {
    const view = await new GetAccountHandler(kit.uow).execute({ accountId });
    expect(view).toMatchObject({ email: 'maria@example.com', displayName: 'Maria', secretCodeSet: false });
    expect(await kit.repos(({ alertSettings }) => alertSettings.findByAccount(accountId))).not.toBeNull();
    await expect(
      new CreateAccountHandler(kit.uow, kit.hasher, kit.clock, kit.ids).execute({
        email: 'MARIA@example.com',
        displayName: 'Outra',
        password: 'senha-forte-2',
      }),
    ).rejects.toBeInstanceOf(EmailInUseError);
  });

  it('autentica; e-mail inexistente, inválido e senha errada recebem a mesma resposta', async () => {
    const auth = new AuthenticateAccountHandler(kit.uow, kit.hasher);
    expect((await auth.execute({ email: 'maria@example.com', password: 'senha-forte-1' })).id).toBe(
      accountId,
    );
    for (const attempt of [
      { email: 'maria@example.com', password: 'errada' },
      { email: 'ninguem@example.com', password: 'senha-forte-1' },
      { email: 'invalido', password: 'x' },
    ]) {
      await expect(auth.execute(attempt)).rejects.toBeInstanceOf(UnauthenticatedError);
    }
  });

  it('renomeia e responde 404 para conta inexistente', async () => {
    expect(
      (await new UpdateAccountHandler(kit.uow, kit.clock).execute({ accountId, displayName: ' Ana ' }))
        .displayName,
    ).toBe('Ana');
    await expect(new GetAccountHandler(kit.uow).execute({ accountId: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('o código exige a senha atual, de 6 a 8 dígitos, e fica guardado como hash', async () => {
    await expect(setCode('123456', 'senha-errada')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'currentPassword', message: 'senha atual incorreta' }],
    });
    await expect(setCode('12345')).rejects.toBeInstanceOf(DomainError);
    await setCode('246810');
    const [row] = await kit.query<{ SecretCodeHash: string }>('SELECT SecretCodeHash FROM Accounts');
    expect(row?.SecretCodeHash).toBe('fake$246810');
    expect((await new GetAccountHandler(kit.uow).execute({ accountId })).secretCodeSet).toBe(true);
  });

  it('5 erros bloqueiam por 15 minutos, com a mesma resposta para código errado e conta bloqueada', async () => {
    await setCode('246810');
    for (let i = 0; i < 5; i += 1)
      await expect(verify('000000')).rejects.toBeInstanceOf(UnauthenticatedError);
    // Bloqueada: até o código certo recebe a mesma resposta.
    const locked = await verify('246810').catch((error: unknown) => error);
    const wrong = await verify('000000').catch((error: unknown) => error);
    expect(locked).toBeInstanceOf(UnauthenticatedError);
    expect(wrong).toEqual(locked);

    kit.clock.advance(15 * 60_000);
    await expect(verify('246810')).resolves.toBeUndefined();
  });

  it('código certo zera as tentativas; sem código definido ou com formato inválido também dá 401', async () => {
    await expect(verify('246810')).rejects.toBeInstanceOf(UnauthenticatedError);
    await setCode('246810');
    for (let i = 0; i < 4; i += 1)
      await expect(verify('111111')).rejects.toBeInstanceOf(UnauthenticatedError);
    await verify('246810');
    for (let i = 0; i < 4; i += 1) await expect(verify('abc')).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(verify('246810')).resolves.toBeUndefined();
    await expect(
      new VerifySecretCodeHandler(kit.uow, kit.hasher, kit.clock, kit.config).execute({
        accountId: 'x',
        code: '1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('apaga a conta e tudo o que depende dela', async () => {
    await new DeleteAccountHandler(kit.uow).execute({ accountId });
    expect(await kit.query('SELECT * FROM Accounts')).toHaveLength(0);
    expect(await kit.query('SELECT * FROM AlertSettings')).toHaveLength(0);
    await expect(new DeleteAccountHandler(kit.uow).execute({ accountId })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
