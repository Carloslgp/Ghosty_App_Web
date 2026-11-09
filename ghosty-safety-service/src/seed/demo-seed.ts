import type { Clock } from '../application/ports/clock.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { OpaqueTokens } from '../application/ports/opaque-tokens.js';
import type { PasswordHasher } from '../application/ports/password-hasher.js';
import { inviteUrl, type SafetyConfig } from '../application/ports/safety-config.js';
import type { UnitOfWork } from '../application/ports/unit-of-work.js';
import { Account, assertSecretCodeFormat, normalizeEmail } from '../domain/accounts/account.entity.js';
import { AlertSettings, DEFAULT_MESSAGE_TEMPLATE } from '../domain/alert-settings/alert-settings.entity.js';
import { Contact } from '../domain/contacts/contact.entity.js';
import type { DeliveryStep } from '../domain/help-requests/delivery-step.js';
import { HelpRequest } from '../domain/help-requests/help-request.entity.js';

export const DEMO_EMAIL = 'maria.exemplo@example.com';
export const DEMO_DISPLAY_NAME = 'Maria Exemplo';

const DAY = 24 * 60 * 60 * 1000;

export interface DemoSeedParams {
  /** UUID fixo, o mesmo usado pelo seed do notes-service. */
  accountId: string;
  /** Vêm do `.env` do seed, nunca do código. */
  password: string;
  lockCode: string;
  /** Chat do Telegram de quem vai fazer o papel da Ana. Sem ele, a Ana fica no canal web. */
  telegramChatId?: string;
}

export interface DemoSeedDeps {
  uow: UnitOfWork;
  hasher: PasswordHasher;
  tokens: OpaqueTokens;
  clock: Clock;
  ids: IdGenerator;
  config: SafetyConfig;
}

export interface DemoSeedResult {
  accountId: string;
  email: string;
  contacts: { nickname: string; status: string; channel: string | null; inviteUrl: string }[];
  safeTestId: string;
}

/** Apaga só os dados da conta de demonstração (pelo id e pelo e-mail). Devolve se havia algo. */
export async function resetDemo(uow: UnitOfWork, accountId: string): Promise<boolean> {
  return uow.run(async ({ accounts }) => {
    const byEmail = await accounts.findByEmail(DEMO_EMAIL);
    const ids = new Set([accountId, ...(byEmail ? [byEmail.id] : [])]);
    let found = false;
    for (const id of ids) {
      if (!(await accounts.findById(id))) continue;
      await accounts.delete(id);
      found = true;
    }
    return found;
  });
}

/**
 * Dados fictícios para o vídeo e para os testes manuais (seção de dados de demonstração do plano):
 * a conta "Maria Exemplo", a rede de apoio (Ana e Beto confirmados, Carla pendente), a mensagem
 * revisada e um Teste seguro de 3 dias atrás, com a linha do tempo. Pode rodar de novo: recomeça do zero.
 */
export async function seedDemo(deps: DemoSeedDeps, params: DemoSeedParams): Promise<DemoSeedResult> {
  const { uow, hasher, tokens, clock, ids, config } = deps;
  assertSecretCodeFormat(params.lockCode);
  const passwordHash = await hasher.hash(params.password);
  const codeHash = await hasher.hash(params.lockCode);
  await resetDemo(uow, params.accountId);

  const now = clock.now();
  return uow.run(async ({ accounts, alertSettings, contacts, helpRequests }) => {
    const account = Account.create({
      id: params.accountId,
      email: normalizeEmail(DEMO_EMAIL),
      displayName: DEMO_DISPLAY_NAME,
      passwordHash,
      now,
    });
    account.setSecretCodeHash(codeHash, now);
    await accounts.insert(account);

    const settings = AlertSettings.createDefault(account.id);
    settings.update(
      {
        messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
        includeLocation: true,
        countdownSeconds: 10,
        checkInToleranceMinutes: 10,
      },
      now,
    );
    await alertSettings.save(settings);

    const invited = (nickname: string, position: number) => {
      const contact = Contact.create({ id: ids.newId(), accountId: account.id, nickname, position, now });
      const { token, hash } = tokens.generate();
      contact.issueInvitation(hash, now, config.inviteTtlHours);
      return { contact, url: inviteUrl(config, token) };
    };
    const ana = invited('Ana', 1);
    if (params.telegramChatId) ana.contact.linkTelegram(params.telegramChatId, now);
    else ana.contact.acceptOnWeb(now);
    const beto = invited('Beto', 2);
    beto.contact.acceptOnWeb(now);
    const carla = invited('Carla', 3);
    const network = [ana, beto, carla];
    for (const { contact } of network) await contacts.insert(contact);

    // Teste seguro de 3 dias atrás: nada foi enviado, todo passo é `would_send`.
    const triggeredAt = new Date(now.getTime() - 3 * DAY);
    const dispatchedAt = new Date(triggeredAt.getTime() + 4_000);
    const test = HelpRequest.trigger({
      id: ids.newId(),
      accountId: account.id,
      origin: 'button',
      mode: 'test',
      location: null,
      checkInId: null,
      now: triggeredAt,
    });
    test.recordDispatch('dispatched', dispatchedAt);
    await helpRequests.insert(test);
    const hour = new Intl.DateTimeFormat('pt-BR', {
      timeZone: config.timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(triggeredAt);
    const text = (nickname: string) =>
      `Oi, ${nickname}. Aqui é ${DEMO_DISPLAY_NAME}. Posso estar em uma situação de risco e preciso de ajuda. ` +
      `Não foi possível obter a localização. Enviado às ${hour}.`;
    const step = (order: number, contact: Contact, confirmed: boolean): DeliveryStep => ({
      id: ids.newId(),
      helpRequestId: test.id,
      stepOrder: order,
      contactId: contact.id,
      channel: confirmed ? (contact.channel ?? 'none') : 'none',
      message: confirmed ? text(contact.nickname) : null,
      outcome: confirmed ? 'would_send' : 'skipped_unconfirmed',
      errorCode: null,
      occurredAt: dispatchedAt,
    });
    await helpRequests.addSteps([
      step(1, ana.contact, true),
      step(2, beto.contact, true),
      step(3, carla.contact, false),
    ]);

    return {
      accountId: account.id,
      email: account.email,
      contacts: network.map(({ contact, url }) => ({
        nickname: contact.nickname,
        status: contact.status,
        channel: contact.channel,
        inviteUrl: url,
      })),
      safeTestId: test.id,
    };
  });
}
