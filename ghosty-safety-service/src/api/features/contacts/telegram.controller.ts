import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import {
  LeaveTelegramContactHandler,
  type TelegramLeaveResult,
} from '../../../application/features/telegram/leave-telegram-contact/leave-telegram-contact.handler.js';
import {
  LinkTelegramContactHandler,
  type TelegramLinkResult,
} from '../../../application/features/telegram/link-telegram-contact/link-telegram-contact.handler.js';
import { ApiProblems } from '../../platform/openapi.js';
import { ApiInternal } from '../../shared/params.js';

const CHAT_ID = /^-?[0-9]{1,20}$/;

export class TelegramLinkRequest {
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{43}$' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'token inválido' })
  token!: string;

  @ApiProperty({ pattern: '^-?[0-9]{1,20}$', description: 'Chat do Telegram, em texto' })
  @Matches(CHAT_ID, { message: 'chat do Telegram inválido' })
  chatId!: string;
}

export class TelegramLeaveRequest {
  @ApiProperty({ pattern: '^-?[0-9]{1,20}$' })
  @Matches(CHAT_ID, { message: 'chat do Telegram inválido' })
  chatId!: string;
}

export class TelegramLinkResultResponse {
  @ApiProperty({ enum: ['linked', 'ignored'] })
  result!: string;

  @ApiProperty({ type: String, nullable: true })
  inviterDisplayName!: string | null;
}

export class TelegramLeaveResultResponse {
  @ApiProperty({ enum: ['left', 'ignored'] })
  result!: string;

  @ApiProperty({ minimum: 0 })
  contactsAffected!: number;
}

/** Rotas internas chamadas pela Function `telegram-webhook`. */
@ApiTags('internal')
@ApiInternal()
@Controller('internal/contacts')
export class TelegramController {
  constructor(
    @Inject(LinkTelegramContactHandler) private readonly link: LinkTelegramContactHandler,
    @Inject(LeaveTelegramContactHandler) private readonly leave: LeaveTelegramContactHandler,
  ) {}

  @Post('telegram-link')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'linkTelegramContact',
    summary: 'Vincula o contato ao chat do bot (/start)',
    description:
      'Com token válido, guarda o chat cifrado, muda o canal para `telegram` e o contato para `confirmed`. ' +
      'Token vencido, já respondido ou inexistente: `ignored`, em silêncio.',
  })
  @ApiOkResponse({ type: TelegramLinkResultResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  linkContact(@Body() body: TelegramLinkRequest): Promise<TelegramLinkResult> {
    return this.link.execute({ token: body.token, chatId: body.chatId });
  }

  @Post('telegram-leave')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'leaveTelegramContact',
    summary: 'Sai da rede pelo bot (/parar)',
    description:
      'Leva para `declined` todos os contatos confirmados com esse chat (o mesmo bot atende várias pessoas).',
  })
  @ApiOkResponse({ type: TelegramLeaveResultResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  leaveContact(@Body() body: TelegramLeaveRequest): Promise<TelegramLeaveResult> {
    return this.leave.execute({ chatId: body.chatId });
  }
}
