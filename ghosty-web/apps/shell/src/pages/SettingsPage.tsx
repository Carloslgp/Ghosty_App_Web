import { zodResolver } from '@hookform/resolvers/zod';
import { isProblem } from '@ghosty/api-client';
import { Banner, Button, Card, TextField } from '@ghosty/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import styles from './pages.module.css';

const lockCodeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    code: z.string().regex(/^[0-9]{6,8}$/, 'Use de 6 a 8 dígitos'),
    confirm: z.string(),
  })
  .refine((values) => values.code === values.confirm, {
    path: ['confirm'],
    message: 'Os códigos não conferem',
  });

/**
 * Configurações do app de notas: conta, código de bloqueio, sair e excluir a conta. Para quem olha, o
 * código de bloqueio é o PIN do app.
 */
export function SettingsPage() {
  const { api, user, logout, forget } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof lockCodeSchema>>({ resolver: zodResolver(lockCodeSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSaveCode = form.handleSubmit(async ({ currentPassword, code }) => {
    setSaved(false);
    const { error } = await api.PUT('/account/lock-code', { body: { currentPassword, code } });
    if (!error) {
      form.reset();
      setSaved(true);
      return;
    }
    const fieldError = isProblem(error)
      ? error.errors?.find((e) => e.field === 'currentPassword')
      : undefined;
    if (fieldError) form.setError('currentPassword', { message: 'Senha atual incorreta' });
    else form.setError('root', { message: 'Não foi possível salvar o código agora.' });
  });

  const onLogout = async () => {
    await logout();
    await navigate('/entrar', { replace: true });
  };

  const onDelete = async () => {
    setDeleteError(null);
    const { error } = await api.DELETE('/account');
    if (error) {
      setDeleteError('Não foi possível excluir a conta agora.');
      return;
    }
    // Sem sessão, o shell volta sozinho para Entrar.
    forget();
    await navigate('/entrar', { replace: true });
  };

  return (
    <main className={styles.page}>
      <p>
        <Link to="/">← Voltar às notas</Link>
      </p>
      <h1 className={styles.title}>Configurações</h1>

      <Card>
        <h2 className={styles.subtitle}>Conta</h2>
        <p>
          {user?.displayName} · {user?.email}
        </p>
      </Card>

      <Card>
        <h2 className={styles.subtitle}>Código de bloqueio do app</h2>
        <form className={styles.form} onSubmit={onSaveCode} noValidate>
          {saved && <Banner tone="success">Código salvo.</Banner>}
          {errors.root?.message && <Banner tone="alert">{errors.root.message}</Banner>}
          <TextField
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...form.register('currentPassword')}
          />
          <TextField
            label="Novo código"
            inputMode="numeric"
            autoComplete="off"
            hint="De 6 a 8 dígitos"
            error={errors.code?.message}
            {...form.register('code')}
          />
          <TextField
            label="Repita o código"
            inputMode="numeric"
            autoComplete="off"
            error={errors.confirm?.message}
            {...form.register('confirm')}
          />
          <Button type="submit" disabled={isSubmitting}>
            Salvar código
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className={styles.subtitle}>Sessão</h2>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onLogout}>
            Sair
          </Button>
          {!confirmDelete ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Excluir conta
            </Button>
          ) : (
            <div className={styles.form}>
              <Banner tone="warning">Isso apaga a conta e todas as notas. Não dá para desfazer.</Banner>
              {deleteError && <Banner tone="alert">{deleteError}</Banner>}
              <div className={styles.actions}>
                <Button variant="danger" onClick={onDelete}>
                  Excluir definitivamente
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
