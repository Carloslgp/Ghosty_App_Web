import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import type { Response } from 'express';
import { LockSafetyHandler } from '../../../application/features/safety-session/lock-safety/lock-safety.handler.js';
import {
  UnlockSafetyHandler,
  type SafetySessionView,
} from '../../../application/features/safety-session/unlock-safety/unlock-safety.handler.js';
import { PreviewMessageHandler } from '../../../application/features/message-preview/preview-message.handler.js';
import { SafetyProxyHandler } from '../../../application/features/safety/safety-proxy.handler.js';
import type { MessagePreviewResult } from '../../../application/ports/functions.client.js';
import type { Json } from '../../../application/ports/safety-service.client.js';
import type { RequestMeta } from '../../../application/ports/upstream-error.js';
import { ApiProblems } from '../../platform/openapi.js';
import { CurrentAccount, Meta, SafetyArea } from '../../shared/guards.js';
import { reply, uuidParam } from '../../shared/proxy.js';

export class UnlockSafetyRequest {
  @ApiProperty({ pattern: '^[0-9]{6,8}$' })
  @Matches(/^[0-9]{6,8}$/, { message: 'de 6 a 8 dígitos' })
  code!: string;
}

export class SafetySessionResponse {
  @ApiProperty({ description: 'JWT `scope=safety`. Vale 10 minutos desde o último uso, até 30 no total.' })
  safetyToken!: string;

  @ApiProperty({ example: 600 })
  expiresIn!: number;

  @ApiProperty({ format: 'uri', description: '`remoteEntry.js` do remote `safety`' })
  remoteUrl!: string;
}

export class LocationDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber({}, { message: 'precisa ser um número' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber({}, { message: 'precisa ser um número' })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'precisa ser um número' })
  @Min(0)
  accuracyMeters?: number | null;
}

export class MessagePreviewRequest {
  @ApiPropertyOptional({ minLength: 1, maxLength: 4096, description: 'Sem este campo, usa o modelo salvo' })
  @IsOptional()
  @IsString()
  @Length(1, 4096, { message: 'entre 1 e 4096 caracteres' })
  template?: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 40,
    description: 'Sem este campo, usa o primeiro contato confirmado',
  })
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'entre 1 e 40 caracteres' })
  contactNickname?: string;

  @ApiPropertyOptional({ type: LocationDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto | null;
}

export class MessagePreviewResponse {
  @ApiProperty()
  text!: string;

  @ApiProperty({ minimum: 0 })
  characters!: number;

  @ApiProperty({ enum: [4096] })
  limit!: number;

  @ApiProperty()
  withinLimit!: boolean;

  @ApiProperty({ type: String, format: 'uri', nullable: true })
  mapUrl!: string | null;
}

/** Desbloqueio e bloqueio da área de segurança. */
@ApiTags('safety-session')
@ApiBearerAuth('bearerAuth')
@Controller('safety/session')
export class SafetySessionController {
  constructor(
    @Inject(UnlockSafetyHandler) private readonly unlock: UnlockSafetyHandler,
    @Inject(LockSafetyHandler) private readonly lock: LockSafetyHandler,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'unlockSafety',
    summary: 'Desbloqueia a área de segurança',
    description:
      'Código certo: token da sessão segura e a URL do remote `safety`. Código errado ou conta bloqueada: ' +
      '**403, sempre igual**. O cliente não deve repetir esta chamada automaticamente.',
  })
  @ApiOkResponse({ type: SafetySessionResponse })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  open(
    @CurrentAccount() accountId: string,
    @Body() body: UnlockSafetyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<SafetySessionView> {
    return this.unlock.execute({ accountId, code: body.code }, meta);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'lockSafety',
    summary: 'Saída rápida: revoga a sessão segura',
    description:
      'Revoga o token enviado em `X-Safety-Token`. Responde 204 mesmo se o token já tiver vencido.',
  })
  @ApiHeader({ name: 'X-Safety-Token', required: false })
  @ApiNoContentResponse({ description: 'Sessão segura encerrada' })
  @ApiProblems('UNAUTHENTICATED', 'INTERNAL_ERROR')
  async close(
    @CurrentAccount() accountId: string,
    @Headers('x-safety-token') safetyToken: string | undefined,
  ): Promise<void> {
    await this.lock.execute({ accountId, safetyToken });
  }
}

/**
 * Rede de apoio, convite e mensagem: exigem o JWT e o `X-Safety-Token`, e são repassadas ao
 * safety-service, que valida os campos (o erro volta em Problem Details, com o mesmo `code`).
 */
@ApiTags('safety')
@ApiBearerAuth('bearerAuth')
@ApiSecurity('safetyToken')
@SafetyArea()
@Controller('safety')
export class SafetyController {
  constructor(
    @Inject(SafetyProxyHandler) private readonly safety: SafetyProxyHandler,
    @Inject(PreviewMessageHandler) private readonly preview: PreviewMessageHandler,
  ) {}

  private async forward(
    res: Response,
    accountId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: Json | undefined,
    meta: RequestMeta,
  ): Promise<unknown> {
    return reply(res, await this.safety.forward(accountId, method, path, body, meta));
  }

  @Get('contacts')
  @ApiOperation({ operationId: 'listContacts', summary: 'Lista a rede de apoio, na ordem' })
  @ApiProblems('UNAUTHENTICATED', 'FORBIDDEN', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  listContacts(
    @CurrentAccount() a: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'GET', '/contacts', undefined, m);
  }

  @Post('contacts')
  @ApiOperation({ operationId: 'addContact', summary: 'Adiciona um contato (só o apelido)' })
  @ApiBody({ schema: { type: 'object', properties: { nickname: { type: 'string', maxLength: 40 } } } })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'INVALID_STATE',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  addContact(
    @CurrentAccount() a: string,
    @Body() body: Json,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'POST', '/contacts', body, m);
  }

  @Put('contacts/order')
  @ApiOperation({ operationId: 'reorderContacts', summary: 'Reordena a rede (todos os ids, na nova ordem)' })
  @ApiBody({
    schema: { type: 'object', properties: { contactIds: { type: 'array', items: { type: 'string' } } } },
  })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  reorder(
    @CurrentAccount() a: string,
    @Body() body: Json,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'PUT', '/contacts/order', body, m);
  }

  @Get('contacts/:contactId')
  @ApiOperation({ operationId: 'getContact', summary: 'Busca um contato' })
  @ApiParam({ name: 'contactId', schema: { type: 'string', format: 'uuid' } })
  @ApiProblems(
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  getContact(
    @CurrentAccount() a: string,
    @Param('contactId') id: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'GET', `/contacts/${uuidParam(id)}`, undefined, m);
  }

  @Put('contacts/:contactId')
  @ApiOperation({ operationId: 'updateContact', summary: 'Altera o apelido' })
  @ApiParam({ name: 'contactId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: { type: 'object', properties: { nickname: { type: 'string', maxLength: 40 } } } })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  updateContact(
    @CurrentAccount() a: string,
    @Param('contactId') id: string,
    @Body() body: Json,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'PUT', `/contacts/${uuidParam(id)}`, body, m);
  }

  @Delete('contacts/:contactId')
  @ApiOperation({
    operationId: 'removeContact',
    summary: 'Remove um contato (o link do convite deixa de valer)',
  })
  @ApiParam({ name: 'contactId', schema: { type: 'string', format: 'uuid' } })
  @ApiProblems(
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  removeContact(
    @CurrentAccount() a: string,
    @Param('contactId') id: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'DELETE', `/contacts/${uuidParam(id)}`, undefined, m);
  }

  @Post('contacts/:contactId/invitation')
  @ApiOperation({
    operationId: 'createInvitation',
    summary: 'Gera um convite novo (72 horas para responder)',
  })
  @ApiParam({ name: 'contactId', schema: { type: 'string', format: 'uuid' } })
  @ApiProblems(
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  invite(
    @CurrentAccount() a: string,
    @Param('contactId') id: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'POST', `/contacts/${uuidParam(id)}/invitation`, undefined, m);
  }

  @Get('alert-settings')
  @ApiOperation({ operationId: 'getAlertSettings', summary: 'Mensagem do aviso e preferências' })
  @ApiOkResponse({ description: 'Mesmo formato do `safety-service`' })
  @ApiProblems('UNAUTHENTICATED', 'FORBIDDEN', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  getSettings(
    @CurrentAccount() a: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'GET', '/alert-settings', undefined, m);
  }

  @Put('alert-settings')
  @ApiOperation({
    operationId: 'updateAlertSettings',
    summary: 'Salva a mensagem (fica marcada como revisada)',
  })
  @ApiBody({ schema: { type: 'object' } })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  updateSettings(
    @CurrentAccount() a: string,
    @Body() body: Json,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.forward(res, a, 'PUT', '/alert-settings', body, m);
  }

  @Post('message-preview')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'previewMessage',
    summary: 'Prévia da mensagem',
    description:
      'Encaminhada à Function. O BFF completa o nome da conta. Sem `template`, usa o modelo salvo; sem ' +
      '`contactNickname`, usa o primeiro contato confirmado (ou "contato"). O editor bloqueia o salvar ' +
      'quando `withinLimit` é `false`.',
  })
  @ApiOkResponse({ type: MessagePreviewResponse })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  previewMessage(
    @CurrentAccount() a: string,
    @Body() body: MessagePreviewRequest,
    @Meta() m: RequestMeta,
  ): Promise<MessagePreviewResult> {
    return this.preview.execute(a, body, m);
  }
}
