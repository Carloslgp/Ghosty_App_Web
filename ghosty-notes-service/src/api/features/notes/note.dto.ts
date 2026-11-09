import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { NOTE_COLORS, type NoteColor } from '../../../domain/notes/note-color.js';
import { NOTE_KINDS, type NoteKind } from '../../../domain/notes/note-kind.js';
import { NOTE_LIMITS } from '../../../domain/notes/note-limits.js';
import type { NoteContent, NotePatch } from '../../../domain/notes/note.entity.js';

const max = (n: number) => ({ message: `máximo de ${n} caracteres` });
const OBJECT_ID_PATTERN = '^[0-9a-f]{24}$';

// ---------- Respostas ----------

export class ChecklistItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minLength: 1, maxLength: NOTE_LIMITS.itemText })
  text!: string;

  @ApiProperty()
  done!: boolean;
}

export class NoteResponse {
  @ApiProperty({ pattern: OBJECT_ID_PATTERN, example: '6aec6fc05bd053a2e3d78b78' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiProperty({ enum: NOTE_KINDS })
  kind!: NoteKind;

  @ApiProperty({ maxLength: NOTE_LIMITS.title, description: 'Pode ser vazio se a nota tiver conteúdo' })
  title!: string;

  @ApiPropertyOptional({ maxLength: NOTE_LIMITS.body, description: 'Só em notas `text`' })
  body?: string;

  @ApiPropertyOptional({
    type: [ChecklistItemResponse],
    maxItems: NOTE_LIMITS.items,
    description: 'Só em notas `checklist`',
  })
  items?: ChecklistItemResponse[];

  @ApiProperty({ enum: NOTE_COLORS })
  color!: NoteColor;

  @ApiProperty({ type: [String], maxItems: NOTE_LIMITS.labels })
  labels!: string[];

  @ApiProperty()
  pinned!: boolean;

  @ApiProperty()
  archived!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reminderAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ minimum: 1, description: 'Sobe a cada alteração (concorrência otimista)' })
  version!: number;
}

export class NotePageResponse {
  @ApiProperty({ type: [NoteResponse] })
  items!: NoteResponse[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class NotesSummaryResponse {
  @ApiProperty({ minimum: 0, description: 'Notas não arquivadas' })
  total!: number;

  @ApiProperty({ minimum: 0 })
  pinned!: number;

  @ApiProperty({ minimum: 0 })
  archived!: number;

  @ApiProperty({ minimum: 0 })
  updatedLast14Days!: number;

  @ApiProperty({ minimum: 0 })
  remindersToday!: number;
}

// ---------- Requisições ----------

export class ChecklistItemInput {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Id de um item que já existe. Sem `id`, o item é novo.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'precisa ser um UUID' })
  id?: string;

  @ApiProperty({ minLength: 1, maxLength: NOTE_LIMITS.itemText })
  @IsString()
  @Length(1, NOTE_LIMITS.itemText, { message: `entre 1 e ${NOTE_LIMITS.itemText} caracteres` })
  text!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

/** Campos comuns da criação e da substituição. */
abstract class NoteContentRequest {
  @ApiProperty({ enum: NOTE_KINDS })
  @IsIn(NOTE_KINDS, { message: 'use text ou checklist' })
  kind!: NoteKind;

  @ApiPropertyOptional({ maxLength: NOTE_LIMITS.title })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_LIMITS.title, max(NOTE_LIMITS.title))
  title?: string;

  @ApiPropertyOptional({ maxLength: NOTE_LIMITS.body, description: 'Só em notas `text`' })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_LIMITS.body, max(NOTE_LIMITS.body))
  body?: string;

  @ApiPropertyOptional({
    type: [ChecklistItemInput],
    maxItems: NOTE_LIMITS.items,
    description: 'Só em notas `checklist`',
  })
  @IsOptional()
  @ArrayMaxSize(NOTE_LIMITS.items, { message: `máximo de ${NOTE_LIMITS.items} itens` })
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemInput)
  items?: ChecklistItemInput[];

  @ApiPropertyOptional({ type: [String], maxItems: NOTE_LIMITS.labels })
  @IsOptional()
  @ArrayMaxSize(NOTE_LIMITS.labels, { message: `máximo de ${NOTE_LIMITS.labels} etiquetas` })
  @IsString({ each: true })
  @Length(1, NOTE_LIMITS.label, {
    each: true,
    message: `cada etiqueta tem entre 1 e ${NOTE_LIMITS.label} caracteres`,
  })
  labels?: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true }, { message: 'data em ISO 8601' })
  reminderAt?: string | null;
}

function toContent(
  dto: NoteContentRequest & { color?: NoteColor; pinned?: boolean; archived?: boolean },
): NoteContent {
  return {
    kind: dto.kind,
    title: dto.title,
    body: dto.body,
    items: dto.items?.map((item) => ({ id: item.id, text: item.text, done: item.done })),
    color: dto.color,
    labels: dto.labels,
    pinned: dto.pinned,
    archived: dto.archived,
    reminderAt:
      dto.reminderAt === undefined ? undefined : dto.reminderAt === null ? null : new Date(dto.reminderAt),
  };
}

export class CreateNoteRequest extends NoteContentRequest {
  @ApiPropertyOptional({ enum: NOTE_COLORS, default: 'default' })
  @IsOptional()
  @IsIn(NOTE_COLORS, { message: 'cor desconhecida' })
  color?: NoteColor;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  toContent(): NoteContent {
    return toContent(this);
  }
}

export class UpdateNoteRequest extends NoteContentRequest {
  @ApiProperty({ minimum: 1, description: 'A versão que o cliente leu' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: NOTE_COLORS })
  @IsIn(NOTE_COLORS, { message: 'cor desconhecida' })
  color!: NoteColor;

  @ApiProperty()
  @IsBoolean()
  pinned!: boolean;

  @ApiProperty()
  @IsBoolean()
  archived!: boolean;

  toContent(): NoteContent {
    return toContent(this);
  }
}

export class ItemToggle {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'precisa ser um UUID' })
  id!: string;

  @ApiProperty()
  @IsBoolean()
  done!: boolean;
}

export class PatchNoteRequest {
  @ApiPropertyOptional({ minimum: 1, description: 'Opcional. Se vier, é conferida.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({ maxLength: NOTE_LIMITS.title })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_LIMITS.title, max(NOTE_LIMITS.title))
  title?: string;

  @ApiPropertyOptional({ enum: NOTE_KINDS, description: 'Converte o tipo preservando o texto' })
  @IsOptional()
  @IsIn(NOTE_KINDS, { message: 'use text ou checklist' })
  kind?: NoteKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ enum: NOTE_COLORS })
  @IsOptional()
  @IsIn(NOTE_COLORS, { message: 'cor desconhecida' })
  color?: NoteColor;

  @ApiPropertyOptional({ type: [String], maxItems: NOTE_LIMITS.labels })
  @IsOptional()
  @ArrayMaxSize(NOTE_LIMITS.labels, { message: `máximo de ${NOTE_LIMITS.labels} etiquetas` })
  @IsString({ each: true })
  @Length(1, NOTE_LIMITS.label, {
    each: true,
    message: `cada etiqueta tem entre 1 e ${NOTE_LIMITS.label} caracteres`,
  })
  labels?: string[];

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: '`null` remove o lembrete',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true }, { message: 'data em ISO 8601' })
  reminderAt?: string | null;

  @ApiPropertyOptional({ type: ItemToggle, description: 'Marca ou desmarca um item do checklist' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ItemToggle)
  item?: ItemToggle;

  toPatch(): NotePatch {
    return {
      title: this.title,
      kind: this.kind,
      pinned: this.pinned,
      archived: this.archived,
      color: this.color,
      labels: this.labels,
      reminderAt:
        this.reminderAt === undefined
          ? undefined
          : this.reminderAt === null
            ? null
            : new Date(this.reminderAt),
      item: this.item ? { id: this.item.id, done: this.item.done } : undefined,
    };
  }
}

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListNotesQueryParams {
  @ApiPropertyOptional({
    default: false,
    description: '`false` lista as notas ativas, `true` lista as arquivadas',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'use true ou false' })
  archived?: boolean;

  @ApiPropertyOptional({ minLength: 1, maxLength: NOTE_LIMITS.label })
  @IsOptional()
  @IsString()
  @Length(1, NOTE_LIMITS.label)
  label?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Busca no título, no texto e nos itens (sem diferenciar maiúsculas)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, max(100))
  q?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'máximo de 100' })
  pageSize?: number;
}

export class SummaryQueryParams {
  @ApiPropertyOptional({
    default: 'America/Sao_Paulo',
    maxLength: 64,
    description: 'Fuso horário IANA usado para definir "hoje"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
