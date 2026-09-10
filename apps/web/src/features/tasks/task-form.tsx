import { ActionForm } from '@/features/forms/action-form';
import { saveTask } from '@/client/actions/tasks';
import { getOptions } from '@/client/queries';
import { statusLabels, taskStatuses, today } from '@operis/domain';
import type { Tables } from '@operis/types/database';
export async function TaskForm({ task, clientId }: { task?: Tables<'tasks'>; clientId?: string }) {
  const options = await getOptions();
  return (
    <ActionForm
      action={saveTask}
      columns
      submit={task ? 'Salvar tarefa' : 'Criar tarefa'}
      hidden={task ? { id: task.id, version: String(task.version) } : {}}
      fields={[
        {
          name: 'title',
          label: 'Título da tarefa',
          required: true,
          value: task?.title,
          full: true,
          placeholder: 'Ex.: Conferir variáveis da folha',
        },
        {
          name: 'description',
          label: 'Descrição e orientações',
          type: 'textarea',
          value: task?.description,
          full: true,
        },
        {
          name: 'client_id',
          label: 'Cliente',
          type: 'select',
          required: true,
          value: task?.client_id ?? clientId ?? '',
          options: [{ value: '', label: 'Selecione um cliente' }, ...options.clients],
        },
        {
          name: 'competence',
          label: 'Competência',
          type: 'month',
          required: true,
          value: task?.competence ?? today().slice(0, 7),
        },
        {
          name: 'department_id',
          label: 'Departamento',
          type: 'select',
          value: task?.department_id ?? '',
          options: [{ value: '', label: 'Sem departamento' }, ...options.departments],
        },
        {
          name: 'assignee_id',
          label: 'Responsável',
          type: 'select',
          value: task?.assignee_id ?? '',
          options: [{ value: '', label: 'Não atribuído' }, ...options.members],
        },
        { name: 'due_date', label: 'Prazo', type: 'date', value: task?.due_date ?? '' },
        {
          name: 'priority',
          label: 'Prioridade',
          type: 'select',
          value: task?.priority ?? 'normal',
          options: [
            { value: 'low', label: 'Baixa' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'Alta' },
            { value: 'urgent', label: 'Urgente' },
          ],
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          value: task?.status ?? 'backlog',
          options: taskStatuses.map((s) => ({ value: s, label: statusLabels[s] })),
        },
        {
          name: 'blocked_reason',
          label: 'Motivo do bloqueio',
          value: task?.blocked_reason ?? '',
          hint: 'Obrigatório quando a tarefa estiver bloqueada.',
        },
      ]}
    />
  );
}
