import { DomainError } from '../shared/domain-error.js';

export const CONTACT_STATUSES = ['pending', 'confirmed', 'declined'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_CHANNELS = ['telegram', 'web'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const NICKNAME_MAX = 40;
export const INVITE_TTL_HOURS_DEFAULT = 72;

export function normalizeNickname(raw: string): string {
  const nickname = raw.trim();
  if (nickname.length === 0 || nickname.length > NICKNAME_MAX) {
    throw DomainError.invalidField('nickname', `entre 1 e ${NICKNAME_MAX} caracteres`);
  }
  return nickname;
}

export interface ContactSnapshot {
  id: string;
  accountId: string;
  nickname: string;
  /** Nulo até o aceite. */
  channel: ContactChannel | null;
  /** Só no canal Telegram. */
  telegramChatId: string | null;
  position: number;
  status: ContactStatus;
  inviteTokenHash: string | null;
  inviteExpiresAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
}

/** Em que pé está o convite do contato, do ponto de vista de quem abre o link. */
export type InvitationState = 'open' | 'expired' | 'answered';

/**
 * Pessoa da rede de apoio. Não existe telefone: o contato escolhe o canal ao aceitar o convite.
 *
 * Máquina de estados: `pending → confirmed | declined`. No Telegram, só vira `confirmed` quando o bot
 * recebe o `/start`; no canal web, na hora do aceite. `/parar` leva `confirmed → declined`.
 * Um convite novo volta o contato para `pending` e invalida o link anterior.
 */
export class Contact {
  private constructor(private state: ContactSnapshot) {}

  static create(params: {
    id: string;
    accountId: string;
    nickname: string;
    position: number;
    now: Date;
  }): Contact {
    return new Contact({
      id: params.id,
      accountId: params.accountId,
      nickname: normalizeNickname(params.nickname),
      channel: null,
      telegramChatId: null,
      position: params.position,
      status: 'pending',
      inviteTokenHash: null,
      inviteExpiresAt: null,
      respondedAt: null,
      createdAt: params.now,
    });
  }

  static restore(snapshot: ContactSnapshot): Contact {
    return new Contact({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get accountId(): string {
    return this.state.accountId;
  }

  get nickname(): string {
    return this.state.nickname;
  }

  get status(): ContactStatus {
    return this.state.status;
  }

  get channel(): ContactChannel | null {
    return this.state.channel;
  }

  get position(): number {
    return this.state.position;
  }

  get telegramChatId(): string | null {
    return this.state.telegramChatId;
  }

  get inviteExpiresAt(): Date | null {
    return this.state.inviteExpiresAt;
  }

  rename(nickname: string): void {
    this.state = { ...this.state, nickname: normalizeNickname(nickname) };
  }

  moveTo(position: number): void {
    this.state = { ...this.state, position };
  }

  /** Novo convite: volta para `pending`, apaga o canal e o chat, e só o novo link vale. */
  issueInvitation(tokenHash: string, now: Date, ttlHours: number): void {
    this.state = {
      ...this.state,
      status: 'pending',
      channel: null,
      telegramChatId: null,
      inviteTokenHash: tokenHash,
      inviteExpiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
      respondedAt: null,
    };
  }

  invitationState(now: Date): InvitationState {
    if (this.state.respondedAt !== null) return 'answered';
    const expiresAt = this.state.inviteExpiresAt;
    if (expiresAt === null || expiresAt.getTime() <= now.getTime()) return 'expired';
    return 'open';
  }

  /** Confere se o convite ainda aceita resposta: vencido dá 410, já respondido dá 409. */
  assertRespondable(now: Date): void {
    const state = this.invitationState(now);
    if (state === 'answered') throw DomainError.invalidState('Este convite já foi respondido.');
    if (state === 'expired') throw new DomainError('INVITATION_EXPIRED', 'O convite venceu sem resposta.');
  }

  acceptOnWeb(now: Date): void {
    this.assertRespondable(now);
    this.state = { ...this.state, status: 'confirmed', channel: 'web', respondedAt: now };
  }

  linkTelegram(chatId: string, now: Date): void {
    this.assertRespondable(now);
    if (!/^-?[0-9]{1,20}$/.test(chatId))
      throw DomainError.invalidField('chatId', 'chat do Telegram inválido');
    this.state = {
      ...this.state,
      status: 'confirmed',
      channel: 'telegram',
      telegramChatId: chatId,
      respondedAt: now,
    };
  }

  decline(now: Date): void {
    this.assertRespondable(now);
    this.state = { ...this.state, status: 'declined', respondedAt: now };
  }

  /** `/parar` no bot: só afeta quem está confirmado no Telegram. Devolve se mudou algo. */
  leaveTelegram(): boolean {
    if (this.state.status !== 'confirmed' || this.state.channel !== 'telegram') return false;
    this.state = { ...this.state, status: 'declined' };
    return true;
  }

  /** O contato do canal web vê os avisos pelo mesmo link enquanto estiver confirmado. */
  canSeeWebAlerts(): boolean {
    return this.state.status === 'confirmed' && this.state.channel === 'web';
  }

  toSnapshot(): ContactSnapshot {
    return { ...this.state };
  }
}
