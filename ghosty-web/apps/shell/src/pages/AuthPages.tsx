import { zodResolver } from '@hookform/resolvers/zod';
import { Banner, Button, Card, TextField } from '@ghosty/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import styles from './pages.module.css';

/** 429 do BFF (limite de tentativas por minuto): não é senha errada, é só esperar. */
const TOO_MANY = 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';

const loginSchema = z.object({
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe a senha'),
});

const registerSchema = z.object({
  displayName: z.string().trim().min(1, 'Informe seu nome').max(80, 'Máximo de 80 caracteres'),
  email: z.email('Informe um e-mail válido').max(254),
  password: z
    .string()
    .min(8, 'A senha precisa ter pelo menos 8 caracteres')
    .max(128, 'Máximo de 128 caracteres'),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState<string | null>(null);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailed(null);
    try {
      const result = await login(values.email, values.password);
      if (result === 'ok') await navigate('/', { replace: true });
      else setFailed(result === 'rate-limited' ? TOO_MANY : 'E-mail ou senha incorretos.');
    } catch {
      setFailed('Não foi possível entrar agora. Tente de novo em instantes.');
    }
  });

  return (
    <main className={styles.center}>
      <Card>
        <h1 className={styles.title}>Entrar</h1>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {failed && <Banner tone="alert">{failed}</Banner>}
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...form.register('email')}
          />
          <TextField
            label="Senha"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...form.register('password')}
          />
          <Button type="submit" block disabled={isSubmitting}>
            Entrar
          </Button>
        </form>
        <p className={styles.footer}>
          Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
        </p>
      </Card>
    </main>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState<string | null>(null);
  const form = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailed(null);
    try {
      const result = await register(values);
      if (result === 'ok') await navigate('/', { replace: true });
      else if (result === 'rate-limited') setFailed(TOO_MANY);
      else form.setError('email', { message: 'Já existe uma conta com este e-mail.' });
    } catch {
      setFailed('Não foi possível criar a conta agora. Tente de novo em instantes.');
    }
  });

  return (
    <main className={styles.center}>
      <Card>
        <h1 className={styles.title}>Criar conta</h1>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {failed && <Banner tone="alert">{failed}</Banner>}
          <TextField
            label="Nome"
            autoComplete="name"
            error={errors.displayName?.message}
            {...form.register('displayName')}
          />
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...form.register('email')}
          />
          <TextField
            label="Senha"
            type="password"
            autoComplete="new-password"
            hint="Pelo menos 8 caracteres"
            error={errors.password?.message}
            {...form.register('password')}
          />
          <Button type="submit" block disabled={isSubmitting}>
            Criar conta
          </Button>
        </form>
        <p className={styles.footer}>
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </Card>
    </main>
  );
}
