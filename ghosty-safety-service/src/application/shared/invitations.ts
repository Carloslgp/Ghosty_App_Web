import type { Account } from '../../domain/accounts/account.entity.js';
import type { Contact } from '../../domain/contacts/contact.entity.js';
import type { OpaqueTokens } from '../ports/opaque-tokens.js';
import { telegramUrl, type SafetyConfig } from '../ports/safety-config.js';
import type { Repositories } from '../ports/unit-of-work.js';
import { NotFoundError } from './errors.js';
import type { InvitationView } from './views.js';

export interface LoadedInvitation {
  contact: Contact;
  inviter: Account;
}

/** Token desconhecido, de contato removido ou substituído por um convite novo: 404. */
export async function loadInvitation(
  repos: Pick<Repositories, 'contacts' | 'accounts'>,
  tokens: OpaqueTokens,
  token: string,
): Promise<LoadedInvitation> {
  const contact = await repos.contacts.findByInviteTokenHash(tokens.hash(token));
  const inviter = contact ? await repos.accounts.findById(contact.accountId) : null;
  if (!contact || !inviter) throw new NotFoundError('Convite não encontrado.');
  return { contact, inviter };
}

export function toInvitationView(
  { contact, inviter }: LoadedInvitation,
  token: string,
  now: Date,
  config: SafetyConfig,
): InvitationView {
  return {
    inviterDisplayName: inviter.displayName,
    status: contact.status,
    channel: contact.channel,
    expiresAt: (contact.inviteExpiresAt as Date).toISOString(),
    respondable: contact.invitationState(now) === 'open',
    telegramUrl: telegramUrl(config, token),
  };
}
