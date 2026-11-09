// Erros no formato Problem Details (RFC 9457), com o `code` estável do catálogo da API.
// O original fica em config/nest/platform/, na raiz do repositório. Cada serviço NestJS recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import {
  Catch,
  HttpException,
  Logger,
  ValidationPipe,
  type ArgumentsHost,
  type ExceptionFilter,
  type ValidationError,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { correlationIdOf } from './correlation-id.js';

/** Catálogo de erros, igual nos contratos de todos os serviços. */
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: 400, title: 'Dados inválidos' },
  UNAUTHENTICATED: { status: 401, title: 'Não autenticado' },
  FORBIDDEN: { status: 403, title: 'Acesso negado' },
  NOT_FOUND: { status: 404, title: 'Não encontrado' },
  VERSION_CONFLICT: { status: 409, title: 'Versão desatualizada' },
  INVALID_STATE: { status: 409, title: 'Operação não permitida agora' },
  EMAIL_IN_USE: { status: 409, title: 'E-mail já cadastrado' },
  INVITATION_EXPIRED: { status: 410, title: 'Convite vencido' },
  RATE_LIMITED: { status: 429, title: 'Muitas requisições' },
  INTERNAL_ERROR: { status: 500, title: 'Erro interno' },
  UPSTREAM_UNAVAILABLE: { status: 503, title: 'Serviço indisponível' },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export interface FieldError {
  field: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: FieldError[];
}

/** Erro lançado pela própria camada `api` (guards, pipes), já com o código do catálogo. */
export class ProblemException extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly errors?: FieldError[],
    readonly headers?: Record<string, string>,
  ) {
    super(detail ?? code);
    this.name = 'ProblemException';
  }
}

/**
 * Erros de domínio e de aplicação não conhecem o NestJS: basta terem um `code` do catálogo.
 * A mensagem vira o `detail`, e `errors` (opcional) aponta os campos.
 */
interface CodedError {
  code: ErrorCode;
  message: string;
  errors?: FieldError[];
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CATALOG, value);
}

function isCodedError(error: unknown): error is CodedError {
  return error instanceof Error && isErrorCode((error as { code?: unknown }).code);
}

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'INVALID_STATE';
  if (status === 410) return 'INVITATION_EXPIRED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'UPSTREAM_UNAVAILABLE';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'VALIDATION_FAILED';
}

export function problemOf(code: ErrorCode, init: Partial<ProblemDetails> = {}): ProblemDetails {
  const { status, title } = ERROR_CATALOG[code];
  return {
    type: `/errors/${code.toLowerCase().replaceAll('_', '-')}`,
    title,
    status,
    code,
    ...init,
  };
}

interface Resolved {
  problem: ProblemDetails;
  headers?: Record<string, string>;
}

function resolve(exception: unknown): Resolved {
  if (exception instanceof ProblemException) {
    return {
      problem: problemOf(exception.code, { detail: exception.detail, errors: exception.errors }),
      headers: exception.headers,
    };
  }
  if (isCodedError(exception)) {
    const detail = exception.code === 'INTERNAL_ERROR' ? undefined : exception.message;
    return { problem: problemOf(exception.code, { detail, errors: exception.errors }) };
  }
  if (exception instanceof HttpException) {
    const code = codeForStatus(exception.getStatus());
    // A mensagem do NestJS (ex.: "Cannot GET /x") não vai para o cliente.
    const detail = code === 'VALIDATION_FAILED' ? 'Requisição inválida.' : undefined;
    return { problem: problemOf(code, { detail }) };
  }
  return { problem: problemOf('INTERNAL_ERROR') };
}

/** Transforma qualquer exceção numa resposta `application/problem+json`. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const { problem, headers } = resolve(exception);

    if (problem.status >= 500) {
      // Só o erro e a pilha: nunca o corpo da requisição.
      this.logger.error(exception instanceof Error ? exception : String(exception));
    }
    if (response.headersSent) return;

    for (const [name, value] of Object.entries(headers ?? {})) response.setHeader(name, value);
    const body: ProblemDetails = {
      ...problem,
      instance: request.originalUrl?.split('?')[0] ?? request.url,
      correlationId: correlationIdOf(request),
    };
    response.status(problem.status).type('application/problem+json').json(body);
  }
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Validação dos DTOs: campos desconhecidos são recusados e os erros saem no formato do catálogo. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => {
      const fields = flatten(errors);
      const first = fields[0];
      const detail = first ? `O campo ${first.field} é inválido: ${first.message}.` : 'Dados inválidos.';
      return new ProblemException('VALIDATION_FAILED', detail, fields);
    },
  });
}
