// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Button, EmptyState } from './index';
afterEach(cleanup);
describe('Operis UI', () => {
  it('prevents duplicate activation during loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
  it('offers a next action in an empty state', () => {
    render(
      <EmptyState
        title="Nenhuma tarefa"
        description="As tarefas atribuídas aparecerão aqui."
        action={<Button>Criar tarefa</Button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nenhuma tarefa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar tarefa' })).toBeTruthy();
  });
});
