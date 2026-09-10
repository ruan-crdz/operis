// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImportWizard, type WizardData } from './wizard';

vi.mock('@/runtime/navigation', async (original) => ({
  ...(await original<typeof import('@/runtime/navigation')>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/client/actions/imports', () => ({
  configureImport: vi.fn(),
  validateImport: vi.fn(),
  suggestMapping: vi.fn(),
  approveImport: vi.fn(),
  processImport: vi.fn(),
  saveTemplate: vi.fn(),
}));
afterEach(cleanup);

const sheet = {
  name: 'Dados de teste',
  rows: [
    ['Nome', 'CPF'],
    ['Pessoa Fictícia', '52998224725'],
  ],
};
const mapping = { Nome: 'employee_name', CPF: 'employee_cpf' } as const;
const data: WizardData = {
  item: {
    id: '10000000-0000-4000-8000-000000000001',
    organization_id: '20000000-0000-4000-8000-000000000001',
    client_id: '30000000-0000-4000-8000-000000000001',
    competence: '2026-09',
    original_filename: 'test.csv',
    storage_path: 'test.csv',
    checksum: 'test',
    status: 'awaiting_approval',
    sheets: [sheet],
    sheet_index: 0,
    header_row: 1,
    headers: ['Nome', 'CPF'],
    mapping,
    validation: { issues: [], valid: 1, ignored: 0, total: 1 },
    validated_records: null,
    created_by: '40000000-0000-4000-8000-000000000001',
    approved_by: null,
    approved_at: null,
    completed_at: null,
    row_count: 1,
    version: 3,
    correlation_id: '50000000-0000-4000-8000-000000000001',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    import_type: 'employee_master',
  },
  sheets: [sheet],
  savedMapping: mapping,
  validation: { issues: [], valid: 1, ignored: 0, total: 1 },
  templates: [],
  canEdit: true,
  canApprove: true,
  aiConfigured: false,
};
describe('human approval boundary', () => {
  it('requires explicit review and invalidates approval after a local mapping edit', () => {
    render(<ImportWizard {...data} />);
    const approve = screen.getByRole('button', { name: 'Aprovar importação' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(approve.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Campo Operis para CPF'), { target: { value: 'ignore' } });
    expect(approve.disabled).toBe(true);
    expect(screen.getByText(/Salve e valide novamente/)).toBeTruthy();
  });
  it('keeps manual mapping available without AI and hides approval from operators', () => {
    render(<ImportWizard {...data} canApprove={false} />);
    expect((screen.getByRole('button', { name: 'Sugerir com IA' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Campo Operis para Nome') as HTMLSelectElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Aprovar importação' })).toBeNull();
    expect(screen.getByText(/Aguardando revisão de um membro/)).toBeTruthy();
  });
});
