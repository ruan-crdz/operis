import { PageHeader, Panel } from '@operis/ui';
import { today } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { getOptions } from '@/client/queries';
import { ActionForm } from '@/features/forms/action-form';
import { createImport } from '@/client/actions/imports';
export default async function NewImport() {
  await requirePermission('imports.create');
  const options = await getOptions();
  return (
    <>
      <PageHeader
        eyebrow="Importações · Departamento Pessoal"
        title="Nova importação"
        description="Comece pelo arquivo. Você revisará todas as informações antes de aprovar."
      />
      <div className="detail-grid">
        <Panel className="panel-pad">
          <ActionForm
            action={createImport}
            submit="Enviar e analisar arquivo"
            fields={[
              {
                name: 'client_id',
                label: 'Cliente',
                type: 'select',
                required: true,
                options: [{ value: '', label: 'Selecione um cliente' }, ...options.clients],
              },
              {
                name: 'competence',
                label: 'Competência',
                type: 'month',
                required: true,
                value: today().slice(0, 7),
              },
              {
                name: 'file',
                label: 'Planilha de colaboradores',
                type: 'file',
                required: true,
                accept: '.csv,.xlsx',
                hint: 'CSV em UTF-8 ou XLSX, até 10 MB. Máximo de 5.000 linhas e 100 colunas por planilha. Arquivos com fórmulas ou macros não são aceitos.',
              },
            ]}
          />
        </Panel>
        <div className="operational-note">
          <p className="eyebrow">Você no controle</p>
          <h2>Conferir antes de importar.</h2>
          <p>1. Escolha a planilha e o cabeçalho.</p>
          <p>2. Mapeie as colunas manualmente ou peça sugestões à IA.</p>
          <p>3. Revise a validação e aprove a importação.</p>
          <p>O original permanece preservado e cada etapa salva pode ser retomada depois.</p>
        </div>
      </div>
    </>
  );
}
