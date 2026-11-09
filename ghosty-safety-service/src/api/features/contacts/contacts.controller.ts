import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Res } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AddContactHandler } from '../../../application/features/contacts/add-contact/add-contact.handler.js';
import {
  CreateInvitationHandler,
  type InvitationCreated,
} from '../../../application/features/contacts/create-invitation/create-invitation.handler.js';
import { GetContactHandler } from '../../../application/features/contacts/get-contact/get-contact.handler.js';
import { ListContactsHandler } from '../../../application/features/contacts/list-contacts/list-contacts.handler.js';
import { RemoveContactHandler } from '../../../application/features/contacts/remove-contact/remove-contact.handler.js';
import { ReorderContactsHandler } from '../../../application/features/contacts/reorder-contacts/reorder-contacts.handler.js';
import { UpdateContactHandler } from '../../../application/features/contacts/update-contact/update-contact.handler.js';
import type { ContactView } from '../../../application/shared/views.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { ApiUserScoped, ApiUuidParam, UuidParamPipe } from '../../shared/params.js';
import {
  ContactInput,
  ContactListResponse,
  ContactResponse,
  InvitationCreatedResponse,
  ReorderContactsRequest,
} from './contacts.dto.js';

/** Rede de apoio: só o apelido de cada contato (não existe telefone). */
@ApiTags('contacts')
@ApiUserScoped()
@Controller('contacts')
export class ContactsController {
  constructor(
    @Inject(AddContactHandler) private readonly addContact: AddContactHandler,
    @Inject(ListContactsHandler) private readonly listContacts: ListContactsHandler,
    @Inject(ReorderContactsHandler) private readonly reorderContacts: ReorderContactsHandler,
    @Inject(GetContactHandler) private readonly getContact: GetContactHandler,
    @Inject(UpdateContactHandler) private readonly updateContact: UpdateContactHandler,
    @Inject(RemoveContactHandler) private readonly removeContact: RemoveContactHandler,
    @Inject(CreateInvitationHandler) private readonly createInvitation: CreateInvitationHandler,
  ) {}

  @Post()
  @ApiOperation({
    operationId: 'addContact',
    summary: 'Adiciona um contato',
    description: 'Só o apelido. O contato entra `pending`, no fim da ordem. Máximo de 10 contatos.',
  })
  @ApiCreatedResponse({ type: ContactResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INVALID_STATE', 'INTERNAL_ERROR')
  async add(
    @UserId() accountId: string,
    @Body() body: ContactInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ContactView> {
    const contact = await this.addContact.execute({ accountId, nickname: body.nickname });
    res.setHeader('Location', `/contacts/${contact.id}`);
    return contact;
  }

  @Get()
  @ApiOperation({ operationId: 'listContacts', summary: 'Lista a rede de apoio, na ordem' })
  @ApiOkResponse({ type: ContactListResponse })
  @ApiProblems('UNAUTHENTICATED', 'INTERNAL_ERROR')
  list(@UserId() accountId: string): Promise<{ items: ContactView[] }> {
    return this.listContacts.execute({ accountId });
  }

  // Antes de `:contactId`, senão "order" seria lido como id.
  @Put('order')
  @ApiOperation({
    operationId: 'reorderContacts',
    summary: 'Reordena a rede',
    description: 'Recebe todos os ids da rede, na nova ordem. Faltar ou sobrar um id responde 400.',
  })
  @ApiOkResponse({ type: ContactListResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  reorder(
    @UserId() accountId: string,
    @Body() body: ReorderContactsRequest,
  ): Promise<{ items: ContactView[] }> {
    return this.reorderContacts.execute({
      accountId,
      contactIds: body.contactIds.map((id) => id.toLowerCase()),
    });
  }

  @Get(':contactId')
  @ApiOperation({ operationId: 'getContact', summary: 'Busca um contato' })
  @ApiUuidParam('contactId', 'Id do contato')
  @ApiOkResponse({ type: ContactResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  get(
    @UserId() accountId: string,
    @Param('contactId', UuidParamPipe) contactId: string,
  ): Promise<ContactView> {
    return this.getContact.execute({ accountId, contactId });
  }

  @Put(':contactId')
  @ApiOperation({ operationId: 'updateContact', summary: 'Altera o apelido' })
  @ApiUuidParam('contactId', 'Id do contato')
  @ApiOkResponse({ type: ContactResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  update(
    @UserId() accountId: string,
    @Param('contactId', UuidParamPipe) contactId: string,
    @Body() body: ContactInput,
  ): Promise<ContactView> {
    return this.updateContact.execute({ accountId, contactId, nickname: body.nickname });
  }

  @Delete(':contactId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'removeContact',
    summary: 'Remove um contato',
    description: 'O link do convite deixa de funcionar e as posições dos demais são compactadas.',
  })
  @ApiUuidParam('contactId', 'Id do contato')
  @ApiNoContentResponse({ description: 'Contato removido' })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  async remove(
    @UserId() accountId: string,
    @Param('contactId', UuidParamPipe) contactId: string,
  ): Promise<void> {
    await this.removeContact.execute({ accountId, contactId });
  }

  @Post(':contactId/invitation')
  @ApiOperation({
    operationId: 'createInvitation',
    summary: 'Gera um convite novo',
    description:
      'Token aleatório de 32 bytes (o banco guarda só o hash), válido por 72 horas para a resposta. ' +
      'Volta o contato para `pending` e invalida o link anterior. O Ghosty não envia o convite.',
  })
  @ApiUuidParam('contactId', 'Id do contato')
  @ApiCreatedResponse({ type: InvitationCreatedResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  invite(
    @UserId() accountId: string,
    @Param('contactId', UuidParamPipe) contactId: string,
  ): Promise<InvitationCreated> {
    return this.createInvitation.execute({ accountId, contactId });
  }
}
