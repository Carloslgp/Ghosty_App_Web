import type { DeliveryStep } from '../../domain/help-requests/delivery-step.js';
import type { HelpRequest } from '../../domain/help-requests/help-request.entity.js';

export interface HelpRequestRepository {
  /** Sem `accountId`, busca em qualquer conta (uso interno: fila e Function). */
  findById(id: string, accountId?: string): Promise<HelpRequest | null>;
  /** O Teste seguro mais recente da conta. */
  findLatestTest(accountId: string): Promise<HelpRequest | null>;
  insert(request: HelpRequest): Promise<void>;
  update(request: HelpRequest): Promise<void>;
  listSteps(helpRequestId: string): Promise<DeliveryStep[]>;
  addSteps(steps: DeliveryStep[]): Promise<void>;
  /** Passos `published_web` de um contato, do mais novo para o mais antigo. */
  listPublishedWebSteps(contactId: string, after: Date): Promise<DeliveryStep[]>;
}
