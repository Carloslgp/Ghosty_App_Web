import type { NotesServiceClient } from '../../../ports/notes-service.client.js';
import type { SafetyServiceClient } from '../../../ports/safety-service.client.js';
import type { TokenService } from '../../../ports/token-service.js';
import type { RequestMeta } from '../../../ports/upstream-error.js';
import { buildAuthSession, type AuthSession } from '../../../shared/auth-session.js';

/** Notas criadas no cadastro, para a fachada parecer um app em uso desde o primeiro acesso. */
export const SAMPLE_NOTES = [
  {
    kind: 'checklist',
    title: 'Lista do mercado',
    items: [{ text: 'pão' }, { text: 'leite' }, { text: 'café' }],
    color: 'yellow',
    labels: ['casa'],
    pinned: true,
  },
  {
    kind: 'text',
    title: 'Ideias de presente',
    body: 'Mãe: livro de receitas\nPai: fone sem fio',
    color: 'pink',
  },
  {
    kind: 'text',
    title: 'Livros para ler',
    body: 'O Pequeno Príncipe\nDom Casmurro',
    color: 'green',
    labels: ['leitura'],
  },
];

export interface RegisterCommand {
  displayName: string;
  email: string;
  password: string;
}

export interface ProblemLogger {
  warn(message: string): void;
}

export class RegisterHandler {
  constructor(
    private readonly safety: SafetyServiceClient,
    private readonly notes: NotesServiceClient,
    private readonly tokens: TokenService,
    private readonly logger: ProblemLogger,
  ) {}

  async execute(command: RegisterCommand, meta: RequestMeta): Promise<AuthSession> {
    const account = await this.safety.createAccount(command, meta);
    const refresh = await this.safety.issueRefreshToken(account.id, meta);
    // As notas de exemplo não podem impedir o cadastro: se o notes-service falhar, a conta fica sem elas.
    for (const note of SAMPLE_NOTES) {
      try {
        await this.notes.forUser(account.id, 'POST', '/notes', note, meta);
      } catch {
        this.logger.warn('Cadastro: não foi possível criar as notas de exemplo.');
        break;
      }
    }
    return buildAuthSession(this.tokens, account, refresh);
  }
}
