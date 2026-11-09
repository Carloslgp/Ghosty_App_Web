import { Body, Controller, Delete, Get, HttpCode, Inject, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { AccountHandler, type AccountView } from '../../../application/features/account/account.handler.js';
import type { RequestMeta } from '../../../application/ports/upstream-error.js';
import { ApiProblems } from '../../platform/openapi.js';
import { CurrentAccount, Meta } from '../../shared/guards.js';

export class AccountResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  secretCodeSet!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class UpdateAccountRequest {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80, { message: 'entre 1 e 80 caracteres' })
  displayName!: string;
}

export class SetLockCodeRequest {
  @ApiProperty({ format: 'password', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128, { message: 'entre 1 e 128 caracteres' })
  currentPassword!: string;

  @ApiProperty({ pattern: '^[0-9]{6,8}$' })
  @Matches(/^[0-9]{6,8}$/, { message: 'de 6 a 8 dígitos' })
  code!: string;
}

@ApiTags('account')
@ApiBearerAuth('bearerAuth')
@Controller('account')
export class AccountController {
  constructor(@Inject(AccountHandler) private readonly account: AccountHandler) {}

  @Get()
  @ApiOperation({ operationId: 'getAccount', summary: 'A conta logada' })
  @ApiOkResponse({ type: AccountResponse })
  @ApiProblems('UNAUTHENTICATED', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  get(@CurrentAccount() accountId: string, @Meta() meta: RequestMeta): Promise<AccountView> {
    return this.account.get(accountId, meta);
  }

  @Put()
  @ApiOperation({ operationId: 'updateAccount', summary: 'Altera o nome exibido' })
  @ApiOkResponse({ type: AccountResponse })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  update(
    @CurrentAccount() accountId: string,
    @Body() body: UpdateAccountRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AccountView> {
    return this.account.update(accountId, body.displayName, meta);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteAccount',
    summary: 'Apaga a conta',
    description:
      'Apaga as notas no `notes-service` e a conta (em cascata) no `safety-service`. Também revoga as sessões.',
  })
  @ApiNoContentResponse({ description: 'Conta apagada' })
  @ApiProblems('UNAUTHENTICATED', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  async delete(@CurrentAccount() accountId: string, @Meta() meta: RequestMeta): Promise<void> {
    await this.account.delete(accountId, meta);
  }

  @Put('lock-code')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'setLockCode',
    summary: 'Define o código de bloqueio do app',
    description: 'Exige a senha atual: se ela estiver errada, responde 400 com o erro em `currentPassword`.',
  })
  @ApiNoContentResponse({ description: 'Código definido' })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async setLockCode(
    @CurrentAccount() accountId: string,
    @Body() body: SetLockCodeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.account.setLockCode(accountId, body, meta);
  }
}
