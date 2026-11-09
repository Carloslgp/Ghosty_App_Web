import { MoreThan, type EntityManager } from 'typeorm';
import type { FieldCipher } from '../../../application/ports/field-cipher.js';
import type { HelpRequestRepository } from '../../../application/ports/help-request.repository.js';
import type {
  DeliveryChannel,
  DeliveryOutcome,
  DeliveryStep,
} from '../../../domain/help-requests/delivery-step.js';
import {
  HelpRequest,
  type HelpRequestOrigin,
  type HelpRequestStatus,
} from '../../../domain/help-requests/help-request.entity.js';
import type { Mode } from '../../../domain/shared/domain-error.js';
import type { DeliveryStepRow, HelpRequestRow, Schemas } from '../schemas.js';

/** A localização e o texto de cada aviso ficam cifrados. */
export class TypeOrmHelpRequestRepository implements HelpRequestRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
    private readonly cipher: FieldCipher,
  ) {}

  private get requests() {
    return this.manager.getRepository(this.schemas.helpRequests);
  }

  private get steps() {
    return this.manager.getRepository(this.schemas.deliverySteps);
  }

  private toDomain(row: HelpRequestRow): HelpRequest {
    const point =
      row.locationEnc === null
        ? null
        : (JSON.parse(this.cipher.decrypt(row.locationEnc)) as { lat: number; lng: number });
    return HelpRequest.restore({
      id: row.id,
      accountId: row.accountId,
      origin: row.origin as HelpRequestOrigin,
      mode: row.mode as Mode,
      status: row.status as HelpRequestStatus,
      location:
        point === null ? null : { lat: point.lat, lng: point.lng, accuracyMeters: row.accuracyMeters },
      checkInId: row.checkInId,
      createdAt: row.createdAt,
      dispatchedAt: row.dispatchedAt,
    });
  }

  private toRow(request: HelpRequest): HelpRequestRow {
    const { location, ...rest } = request.toSnapshot();
    return {
      ...rest,
      locationEnc:
        location === null
          ? null
          : this.cipher.encrypt(JSON.stringify({ lat: location.lat, lng: location.lng })),
      accuracyMeters: location?.accuracyMeters ?? null,
    };
  }

  private stepToDomain(row: DeliveryStepRow): DeliveryStep {
    return {
      id: row.id,
      helpRequestId: row.helpRequestId,
      stepOrder: row.stepOrder,
      contactId: row.contactId,
      channel: row.channel as DeliveryChannel,
      message: row.messageEnc === null ? null : this.cipher.decrypt(row.messageEnc),
      outcome: row.outcome as DeliveryOutcome,
      errorCode: row.errorCode,
      occurredAt: row.occurredAt,
    };
  }

  async findById(id: string, accountId?: string): Promise<HelpRequest | null> {
    const row = await this.requests.findOneBy(accountId ? { id, accountId } : { id });
    return row ? this.toDomain(row) : null;
  }

  async findLatestTest(accountId: string): Promise<HelpRequest | null> {
    const row = await this.requests.findOne({
      where: { accountId, mode: 'test' },
      order: { createdAt: 'DESC' },
    });
    return row ? this.toDomain(row) : null;
  }

  async insert(request: HelpRequest): Promise<void> {
    await this.requests.insert(this.toRow(request));
  }

  async update(request: HelpRequest): Promise<void> {
    const { id, ...rest } = this.toRow(request);
    await this.requests.update({ id }, rest);
  }

  async listSteps(helpRequestId: string): Promise<DeliveryStep[]> {
    const rows = await this.steps.find({ where: { helpRequestId }, order: { stepOrder: 'ASC' } });
    return rows.map((row) => this.stepToDomain(row));
  }

  async addSteps(steps: DeliveryStep[]): Promise<void> {
    if (steps.length === 0) return;
    await this.steps.insert(
      steps.map(({ message, ...step }) => ({
        ...step,
        messageEnc: message === null ? null : this.cipher.encrypt(message),
      })),
    );
  }

  async listPublishedWebSteps(contactId: string, after: Date): Promise<DeliveryStep[]> {
    const rows = await this.steps.find({
      where: { contactId, outcome: 'published_web', occurredAt: MoreThan(after) },
      order: { occurredAt: 'DESC' },
    });
    return rows.map((row) => this.stepToDomain(row));
  }
}
