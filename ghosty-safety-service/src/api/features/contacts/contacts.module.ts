import { Module } from '@nestjs/common';
import { AddContactHandler } from '../../../application/features/contacts/add-contact/add-contact.handler.js';
import { CreateInvitationHandler } from '../../../application/features/contacts/create-invitation/create-invitation.handler.js';
import { GetContactHandler } from '../../../application/features/contacts/get-contact/get-contact.handler.js';
import { ListContactsHandler } from '../../../application/features/contacts/list-contacts/list-contacts.handler.js';
import { RemoveContactHandler } from '../../../application/features/contacts/remove-contact/remove-contact.handler.js';
import { ReorderContactsHandler } from '../../../application/features/contacts/reorder-contacts/reorder-contacts.handler.js';
import { UpdateContactHandler } from '../../../application/features/contacts/update-contact/update-contact.handler.js';
import { AcceptInvitationHandler } from '../../../application/features/invitations/accept-invitation/accept-invitation.handler.js';
import { DeclineInvitationHandler } from '../../../application/features/invitations/decline-invitation/decline-invitation.handler.js';
import { GetInvitationAlertsHandler } from '../../../application/features/invitations/get-invitation-alerts/get-invitation-alerts.handler.js';
import { GetInvitationHandler } from '../../../application/features/invitations/get-invitation/get-invitation.handler.js';
import { LeaveTelegramContactHandler } from '../../../application/features/telegram/leave-telegram-contact/leave-telegram-contact.handler.js';
import { LinkTelegramContactHandler } from '../../../application/features/telegram/link-telegram-contact/link-telegram-contact.handler.js';
import { CLOCK } from '../../../application/ports/clock.js';
import { ID_GENERATOR } from '../../../application/ports/id-generator.js';
import { OPAQUE_TOKENS } from '../../../application/ports/opaque-tokens.js';
import { SAFETY_CONFIG } from '../../../application/ports/safety-config.js';
import { UNIT_OF_WORK } from '../../../application/ports/unit-of-work.js';
import { provideHandler } from '../../shared/provide-handler.js';
import { ContactsController } from './contacts.controller.js';
import { InvitationsController } from './invitations.controller.js';
import { TelegramController } from './telegram.controller.js';

/** Rede de apoio, convites públicos e o vínculo com o Telegram. */
@Module({
  controllers: [ContactsController, InvitationsController, TelegramController],
  providers: [
    provideHandler(AddContactHandler, [UNIT_OF_WORK, CLOCK, ID_GENERATOR]),
    provideHandler(ListContactsHandler, [UNIT_OF_WORK]),
    provideHandler(ReorderContactsHandler, [UNIT_OF_WORK]),
    provideHandler(GetContactHandler, [UNIT_OF_WORK]),
    provideHandler(UpdateContactHandler, [UNIT_OF_WORK]),
    provideHandler(RemoveContactHandler, [UNIT_OF_WORK]),
    provideHandler(CreateInvitationHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK, SAFETY_CONFIG]),
    provideHandler(GetInvitationHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK, SAFETY_CONFIG]),
    provideHandler(AcceptInvitationHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK, SAFETY_CONFIG]),
    provideHandler(DeclineInvitationHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK, SAFETY_CONFIG]),
    provideHandler(GetInvitationAlertsHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK]),
    provideHandler(LinkTelegramContactHandler, [UNIT_OF_WORK, OPAQUE_TOKENS, CLOCK]),
    provideHandler(LeaveTelegramContactHandler, [UNIT_OF_WORK]),
  ],
})
export class ContactsModule {}
