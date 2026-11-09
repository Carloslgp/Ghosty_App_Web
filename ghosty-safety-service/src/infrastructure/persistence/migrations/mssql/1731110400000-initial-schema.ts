import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial no Azure SQL (SQL Server). Na máquina local, com SQLite, o esquema vem do
 * `synchronize`. O teste `migrations.spec.ts` confere que cada tabela e coluna dos `EntitySchema`
 * aparece aqui, com o tipo esperado.
 *
 * Não há chaves estrangeiras: a exclusão da conta apaga as tabelas filhas explicitamente, na mesma
 * transação (ver `TypeOrmAccountRepository.delete`).
 */
export class InitialSchema1731110400000 implements MigrationInterface {
  name = 'InitialSchema1731110400000';

  static readonly statements = [
    `CREATE TABLE [Accounts] (
      [Id] varchar(36) NOT NULL CONSTRAINT [PK_Accounts] PRIMARY KEY,
      [Email] varchar(254) NOT NULL CONSTRAINT [UQ_Accounts_Email] UNIQUE,
      [DisplayName] nvarchar(80) NOT NULL,
      [PasswordHash] varchar(255) NOT NULL,
      [SecretCodeHash] varchar(255) NULL,
      [FailedCodeAttempts] int NOT NULL CONSTRAINT [DF_Accounts_FailedCodeAttempts] DEFAULT 0,
      [CodeLockedUntil] datetimeoffset NULL,
      [CreatedAt] datetimeoffset NOT NULL,
      [UpdatedAt] datetimeoffset NOT NULL
    )`,
    `CREATE TABLE [RefreshTokens] (
      [Id] varchar(36) NOT NULL CONSTRAINT [PK_RefreshTokens] PRIMARY KEY,
      [AccountId] varchar(36) NOT NULL,
      [TokenHash] varchar(64) NOT NULL CONSTRAINT [UQ_RefreshTokens_TokenHash] UNIQUE,
      [ExpiresAt] datetimeoffset NOT NULL,
      [RevokedAt] datetimeoffset NULL,
      [CreatedAt] datetimeoffset NOT NULL
    )`,
    `CREATE INDEX [IX_RefreshTokens_AccountId] ON [RefreshTokens] ([AccountId])`,
    `CREATE TABLE [Contacts] (
      [Id] varchar(36) NOT NULL CONSTRAINT [PK_Contacts] PRIMARY KEY,
      [AccountId] varchar(36) NOT NULL,
      [NicknameEnc] nvarchar(MAX) NOT NULL,
      [Channel] varchar(10) NULL,
      [TelegramChatIdEnc] nvarchar(MAX) NULL,
      [TelegramChatIdHash] varchar(64) NULL,
      [Position] int NOT NULL,
      [Status] varchar(12) NOT NULL,
      [InviteTokenHash] varchar(64) NULL,
      [InviteExpiresAt] datetimeoffset NULL,
      [RespondedAt] datetimeoffset NULL,
      [CreatedAt] datetimeoffset NOT NULL
    )`,
    `CREATE INDEX [IX_Contacts_AccountId] ON [Contacts] ([AccountId])`,
    `CREATE INDEX [IX_Contacts_InviteTokenHash] ON [Contacts] ([InviteTokenHash])`,
    `CREATE INDEX [IX_Contacts_TelegramChatIdHash] ON [Contacts] ([TelegramChatIdHash])`,
    `CREATE TABLE [AlertSettings] (
      [AccountId] varchar(36) NOT NULL CONSTRAINT [PK_AlertSettings] PRIMARY KEY,
      [MessageTemplateEnc] nvarchar(MAX) NOT NULL,
      [IncludeLocation] bit NOT NULL,
      [CountdownSeconds] int NOT NULL,
      [CheckInToleranceMinutes] int NOT NULL,
      [ReviewedAt] datetimeoffset NULL
    )`,
    `CREATE TABLE [CheckIns] (
      [Id] varchar(36) NOT NULL CONSTRAINT [PK_CheckIns] PRIMARY KEY,
      [AccountId] varchar(36) NOT NULL,
      [DestinationEnc] nvarchar(MAX) NOT NULL,
      [DueAt] datetimeoffset NOT NULL,
      [ToleranceMinutes] int NOT NULL,
      [Status] varchar(12) NOT NULL,
      [Mode] varchar(8) NOT NULL,
      [Version] int NOT NULL,
      [ConfirmedAt] datetimeoffset NULL,
      [ExpiredAt] datetimeoffset NULL,
      [CreatedAt] datetimeoffset NOT NULL
    )`,
    `CREATE INDEX [IX_CheckIns_AccountId_Status] ON [CheckIns] ([AccountId], [Status])`,
    `CREATE TABLE [HelpRequests] (
      [Id] varchar(36) NOT NULL CONSTRAINT [PK_HelpRequests] PRIMARY KEY,
      [AccountId] varchar(36) NOT NULL,
      [Origin] varchar(12) NOT NULL,
      [Mode] varchar(8) NOT NULL,
      [Status] varchar(12) NOT NULL,
      [LocationEnc] nvarchar(MAX) NULL,
      [AccuracyMeters] float NULL,
      [CheckInId] varchar(36) NULL,
      [CreatedAt] datetimeoffset NOT NULL,
      [DispatchedAt] datetimeoffset NULL
    )`,
    `CREATE INDEX [IX_HelpRequests_AccountId_CreatedAt] ON [HelpRequests] ([AccountId], [CreatedAt])`,
    `CREATE TABLE [DeliverySteps] (
      [Id] varchar(36) NOT NULL CONSTRAINT [PK_DeliverySteps] PRIMARY KEY,
      [HelpRequestId] varchar(36) NOT NULL,
      [StepOrder] int NOT NULL,
      [ContactId] varchar(36) NULL,
      [Channel] varchar(10) NOT NULL,
      [MessageEnc] nvarchar(MAX) NULL,
      [Outcome] varchar(24) NOT NULL,
      [ErrorCode] varchar(64) NULL,
      [OccurredAt] datetimeoffset NOT NULL,
      CONSTRAINT [UQ_DeliverySteps_HelpRequest_Step] UNIQUE ([HelpRequestId], [StepOrder])
    )`,
    `CREATE INDEX [IX_DeliverySteps_ContactId_Outcome] ON [DeliverySteps] ([ContactId], [Outcome])`,
    `CREATE TABLE [Outbox] (
      [Id] varchar(36) NOT NULL CONSTRAINT [PK_Outbox] PRIMARY KEY,
      [Type] varchar(100) NOT NULL,
      [Payload] nvarchar(MAX) NOT NULL,
      [CorrelationId] varchar(100) NOT NULL,
      [VisibleAfter] datetimeoffset NULL,
      [CreatedAt] datetimeoffset NOT NULL,
      [PublishedAt] datetimeoffset NULL,
      [Attempts] int NOT NULL CONSTRAINT [DF_Outbox_Attempts] DEFAULT 0
    )`,
    `CREATE INDEX [IX_Outbox_PublishedAt_CreatedAt] ON [Outbox] ([PublishedAt], [CreatedAt])`,
    `CREATE TABLE [ProcessedMessages] (
      [MessageId] varchar(100) NOT NULL CONSTRAINT [PK_ProcessedMessages] PRIMARY KEY,
      [ProcessedAt] datetimeoffset NOT NULL
    )`,
    `CREATE TABLE [IdempotencyKeys] (
      [AccountId] varchar(36) NOT NULL,
      [Key] varchar(100) NOT NULL,
      [ResourceId] varchar(36) NOT NULL,
      [CreatedAt] datetimeoffset NOT NULL,
      CONSTRAINT [PK_IdempotencyKeys] PRIMARY KEY ([AccountId], [Key])
    )`,
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of InitialSchema1731110400000.statements) await queryRunner.query(statement);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'IdempotencyKeys',
      'ProcessedMessages',
      'Outbox',
      'DeliverySteps',
      'HelpRequests',
      'CheckIns',
      'AlertSettings',
      'Contacts',
      'RefreshTokens',
      'Accounts',
    ]) {
      await queryRunner.query(`DROP TABLE [${table}]`);
    }
  }
}
