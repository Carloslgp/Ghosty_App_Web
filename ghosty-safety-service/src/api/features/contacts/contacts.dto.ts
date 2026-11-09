import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import {
  CONTACT_CHANNELS,
  CONTACT_STATUSES,
  type ContactChannel,
} from '../../../domain/contacts/contact.entity.js';

export class ContactResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minLength: 1, maxLength: 40 })
  nickname!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ enum: CONTACT_STATUSES })
  status!: string;

  @ApiProperty({ type: String, enum: CONTACT_CHANNELS, nullable: true, description: 'Nulo até o aceite' })
  channel!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  inviteExpiresAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  respondedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ContactListResponse {
  @ApiProperty({ type: [ContactResponse], maxItems: 10 })
  items!: ContactResponse[];
}

export class ContactInput {
  @ApiProperty({ minLength: 1, maxLength: 40, example: 'Ana' })
  @IsString()
  @Length(1, 40, { message: 'entre 1 e 40 caracteres' })
  nickname!: string;
}

export class ReorderContactsRequest {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: 10,
    description: 'Todos os ids da rede, na nova ordem',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true, message: 'precisa ser um UUID' })
  contactIds!: string[];
}

export class InvitationCreatedResponse {
  @ApiProperty({ format: 'uuid' })
  contactId!: string;

  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{43}$' })
  token!: string;

  @ApiProperty({ format: 'uri' })
  inviteUrl!: string;

  @ApiProperty({ format: 'uri' })
  telegramUrl!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class InvitationViewResponse {
  @ApiProperty()
  inviterDisplayName!: string;

  @ApiProperty({ enum: CONTACT_STATUSES })
  status!: string;

  @ApiProperty({ type: String, enum: CONTACT_CHANNELS, nullable: true })
  channel!: string | null;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ description: 'Se ainda dá para aceitar ou recusar' })
  respondable!: boolean;

  @ApiProperty({ format: 'uri' })
  telegramUrl!: string;
}

export class AcceptInvitationRequest {
  @ApiProperty({ enum: CONTACT_CHANNELS })
  @IsIn(CONTACT_CHANNELS, { message: 'use telegram ou web' })
  channel!: ContactChannel;
}

export class InvitationAlertItem {
  @ApiProperty({ format: 'uuid' })
  helpRequestId!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ format: 'date-time' })
  publishedAt!: string;
}

export class InvitationAlertsResponse {
  @ApiProperty({ type: [InvitationAlertItem] })
  items!: InvitationAlertItem[];
}

export class InvitationAlertsQuery {
  @ApiPropertyOptional({ format: 'date-time', description: 'Só os avisos publicados depois deste instante' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'data em ISO 8601' })
  since?: string;
}
