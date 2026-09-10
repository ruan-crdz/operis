import { PageHeader, Panel } from '@operis/ui';
import { today } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { getOptions } from '@/client/queries';
import { ActionForm } from '@/features/forms/action-form';
import { createDocumentRequest } from '@/client/actions/documents';
export default async function Request() {
  await requirePermission('documents.manage');
  const options = await getOptions();
  return (
    <>
      <PageHeader
        eyebrow="Documentos"
        title="Solicitar documentos"
        description="Monte o checklist e acompanhe cada item recebido. Nesta versão, a solicitação é interna; nenhum email é enviado."
      />
      <Panel className="panel-pad" style={{ maxWidth: 800 }}>
        <ActionForm
          action={createDocumentRequest}
          columns
          submit="Criar solicitação"
          redirectTo="/app/documentos"
          fields={[
            { name: 'title', label: 'Título da solicitação', required: true, full: true },
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
            { name: 'due_date', label: 'Prazo de envio', type: 'date' },
            {
              name: 'items',
              label: 'Documentos solicitados',
              type: 'textarea',
              required: true,
              full: true,
              placeholder: 'Folha de ponto\nAdmissões\nDesligamentos\nVariáveis',
              hint: 'Um documento por linha.',
            },
          ]}
        />
      </Panel>
    </>
  );
}
