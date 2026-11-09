import type { Account } from '../../domain/accounts/account.entity.js';
import type { AlertSettings } from '../../domain/alert-settings/alert-settings.entity.js';
import type { Contact, ContactChannel, ContactStatus } from '../../domain/contacts/contact.entity.js';

const iso = (date: Date | null) => date?.toISOString() ?? null;

export interface AccountView {
  id: string;
  email: string;
  displayName: string;
  secretCodeSet: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toAccountView(account: Account): AccountView {
  const s = account.toSnapshot();
  return {
    id: s.id,
    email: s.email,
    displayName: s.displayName,
    secretCodeSet: s.secretCodeHash !== null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export interface ContactView {
  id: string;
  nickname: string;
  position: number;
  status: ContactStatus;
  channel: ContactChannel | null;
  inviteExpiresAt: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export function toContactView(contact: Contact): ContactView {
  const s = contact.toSnapshot();
  return {
    id: s.id,
    nickname: s.nickname,
    position: s.position,
    status: s.status,
    channel: s.channel,
    inviteExpiresAt: iso(s.inviteExpiresAt),
    respondedAt: iso(s.respondedAt),
    createdAt: s.createdAt.toISOString(),
  };
}

export interface AlertSettingsView {
  messageTemplate: string;
  includeLocation: boolean;
  countdownSeconds: number;
  checkInToleranceMinutes: number;
  reviewed: boolean;
  reviewedAt: string | null;
}

export function toAlertSettingsView(settings: AlertSettings): AlertSettingsView {
  const s = settings.toSnapshot();
  return {
    messageTemplate: s.messageTemplate,
    includeLocation: s.includeLocation,
    countdownSeconds: s.countdownSeconds,
    checkInToleranceMinutes: s.checkInToleranceMinutes,
    reviewed: s.reviewedAt !== null,
    reviewedAt: iso(s.reviewedAt),
  };
}

/** O que a página pública do convite vê: nada além do nome de quem convidou e das opções. */
export interface InvitationView {
  inviterDisplayName: string;
  status: ContactStatus;
  channel: ContactChannel | null;
  expiresAt: string;
  respondable: boolean;
  telegramUrl: string;
}
