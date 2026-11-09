import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Res } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticateAccountHandler } from '../../../application/features/accounts/authenticate-account/authenticate-account.handler.js';
import { CreateAccountHandler } from '../../../application/features/accounts/create-account/create-account.handler.js';
import { DeleteAccountHandler } from '../../../application/features/accounts/delete-account/delete-account.handler.js';
import { GetAccountHandler } from '../../../application/features/accounts/get-account/get-account.handler.js';
import { SetSecretCodeHandler } from '../../../application/features/accounts/set-secret-code/set-secret-code.handler.js';
import { UpdateAccountHandler } from '../../../application/features/accounts/update-account/update-account.handler.js';
import { VerifySecretCodeHandler } from '../../../application/features/accounts/verify-secret-code/verify-secret-code.handler.js';
import type { AccountView } from '../../../application/shared/views.js';
import { ApiProblems } from '../../platform/openapi.js';
import { ApiInternal, ApiUuidParam, UuidParamPipe } from '../../shared/params.js';
import {
  AccountResponse,
  AuthenticateAccountRequest,
  CreateAccountRequest,
  SetSecretCodeRequest,
  UpdateAccountRequest,
  VerifySecretCodeRequest,
} from './accounts.dto.js';

/** Contas: cadastro, autenticação e código secreto. Chamadas só pelo BFF. */
@ApiTags('accounts')
@ApiInternal()
@Controller('accounts')
export class AccountsController {
  constructor(
    @Inject(CreateAccountHandler) private readonly createAccount: CreateAccountHandler,
    @Inject(AuthenticateAccountHandler) private readonly authenticateAccount: AuthenticateAccountHandler,
    @Inject(GetAccountHandler) private readonly getAccount: GetAccountHandler,
    @Inject(UpdateAccountHandler) private readonly updateAccount: UpdateAccountHandler,
    @Inject(DeleteAccountHandler) private readonly deleteAccount: DeleteAccountHandler,
    @Inject(SetSecretCodeHandler) private readonly setSecretCode: SetSecretCodeHandler,
    @Inject(VerifySecretCodeHandler) private readonly verifySecretCode: VerifySecretCodeHandler,
  ) {}

  @Post()
  @ApiOperation({
    operationId: 'createAccount',
    summary: 'Cria uma conta',
    description: 'O e-mail é normalizado (minúsculas, sem espaços) e precisa ser único. Senha em Argon2id.',
  })
  @ApiCreatedResponse({ type: AccountResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'EMAIL_IN_USE', 'INTERNAL_ERROR')
  async create(
    @Body() body: CreateAccountRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountView> {
    const account = await this.createAccount.execute(body);
    res.setHeader('Location', `/accounts/${account.id}`);
    return account;
  }

  @Post('authenticate')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'authenticateAccount',
    summary: 'Confere e-mail e senha',
    description: 'E-mail inexistente e senha errada recebem a mesma resposta (401).',
  })
  @ApiOkResponse({ type: AccountResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  authenticate(@Body() body: AuthenticateAccountRequest): Promise<AccountView> {
    return this.authenticateAccount.execute(body);
  }

  @Get(':accountId')
  @ApiOperation({ operationId: 'getAccount', summary: 'Busca uma conta' })
  @ApiUuidParam('accountId', 'Id da conta')
  @ApiOkResponse({ type: AccountResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  get(@Param('accountId', UuidParamPipe) accountId: string): Promise<AccountView> {
    return this.getAccount.execute({ accountId });
  }

  @Put(':accountId')
  @ApiOperation({ operationId: 'updateAccount', summary: 'Altera o nome exibido' })
  @ApiUuidParam('accountId', 'Id da conta')
  @ApiOkResponse({ type: AccountResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  update(
    @Param('accountId', UuidParamPipe) accountId: string,
    @Body() body: UpdateAccountRequest,
  ): Promise<AccountView> {
    return this.updateAccount.execute({ accountId, displayName: body.displayName });
  }

  @Delete(':accountId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteAccount',
    summary: 'Apaga a conta',
    description:
      'Exclusão em cascata no SQL: tokens, contatos, mensagem, check-ins, pedidos de ajuda e linhas do tempo. ' +
      'As notas ficam no `notes-service`, e o BFF apaga as duas partes.',
  })
  @ApiUuidParam('accountId', 'Id da conta')
  @ApiNoContentResponse({ description: 'Conta apagada' })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  async delete(@Param('accountId', UuidParamPipe) accountId: string): Promise<void> {
    await this.deleteAccount.execute({ accountId });
  }

  @Put(':accountId/secret-code')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'setSecretCode',
    summary: 'Define ou troca o código secreto',
    description:
      'Exige a senha atual. O código tem de 6 a 8 dígitos e é guardado com Argon2id. Zera as tentativas e o bloqueio.',
  })
  @ApiUuidParam('accountId', 'Id da conta')
  @ApiNoContentResponse({ description: 'Código definido' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  async setCode(
    @Param('accountId', UuidParamPipe) accountId: string,
    @Body() body: SetSecretCodeRequest,
  ): Promise<void> {
    await this.setSecretCode.execute({ accountId, currentPassword: body.currentPassword, code: body.code });
  }

  @Post(':accountId/secret-code/verify')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'verifySecretCode',
    summary: 'Confere o código secreto',
    description:
      'Código certo: 204, e as tentativas voltam a zero. Código errado, conta sem código ou conta bloqueada: ' +
      'sempre a mesma resposta 401. Depois de 5 erros, a conta fica bloqueada por 15 minutos, sem aviso.',
  })
  @ApiUuidParam('accountId', 'Id da conta')
  @ApiNoContentResponse({ description: 'Código certo' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  async verifyCode(
    @Param('accountId', UuidParamPipe) accountId: string,
    @Body() body: VerifySecretCodeRequest,
  ): Promise<void> {
    await this.verifySecretCode.execute({ accountId, code: body.code });
  }
}
