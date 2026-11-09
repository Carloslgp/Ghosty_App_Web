import type { Account } from '../../domain/accounts/account.entity.js';
import type { AlertSettings } from '../../domain/alert-settings/alert-settings.entity.js';
import type { CheckIn, CheckInStatus } from '../../domain/check-ins/check-in.entity.js';
import type { Contact, ContactChannel, ContactStatus } from '../../domain/contacts/contact.entity.js';
import type {
  DeliveryChannel,
  DeliveryOutcome,
  DeliveryStep,
} from '../../domain/help-requests/delivery-step.js';
import type {
  GeoLocation,
  HelpRequest,
  HelpRequestOrigin,
  HelpRequestStatus,
} from '../../domain/help-requests/help-request.entity.js';
import type { Mode } from '../../domain/shared/domain-error.js';

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

export interface CheckInView {
  id: string;
  destination: string;
  dueAt: string;
  toleranceMinutes: number;
  /** `dueAt` + tolerância. */
  deadlineAt: string;
  status: CheckInStatus;
  mode: Mode;
  version: number;
  createdAt: string;
  confirmedAt: string | null;
  expiredAt: string | null;
  /** O pedido de ajuda criado quando o check-in venceu. */
  helpRequestId: string | null;
}

export function toCheckInView(checkIn: CheckIn, helpRequestId: string | null): CheckInView {
  const s = checkIn.toSnapshot();
  return {
    id: s.id,
    destination: s.destination,
    dueAt: s.dueAt.toISOString(),
    toleranceMinutes: s.toleranceMinutes,
    deadlineAt: checkIn.deadlineAt.toISOString(),
    status: s.status,
    mode: s.mode,
    version: s.version,
    createdAt: s.createdAt.toISOString(),
    confirmedAt: iso(s.confirmedAt),
    expiredAt: iso(s.expiredAt),
    helpRequestId,
  };
}

export interface HelpRequestSummaryView {
  id: string;
  origin: HelpRequestOrigin;
  mode: Mode;
  status: HelpRequestStatus;
  createdAt: string;
  dispatchedAt: string | null;
}

export function toHelpRequestSummaryView(request: HelpRequest): HelpRequestSummaryView {
  const s = request.toSnapshot();
  return {
    id: s.id,
    origin: s.origin,
    mode: s.mode,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    dispatchedAt: iso(s.dispatchedAt),
  };
}

export interface DeliveryStepView {
  id: string;
  stepOrder: number;
  contactId: string | null;
  /** Apelido no momento da leitura (`null` se o contato foi removido). */
  contactNickname: string | null;
  channel: DeliveryChannel;
  outcome: DeliveryOutcome;
  message: string | null;
  errorCode: string | null;
  occurredAt: string;
}

export interface HelpRequestView extends HelpRequestSummaryView {
  location: GeoLocation | null;
  checkInId: string | null;
  /** A linha do tempo do envio, vazia enquanto o status é `triggered`. */
  steps: DeliveryStepView[];
}

export function toHelpRequestView(
  request: HelpRequest,
  steps: DeliveryStep[],
  contacts: Contact[],
): HelpRequestView {
  const s = request.toSnapshot();
  const nicknames = new Map(contacts.map((contact) => [contact.id, contact.nickname]));
  return {
    ...toHelpRequestSummaryView(request),
    location: s.location,
    checkInId: s.checkInId,
    steps: steps.map((step) => ({
      id: step.id,
      stepOrder: step.stepOrder,
      contactId: step.contactId,
      contactNickname: step.contactId === null ? null : (nicknames.get(step.contactId) ?? null),
      channel: step.channel,
      outcome: step.outcome,
      message: step.message,
      errorCode: step.errorCode,
      occurredAt: step.occurredAt.toISOString(),
    })),
  };
}
