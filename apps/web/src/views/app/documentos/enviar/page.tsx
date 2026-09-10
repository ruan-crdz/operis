import { PageHeader, Panel } from '@operis/ui';
import { today } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { getOptions } from '@/client/queries';
import { ActionForm } from '@/features/forms/action-form';
import { uploadDocument } from '@/client/actions/documents';
export default async function Upload() {
  await requirePermission('documents.upload');
  const options = await getOptions();
  return (
    <>
      <PageHeader
        eyebrow="Documentos"
        title="Enviar documento"
        description="O arquivo será armazenado de forma privada no escritório."
      />
      <Panel className="panel-pad" style={{ maxWidth: 800 }}>
        <ActionForm
          action={uploadDocument}
          submit="Enviar e armazenar"
          redirectTo="/app/documentos"
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
              label: 'Documento',
              type: 'file',
              required: true,
              accept: '.pdf,.png,.jpg,.jpeg,.csv,.xlsx',
              hint: 'PDF, PNG, JPEG, CSV ou XLSX. Limite de 10 MB.',
            },
          ]}
        />
      </Panel>
    </>
  );
}
