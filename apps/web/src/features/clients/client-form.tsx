import { ActionForm } from '@/features/forms/action-form';
import { saveClient } from '@/client/actions/clients';
import type { Tables } from '@operis/types/database';
export function ClientForm({ client }: { client?: Tables<'clients'> }) {
  return (
    <ActionForm
      action={saveClient}
      columns
      submit={client ? 'Salvar cliente' : 'Criar cliente'}
      hidden={client ? { id: client.id } : {}}
      fields={[
        { name: 'name', label: 'Razão social', required: true, value: client?.name, full: true },
        { name: 'trade_name', label: 'Nome fantasia', value: client?.trade_name },
        {
          name: 'tax_id',
          label: 'CNPJ / identificação',
          value: client?.tax_id,
          hint: 'Identificação cadastral; a situação fiscal não é consultada.',
        },
        { name: 'email', label: 'Email de contato', type: 'email', value: client?.email },
        {
          name: 'tax_regime',
          label: 'Regime tributário',
          type: 'select',
          value: client?.tax_regime ?? 'simples',
          options: [
            { value: 'simples', label: 'Simples Nacional' },
            { value: 'presumido', label: 'Lucro Presumido' },
            { value: 'real', label: 'Lucro Real' },
            { value: 'other', label: 'Outro / não informado' },
          ],
        },
      ]}
    />
  );
}
