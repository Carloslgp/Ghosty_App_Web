import { DomainError } from '../shared/domain-error.js';

export const DISPLAY_NAME_MAX = 80;
export const EMAIL_MAX = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-mail em minúsculas e sem espaços nas pontas: é assim que fica único no banco. */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email))
    throw DomainError.invalidField('email', 'e-mail inválido');
  return email;
}

export function normalizeDisplayName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > DISPLAY_NAME_MAX) {
    throw DomainError.invalidField('displayName', `entre 1 e ${DISPLAY_NAME_MAX} caracteres`);
  }
  return name;
}

/** O código secreto que desbloqueia a área de segurança: de 6 a 8 dígitos. */
export function assertSecretCodeFormat(code: string): void {
  if (!/^[0-9]{6,8}$/.test(code)) throw DomainError.invalidField('code', 'de 6 a 8 dígitos');
}

/** Política de bloqueio do código: `maxAttempts` erros bloqueiam por `lockMinutes`. */
export interface CodeLockPolicy {
  maxAttempts: number;
  lockMinutes: number;
}

export interface AccountSnapshot {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  secretCodeHash: string | null;
  failedCodeAttempts: number;
  codeLockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Account {
  private constructor(private state: AccountSnapshot) {}

  static create(params: {
    id: string;
    email: string;
    displayName: string;
    passwordHash: string;
    now: Date;
  }): Account {
    return new Account({
      id: params.id,
      email: normalizeEmail(params.email),
      displayName: normalizeDisplayName(params.displayName),
      passwordHash: params.passwordHash,
      secretCodeHash: null,
      failedCodeAttempts: 0,
      codeLockedUntil: null,
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  static restore(snapshot: AccountSnapshot): Account {
    return new Account({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get email(): string {
    return this.state.email;
  }

  get displayName(): string {
    return this.state.displayName;
  }

  get passwordHash(): string {
    return this.state.passwordHash;
  }

  get secretCodeHash(): string | null {
    return this.state.secretCodeHash;
  }

  get secretCodeSet(): boolean {
    return this.state.secretCodeHash !== null;
  }

  rename(displayName: string, now: Date): void {
    this.state = { ...this.state, displayName: normalizeDisplayName(displayName), updatedAt: now };
  }

  /** Define (ou troca) o código. Zera as tentativas e o bloqueio. */
  setSecretCodeHash(hash: string, now: Date): void {
    this.state = {
      ...this.state,
      secretCodeHash: hash,
      failedCodeAttempts: 0,
      codeLockedUntil: null,
      updatedAt: now,
    };
  }

  isCodeLocked(now: Date): boolean {
    return this.state.codeLockedUntil !== null && this.state.codeLockedUntil.getTime() > now.getTime();
  }

  /** Um erro conta uma tentativa; ao chegar no limite, bloqueia e recomeça a contagem. */
  registerFailedCodeAttempt(now: Date, policy: CodeLockPolicy): void {
    const attempts = this.state.failedCodeAttempts + 1;
    if (attempts >= policy.maxAttempts) {
      const until = new Date(now.getTime() + policy.lockMinutes * 60_000);
      this.state = { ...this.state, failedCodeAttempts: 0, codeLockedUntil: until, updatedAt: now };
    } else {
      this.state = { ...this.state, failedCodeAttempts: attempts, updatedAt: now };
    }
  }

  registerCorrectCode(now: Date): void {
    if (this.state.failedCodeAttempts === 0 && this.state.codeLockedUntil === null) return;
    this.state = { ...this.state, failedCodeAttempts: 0, codeLockedUntil: null, updatedAt: now };
  }

  toSnapshot(): AccountSnapshot {
    return { ...this.state };
  }
}
