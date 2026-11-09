import type { EntityManager } from 'typeorm';
import type { ContactRepository } from '../../../application/ports/contact.repository.js';
import type { FieldCipher } from '../../../application/ports/field-cipher.js';
import {
  Contact,
  type ContactChannel,
  type ContactSnapshot,
  type ContactStatus,
} from '../../../domain/contacts/contact.entity.js';
import type { ContactRow, Schemas } from '../schemas.js';

/** Apelido e chat do Telegram ficam cifrados; o chat também tem um índice cego para a busca do `/parar`. */
export class TypeOrmContactRepository implements ContactRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
    private readonly cipher: FieldCipher,
  ) {}

  private get rows() {
    return this.manager.getRepository(this.schemas.contacts);
  }

  private toDomain(row: ContactRow): Contact {
    return Contact.restore({
      id: row.id,
      accountId: row.accountId,
      nickname: this.cipher.decrypt(row.nicknameEnc),
      channel: row.channel as ContactChannel | null,
      telegramChatId: row.telegramChatIdEnc === null ? null : this.cipher.decrypt(row.telegramChatIdEnc),
      position: row.position,
      status: row.status as ContactStatus,
      inviteTokenHash: row.inviteTokenHash,
      inviteExpiresAt: row.inviteExpiresAt,
      respondedAt: row.respondedAt,
      createdAt: row.createdAt,
    });
  }

  private toRow(s: ContactSnapshot): ContactRow {
    return {
      id: s.id,
      accountId: s.accountId,
      nicknameEnc: this.cipher.encrypt(s.nickname),
      channel: s.channel,
      telegramChatIdEnc: s.telegramChatId === null ? null : this.cipher.encrypt(s.telegramChatId),
      telegramChatIdHash: s.telegramChatId === null ? null : this.cipher.blindIndex(s.telegramChatId),
      position: s.position,
      status: s.status,
      inviteTokenHash: s.inviteTokenHash,
      inviteExpiresAt: s.inviteExpiresAt,
      respondedAt: s.respondedAt,
      createdAt: s.createdAt,
    };
  }

  async listByAccount(accountId: string): Promise<Contact[]> {
    const rows = await this.rows.find({ where: { accountId }, order: { position: 'ASC' } });
    return rows.map((row) => this.toDomain(row));
  }

  async findById(accountId: string, id: string): Promise<Contact | null> {
    const row = await this.rows.findOneBy({ accountId, id });
    return row ? this.toDomain(row) : null;
  }

  async findByInviteTokenHash(tokenHash: string): Promise<Contact | null> {
    const row = await this.rows.findOneBy({ inviteTokenHash: tokenHash });
    return row ? this.toDomain(row) : null;
  }

  async findConfirmedByTelegramChat(chatId: string): Promise<Contact[]> {
    const rows = await this.rows.findBy({
      telegramChatIdHash: this.cipher.blindIndex(chatId),
      channel: 'telegram',
      status: 'confirmed',
    });
    return rows.map((row) => this.toDomain(row));
  }

  async insert(contact: Contact): Promise<void> {
    await this.rows.insert(this.toRow(contact.toSnapshot()));
  }

  async update(contact: Contact): Promise<void> {
    const { id, ...rest } = this.toRow(contact.toSnapshot());
    await this.rows.update({ id }, rest);
  }

  async delete(accountId: string, id: string): Promise<void> {
    await this.rows.delete({ accountId, id });
  }
}
