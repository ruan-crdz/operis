import Link from '@/runtime/link';
import { getDpPending } from '@/client/dp';
import { PageHeader, Panel, EmptyState, Badge } from '@operis/ui';
import { AlertTriangle, ClipboardCheck, Clock3 } from 'lucide-react';

export default async function DpPending() {
  const data = await getDpPending();
  const total = data.validations.length + data.collection.length + data.steps.length;
  return (
    <>
      <PageHeader
        eyebrow="Departamento Pessoal"
        title="Pendências centrais"
        description="Erros, confirmações do cliente e etapas bloqueadas reunidos para triagem."
        actions={
          <Link className="button button-secondary" href="/app/departamentos/dp">
            Voltar à carteira
          </Link>
        }
      />
      {!total && (
        <Panel>
          <EmptyState
            title="Nenhuma pendência aberta"
            description="A operação de DP acessível ao seu perfil está em ordem."
          />
        </Panel>
      )}
      <div className="stack">
        {data.validations.length > 0 && (
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <AlertTriangle size={18} /> Validações sem resolução
              </h2>
              <Badge tone="danger">{data.validations.length}</Badge>
            </div>
            {data.validations.map((item) => (
              <Link
                className="list-row"
                key={item.id}
                href={`/app/departamentos/dp/competencia?client=${item.department_processes?.client_id}&competence=${item.department_processes?.competence}`}
              >
                <div>
                  <strong>{item.department_processes?.clients?.name ?? 'Cliente'}</strong>
                  <small className="muted" style={{ display: 'block' }}>
                    {item.message}
                  </small>
                </div>
                <Badge tone={item.severity === 'error' ? 'danger' : 'warning'}>
                  {item.severity === 'error' ? 'Bloqueante' : 'Aviso'}
                </Badge>
              </Link>
            ))}
          </Panel>
        )}
        {data.collection.length > 0 && (
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <Clock3 size={18} /> Aguardando confirmação
              </h2>
              <Badge tone="warning">{data.collection.length}</Badge>
            </div>
            {data.collection.map((item) => (
              <Link
                className="list-row"
                key={item.id}
                href={`/app/departamentos/dp/competencia?client=${item.department_processes?.client_id}&competence=${item.department_processes?.competence}`}
              >
                <div>
                  <strong>{item.department_processes?.clients?.name ?? 'Cliente'}</strong>
                  <small className="muted" style={{ display: 'block' }}>
                    {item.label}
                  </small>
                </div>
                <span className="muted">{item.department_processes?.competence}</span>
              </Link>
            ))}
          </Panel>
        )}
        {data.steps.length > 0 && (
          <Panel>
            <div className="panel-heading">
              <h2 className="actions">
                <ClipboardCheck size={18} /> Etapas bloqueadas ou com falha
              </h2>
              <Badge tone="danger">{data.steps.length}</Badge>
            </div>
            {data.steps.map((item) => (
              <Link
                className="list-row"
                key={item.id}
                href={`/app/departamentos/dp/competencia?client=${item.department_processes?.client_id}&competence=${item.department_processes?.competence}`}
              >
                <div>
                  <strong>{item.department_processes?.clients?.name ?? 'Cliente'}</strong>
                  <small className="muted" style={{ display: 'block' }}>
                    {item.workflow_steps?.name}
                  </small>
                </div>
                <Badge tone="danger">{item.status}</Badge>
              </Link>
            ))}
          </Panel>
        )}
      </div>
    </>
  );
}
