import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Banner, Button, EmptyState, Spinner, TextArea, TextField } from './ui';

describe('packages/ui', () => {
  it('Button é type="button" por padrão e responde ao clique', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('TextField liga o rótulo, a dica e o erro ao campo', () => {
    const { rerender } = render(<TextField label="E-mail" hint="Use o seu e-mail" />);
    const input = screen.getByLabelText('E-mail');
    expect(input).toHaveAccessibleDescription('Use o seu e-mail');
    rerender(<TextField label="E-mail" error="E-mail inválido" />);
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido');
  });

  it('TextArea, Banner, Spinner e EmptyState renderizam com os papéis certos', () => {
    render(
      <>
        <TextArea label="Texto" />
        <Banner tone="alert">Erro</Banner>
        <Banner>Info</Banner>
        <Spinner />
        <EmptyState>Nada aqui</EmptyState>
      </>,
    );
    expect(screen.getByLabelText('Texto').tagName).toBe('TEXTAREA');
    expect(screen.getByRole('alert')).toHaveTextContent('Erro');
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
  });
});
