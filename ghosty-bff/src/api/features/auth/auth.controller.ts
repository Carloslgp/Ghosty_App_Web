import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { LoginHandler } from '../../../application/features/auth/login/login.handler.js';
import { LogoutHandler } from '../../../application/features/auth/logout/logout.handler.js';
import { RefreshSessionHandler } from '../../../application/features/auth/refresh-session/refresh-session.handler.js';
import { RegisterHandler } from '../../../application/features/auth/register/register.handler.js';
import type { RequestMeta } from '../../../application/ports/upstream-error.js';
import { TOKEN_SERVICE, type Jwk, type TokenService } from '../../../application/ports/token-service.js';
import type { AuthSession } from '../../../application/shared/auth-session.js';
import { ApiProblems } from '../../platform/openapi.js';
import { Public } from '../../platform/public.decorator.js';
import { Meta } from '../../shared/guards.js';
import { LoginRateLimited } from '../../shared/rate-limit.js';
import { AuthSessionResponse, LoginRequest, RefreshRequest, RegisterRequest } from './auth.dto.js';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RegisterHandler) private readonly registerHandler: RegisterHandler,
    @Inject(LoginHandler) private readonly loginHandler: LoginHandler,
    @Inject(RefreshSessionHandler) private readonly refreshHandler: RefreshSessionHandler,
    @Inject(LogoutHandler) private readonly logoutHandler: LogoutHandler,
  ) {}

  @Post('register')
  @LoginRateLimited()
  @ApiOperation({
    operationId: 'register',
    summary: 'Cria a conta',
    description: 'Cria a conta, 3 notas de exemplo para a fachada parecer usada, e devolve a sessão.',
  })
  @ApiCreatedResponse({ type: AuthSessionResponse })
  @ApiProblems('VALIDATION_FAILED', 'EMAIL_IN_USE', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  register(@Body() body: RegisterRequest, @Meta() meta: RequestMeta): Promise<AuthSession> {
    return this.registerHandler.execute(body, meta);
  }

  @Post('login')
  @HttpCode(200)
  @LoginRateLimited()
  @ApiOperation({
    operationId: 'login',
    summary: 'Entra com e-mail e senha',
    description:
      'Limite de 5 tentativas por minuto por IP. E-mail inexistente e senha errada recebem a mesma resposta.',
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  login(@Body() body: LoginRequest, @Meta() meta: RequestMeta): Promise<AuthSession> {
    return this.loginHandler.execute(body, meta);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'refreshSession',
    summary: 'Renova a sessão',
    description:
      'Troca o refresh token por um novo (rotação) e devolve um JWT novo. O refresh token usado deixa de valer.',
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  refresh(@Body() body: RefreshRequest, @Meta() meta: RequestMeta): Promise<AuthSession> {
    return this.refreshHandler.execute(body, meta);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'logout',
    summary: 'Sai',
    description: 'Revoga o refresh token. É idempotente.',
  })
  @ApiNoContentResponse({ description: 'Sessão encerrada' })
  @ApiProblems('VALIDATION_FAILED', 'RATE_LIMITED', 'INTERNAL_ERROR')
  async logout(@Body() body: RefreshRequest, @Meta() meta: RequestMeta): Promise<void> {
    await this.logoutHandler.execute(body, meta);
  }
}

/** Usado pelo `validate-jwt` do API Management para conferir a assinatura dos JWTs. */
@ApiTags('auth')
@Public()
@Controller('.well-known')
export class WellKnownController {
  constructor(@Inject(TOKEN_SERVICE) private readonly tokens: TokenService) {}

  @Get('openid-configuration')
  @ApiOperation({ operationId: 'getOpenIdConfiguration', summary: 'Configuração OpenID (emissor e JWKS)' })
  openIdConfiguration() {
    const issuer = this.tokens.issuer;
    return {
      issuer,
      jwks_uri: `${issuer.replace(/\/+$/, '')}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ['RS256'],
      response_types_supported: ['token'],
      subject_types_supported: ['public'],
    };
  }

  @Get('jwks.json')
  @ApiOperation({ operationId: 'getJwks', summary: 'Chaves públicas (JWKS)' })
  jwks(): Promise<{ keys: Jwk[] }> {
    return this.tokens.jwks();
  }
}
