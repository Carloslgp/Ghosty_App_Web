import { EntitySchema, type EntitySchemaColumnOptions } from 'typeorm';

export type DbProvider = 'sqlite' | 'mssql';

// ---------- Linhas (o formato das tabelas) ----------

export interface AccountRow {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  secretCodeHash: string | null;
  failedCodeAttempts: number;
  codeLockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenRow {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ContactRow {
  id: string;
  accountId: string;
  nicknameEnc: string;
  channel: string | null;
  telegramChatIdEnc: string | null;
  telegramChatIdHash: string | null;
  position: number;
  status: string;
  inviteTokenHash: string | null;
  inviteExpiresAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
}

export interface AlertSettingsRow {
  accountId: string;
  messageTemplateEnc: string;
  includeLocation: boolean;
  countdownSeconds: number;
  checkInToleranceMinutes: number;
  reviewedAt: Date | null;
}

export interface CheckInRow {
  id: string;
  accountId: string;
  destinationEnc: string;
  dueAt: Date;
  toleranceMinutes: number;
  status: string;
  mode: string;
  version: number;
  confirmedAt: Date | null;
  expiredAt: Date | null;
  createdAt: Date;
}

export interface HelpRequestRow {
  id: string;
  accountId: string;
  origin: string;
  mode: string;
  status: string;
  locationEnc: string | null;
  accuracyMeters: number | null;
  checkInId: string | null;
  createdAt: Date;
  dispatchedAt: Date | null;
}

export interface DeliveryStepRow {
  id: string;
  helpRequestId: string;
  stepOrder: number;
  contactId: string | null;
  channel: string;
  messageEnc: string | null;
  outcome: string;
  errorCode: string | null;
  occurredAt: Date;
}

export interface OutboxRow {
  id: string;
  type: string;
  payload: string;
  correlationId: string;
  visibleAfter: Date | null;
  createdAt: Date;
  publishedAt: Date | null;
  attempts: number;
}

export interface ProcessedMessageRow {
  messageId: string;
  processedAt: Date;
}

export interface IdempotencyKeyRow {
  accountId: string;
  key: string;
  resourceId: string;
  createdAt: Date;
}

// ---------- Tipos de coluna por provedor ----------

/**
 * Os ids (UUID v7) ficam em texto nos dois bancos: o `uniqueidentifier` do SQL Server ordena pelos
 * últimos bytes e desfaria a ordem por horário do v7, além de devolver o valor em maiúsculas.
 */
function columns(provider: DbProvider) {
  const mssql = provider === 'mssql';
  const make =
    (options: EntitySchemaColumnOptions) =>
    (name: string, extra: Partial<EntitySchemaColumnOptions> = {}): EntitySchemaColumnOptions => ({
      ...options,
      name,
      ...extra,
    });
  return {
    id: make({ type: 'varchar', length: 36 }),
    text: (length: number) => make({ type: mssql ? 'nvarchar' : 'varchar', length }),
    ascii: (length: number) => make({ type: 'varchar', length }),
    /** Campos cifrados e JSON. */
    long: make(mssql ? { type: 'nvarchar', length: 'MAX' } : { type: 'text' }),
    int: make({ type: 'int' }),
    float: make({ type: mssql ? 'float' : 'real' }),
    bool: make({ type: mssql ? 'bit' : 'boolean' }),
    date: make({ type: mssql ? 'datetimeoffset' : 'datetime' }),
  };
}

export const TABLES = {
  accounts: 'Accounts',
  refreshTokens: 'RefreshTokens',
  contacts: 'Contacts',
  alertSettings: 'AlertSettings',
  checkIns: 'CheckIns',
  helpRequests: 'HelpRequests',
  deliverySteps: 'DeliverySteps',
  outbox: 'Outbox',
  processedMessages: 'ProcessedMessages',
  idempotencyKeys: 'IdempotencyKeys',
} as const;

export function buildSchemas(provider: DbProvider) {
  const c = columns(provider);
  const nullable = { nullable: true };

  const accounts = new EntitySchema<AccountRow>({
    name: TABLES.accounts,
    tableName: TABLES.accounts,
    columns: {
      id: c.id('Id', { primary: true }),
      email: c.ascii(254)('Email', { unique: true }),
      displayName: c.text(80)('DisplayName'),
      passwordHash: c.ascii(255)('PasswordHash'),
      secretCodeHash: c.ascii(255)('SecretCodeHash', nullable),
      failedCodeAttempts: c.int('FailedCodeAttempts', { default: 0 }),
      codeLockedUntil: c.date('CodeLockedUntil', nullable),
      createdAt: c.date('CreatedAt'),
      updatedAt: c.date('UpdatedAt'),
    },
  });

  const refreshTokens = new EntitySchema<RefreshTokenRow>({
    name: TABLES.refreshTokens,
    tableName: TABLES.refreshTokens,
    columns: {
      id: c.id('Id', { primary: true }),
      accountId: c.id('AccountId'),
      tokenHash: c.ascii(64)('TokenHash', { unique: true }),
      expiresAt: c.date('ExpiresAt'),
      revokedAt: c.date('RevokedAt', nullable),
      createdAt: c.date('CreatedAt'),
    },
    indices: [{ name: 'IX_RefreshTokens_AccountId', columns: ['accountId'] }],
  });

  const contacts = new EntitySchema<ContactRow>({
    name: TABLES.contacts,
    tableName: TABLES.contacts,
    columns: {
      id: c.id('Id', { primary: true }),
      accountId: c.id('AccountId'),
      nicknameEnc: c.long('NicknameEnc'),
      channel: c.ascii(10)('Channel', nullable),
      telegramChatIdEnc: c.long('TelegramChatIdEnc', nullable),
      telegramChatIdHash: c.ascii(64)('TelegramChatIdHash', nullable),
      position: c.int('Position'),
      status: c.ascii(12)('Status'),
      inviteTokenHash: c.ascii(64)('InviteTokenHash', nullable),
      inviteExpiresAt: c.date('InviteExpiresAt', nullable),
      respondedAt: c.date('RespondedAt', nullable),
      createdAt: c.date('CreatedAt'),
    },
    indices: [
      { name: 'IX_Contacts_AccountId', columns: ['accountId'] },
      { name: 'IX_Contacts_InviteTokenHash', columns: ['inviteTokenHash'] },
      { name: 'IX_Contacts_TelegramChatIdHash', columns: ['telegramChatIdHash'] },
    ],
  });

  const alertSettings = new EntitySchema<AlertSettingsRow>({
    name: TABLES.alertSettings,
    tableName: TABLES.alertSettings,
    columns: {
      accountId: c.id('AccountId', { primary: true }),
      messageTemplateEnc: c.long('MessageTemplateEnc'),
      includeLocation: c.bool('IncludeLocation'),
      countdownSeconds: c.int('CountdownSeconds'),
      checkInToleranceMinutes: c.int('CheckInToleranceMinutes'),
      reviewedAt: c.date('ReviewedAt', nullable),
    },
  });

  const checkIns = new EntitySchema<CheckInRow>({
    name: TABLES.checkIns,
    tableName: TABLES.checkIns,
    columns: {
      id: c.id('Id', { primary: true }),
      accountId: c.id('AccountId'),
      destinationEnc: c.long('DestinationEnc'),
      dueAt: c.date('DueAt'),
      toleranceMinutes: c.int('ToleranceMinutes'),
      status: c.ascii(12)('Status'),
      mode: c.ascii(8)('Mode'),
      version: c.int('Version'),
      confirmedAt: c.date('ConfirmedAt', nullable),
      expiredAt: c.date('ExpiredAt', nullable),
      createdAt: c.date('CreatedAt'),
    },
    indices: [{ name: 'IX_CheckIns_AccountId_Status', columns: ['accountId', 'status'] }],
  });

  const helpRequests = new EntitySchema<HelpRequestRow>({
    name: TABLES.helpRequests,
    tableName: TABLES.helpRequests,
    columns: {
      id: c.id('Id', { primary: true }),
      accountId: c.id('AccountId'),
      origin: c.ascii(12)('Origin'),
      mode: c.ascii(8)('Mode'),
      status: c.ascii(12)('Status'),
      locationEnc: c.long('LocationEnc', nullable),
      accuracyMeters: c.float('AccuracyMeters', nullable),
      checkInId: c.id('CheckInId', nullable),
      createdAt: c.date('CreatedAt'),
      dispatchedAt: c.date('DispatchedAt', nullable),
    },
    indices: [{ name: 'IX_HelpRequests_AccountId_CreatedAt', columns: ['accountId', 'createdAt'] }],
  });

  const deliverySteps = new EntitySchema<DeliveryStepRow>({
    name: TABLES.deliverySteps,
    tableName: TABLES.deliverySteps,
    columns: {
      id: c.id('Id', { primary: true }),
      helpRequestId: c.id('HelpRequestId'),
      stepOrder: c.int('StepOrder'),
      contactId: c.id('ContactId', nullable),
      channel: c.ascii(10)('Channel'),
      messageEnc: c.long('MessageEnc', nullable),
      outcome: c.ascii(24)('Outcome'),
      errorCode: c.ascii(64)('ErrorCode', nullable),
      occurredAt: c.date('OccurredAt'),
    },
    // Reprocessar a mesma mensagem não duplica passos.
    uniques: [{ name: 'UQ_DeliverySteps_HelpRequest_Step', columns: ['helpRequestId', 'stepOrder'] }],
    indices: [{ name: 'IX_DeliverySteps_ContactId_Outcome', columns: ['contactId', 'outcome'] }],
  });

  const outbox = new EntitySchema<OutboxRow>({
    name: TABLES.outbox,
    tableName: TABLES.outbox,
    columns: {
      id: c.id('Id', { primary: true }),
      type: c.ascii(100)('Type'),
      payload: c.long('Payload'),
      correlationId: c.ascii(100)('CorrelationId'),
      visibleAfter: c.date('VisibleAfter', nullable),
      createdAt: c.date('CreatedAt'),
      publishedAt: c.date('PublishedAt', nullable),
      attempts: c.int('Attempts', { default: 0 }),
    },
    indices: [{ name: 'IX_Outbox_PublishedAt_CreatedAt', columns: ['publishedAt', 'createdAt'] }],
  });

  const processedMessages = new EntitySchema<ProcessedMessageRow>({
    name: TABLES.processedMessages,
    tableName: TABLES.processedMessages,
    columns: {
      messageId: c.ascii(100)('MessageId', { primary: true }),
      processedAt: c.date('ProcessedAt'),
    },
  });

  const idempotencyKeys = new EntitySchema<IdempotencyKeyRow>({
    name: TABLES.idempotencyKeys,
    tableName: TABLES.idempotencyKeys,
    columns: {
      accountId: c.id('AccountId', { primary: true }),
      key: c.ascii(100)('Key', { primary: true }),
      resourceId: c.id('ResourceId'),
      createdAt: c.date('CreatedAt'),
    },
  });

  return {
    accounts,
    refreshTokens,
    contacts,
    alertSettings,
    checkIns,
    helpRequests,
    deliverySteps,
    outbox,
    processedMessages,
    idempotencyKeys,
  };
}

export type Schemas = ReturnType<typeof buildSchemas>;
