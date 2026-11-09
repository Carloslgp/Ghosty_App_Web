import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import styles from './ui.module.css';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Botão com alvo de toque de 44 px. O padrão é `type="button"` (não envia formulário sem querer). */
export function Button({ variant = 'primary', block, className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], block && styles.block, className)}
      {...props}
    />
  );
}

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Campo de texto com rótulo, dica e erro ligados por `aria-describedby`. */
export function TextField({ label, hint, error, id, className, ...props }: TextFieldProps) {
  const fallback = useId();
  const inputId = id ?? fallback;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error}>
      <input
        id={inputId}
        className={cx(styles.input, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
    </FieldShell>
  );
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextArea({ label, hint, error, id, className, ...props }: TextAreaProps) {
  const fallback = useId();
  const inputId = id ?? fallback;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error}>
      <textarea
        id={inputId}
        className={cx(styles.input, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
    </FieldShell>
  );
}

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  return <Tag className={cx(styles.card, className)}>{children}</Tag>;
}

export interface BannerProps {
  tone?: 'info' | 'success' | 'warning' | 'alert';
  children: ReactNode;
}

/** Aviso na tela. `alert` interrompe o leitor de tela; os outros são `status`. */
export function Banner({ tone = 'info', children }: BannerProps) {
  return (
    <div className={cx(styles.banner, styles[tone])} role={tone === 'alert' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
