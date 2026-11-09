import type { Contact } from '../../domain/contacts/contact.entity.js';

export interface ContactRepository {
  /** Na ordem da rede (posição crescente). */
  listByAccount(accountId: string): Promise<Contact[]>;
  findById(accountId: string, id: string): Promise<Contact | null>;
  findByInviteTokenHash(tokenHash: string): Promise<Contact | null>;
  /** Contatos confirmados no Telegram com esse chat, em qualquer conta (o mesmo bot atende várias pessoas). */
  findConfirmedByTelegramChat(chatId: string): Promise<Contact[]>;
  insert(contact: Contact): Promise<void>;
  update(contact: Contact): Promise<void>;
  delete(accountId: string, id: string): Promise<void>;
}
