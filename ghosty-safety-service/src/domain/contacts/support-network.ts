import { DomainError } from '../shared/domain-error.js';
import { Contact } from './contact.entity.js';

export const MAX_CONTACTS = 10;

/** A rede de apoio de uma conta: no máximo 10 contatos, numa ordem sem buracos (1, 2, 3…). */
export class SupportNetwork {
  private contacts: Contact[];

  constructor(contacts: Contact[]) {
    this.contacts = [...contacts].sort((a, b) => a.position - b.position);
  }

  get ordered(): Contact[] {
    return [...this.contacts];
  }

  /** Posição para um contato novo: o fim da fila. */
  nextPosition(): number {
    if (this.contacts.length >= MAX_CONTACTS) {
      throw DomainError.invalidState(`A rede de apoio já tem ${MAX_CONTACTS} contatos.`);
    }
    return this.contacts.length + 1;
  }

  /** Recebe todos os ids na nova ordem. Faltar, sobrar ou repetir um id é recusado. */
  reorder(contactIds: string[]): Contact[] {
    const known = new Set(this.contacts.map((contact) => contact.id));
    const sameSet =
      contactIds.length === known.size &&
      new Set(contactIds).size === contactIds.length &&
      contactIds.every((id) => known.has(id));
    if (!sameSet)
      throw DomainError.invalidField('contactIds', 'envie todos os contatos da rede, uma vez cada');
    const byId = new Map(this.contacts.map((contact) => [contact.id, contact]));
    return contactIds.map((id, index) => {
      const contact = byId.get(id) as Contact;
      contact.moveTo(index + 1);
      return contact;
    });
  }

  /** Tira um contato e compacta as posições dos demais. Devolve os que mudaram de posição. */
  remove(contactId: string): Contact[] {
    const changed: Contact[] = [];
    this.contacts = this.contacts.filter((contact) => contact.id !== contactId);
    let position = 1;
    for (const contact of this.contacts) {
      if (contact.position !== position) {
        contact.moveTo(position);
        changed.push(contact);
      }
      position += 1;
    }
    return changed;
  }
}
