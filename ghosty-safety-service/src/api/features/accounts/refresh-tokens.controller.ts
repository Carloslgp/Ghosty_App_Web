import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  IssueRefreshTokenHandler,
  type RefreshTokenView,
} from '../../../application/features/refresh-tokens/issue-refresh-token/issue-refresh-token.handler.js';
import { RevokeRefreshTokenHandler } from '../../../application/features/refresh-tokens/revoke-refresh-token/revoke-refresh-token.handler.js';
import {
  RotateRefreshTokenHandler,
  type RotatedRefreshToken,
} from '../../../application/features/refresh-tokens/rotate-refresh-token/rotate-refresh-token.handler.js';
import { ApiProblems } from '../../platform/openapi.js';
import { ApiInternal } from '../../shared/params.js';
import { IssueRefreshTokenRequest, RefreshTokenResponse, RefreshTokenValue } from './accounts.dto.js';

/** Refresh tokens opacos: emitidos no login, rotacionados a cada uso e revogados no logout. */
@ApiTags('refresh-tokens')
@ApiInternal()
@Controller('refresh-tokens')
export class RefreshTokensController {
  constructor(
    @Inject(IssueRefreshTokenHandler) private readonly issue: IssueRefreshTokenHandler,
    @Inject(RotateRefreshTokenHandler) private readonly rotate: RotateRefreshTokenHandler,
    @Inject(RevokeRefreshTokenHandler) private readonly revoke: RevokeRefreshTokenHandler,
  ) {}

  @Post()
  @ApiOperation({
    operationId: 'issueRefreshToken',
    summary: 'Emite um refresh token',
    description: 'Valor opaco de 32 bytes (base64url), válido por 7 dias. O banco guarda só o hash SHA-256.',
  })
  @ApiCreatedResponse({ type: RefreshTokenResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  create(@Body() body: IssueRefreshTokenRequest): Promise<RefreshTokenView> {
    return this.issue.execute({ accountId: body.accountId.toLowerCase() });
  }

  @Post('rotate')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'rotateRefreshToken',
    summary: 'Troca o refresh token por um novo',
    description: 'O token usado é revogado. Token inexistente, vencido, revogado ou já usado responde 401.',
  })
  @ApiOkResponse({ type: RefreshTokenResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  rotateToken(@Body() body: RefreshTokenValue): Promise<RotatedRefreshToken> {
    return this.rotate.execute({ token: body.token });
  }

  @Post('revoke')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'revokeRefreshToken',
    summary: 'Revoga o refresh token (logout)',
    description: 'Idempotente. Um token desconhecido também responde 204.',
  })
  @ApiNoContentResponse({ description: 'Token revogado' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  async revokeToken(@Body() body: RefreshTokenValue): Promise<void> {
    await this.revoke.execute({ token: body.token });
  }
}
