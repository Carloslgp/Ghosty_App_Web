import type { Clock } from '../../../ports/clock.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { SafetyConfig } from '../../../ports/safety-config.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { loadInvitation, toInvitationView } from '../../../shared/invitations.js';
import type { InvitationView } from '../../../shared/views.js';

export class DeclineInvitationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
    private readonly config: SafetyConfig,
  ) {}

  execute(command: { token: string }): Promise<InvitationView> {
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const loaded = await loadInvitation(repos, this.tokens, command.token);
      loaded.contact.decline(now);
      await repos.contacts.update(loaded.contact);
      return toInvitationView(loaded, command.token, now, this.config);
    });
  }
}
