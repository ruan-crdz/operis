'use client';
import { invokeAction } from '@/features/forms/invoke-action';
import Link from '@/runtime/link';
import { useState, useEffect } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { createClient } from '@/client/db/client';
import { listTasks } from '@/client/tasks';
import { Avatar, Badge, Alert } from '@operis/ui';
import { formatDate, statusLabels, taskStatuses, type TaskStatus, priorityLabels } from '@operis/domain';
import type { Tables } from '@operis/types/database';
import { moveTask } from '@/client/actions/tasks';
export type BoardTask = Tables<'tasks'> & { clients: { name: string } | null };
function Board({
  initial,
  orgId,
  canMove,
  query,
}: {
  initial: BoardTask[];
  orgId: string;
  canMove: boolean;
  query: string;
}) {
  const client = useQueryClient();
  const key = ['tasks', orgId, query];
  const [error, setError] = useState('');
  const { data = initial } = useQuery({
    queryKey: key,
    queryFn: async () => {
      return listTasks(Object.fromEntries(new URLSearchParams(query)));
    },
    initialData: initial,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  useEffect(() => {
    const db = createClient();
    const channel = db
      .channel(`tasks:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `organization_id=eq.${orgId}` },
        () => {
          void client.invalidateQueries({ queryKey: ['tasks', orgId] });
        },
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [client, orgId]);
  const mutation = useMutation({
    mutationFn: async ({
      task,
      status,
      reason,
    }: {
      task: BoardTask;
      status: TaskStatus;
      reason: string | null;
    }) => {
      const form = new FormData();
      Object.entries({
        id: task.id,
        status,
        version: String(task.version),
        blocked_reason: reason ?? '',
      }).forEach(([k, v]) => form.set(k, v));
      const result = await invokeAction(moveTask, form);
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onMutate: async ({ task, status }) => {
      setError('');
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<BoardTask[]>(key);
      client.setQueryData<BoardTask[]>(key, (old) =>
        old?.map((t) => (t.id === task.id ? { ...t, status } : t)),
      );
      return { previous };
    },
    onError: (failure, _, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      setError(failure.message);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const move = (task: BoardTask, status: TaskStatus) => {
    if (!canMove || mutation.isPending || task.status === status) return;
    const reason =
      status === 'blocked'
        ? window.prompt('Qual é o motivo do bloqueio?', task.blocked_reason ?? '')
        : task.blocked_reason;
    if (status === 'blocked' && !reason?.trim()) {
      setError('Informe o motivo para bloquear a tarefa.');
      return;
    }
    mutation.mutate({ task, status, reason });
  };
  return (
    <>
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="kanban" aria-label="Quadro de tarefas" aria-busy={mutation.isPending}>
        {taskStatuses.map((status) => (
          <section
            className="kanban-column"
            key={status}
            aria-label={statusLabels[status]}
            onDragOver={(event) => {
              if (canMove) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const task = data.find((t) => t.id === event.dataTransfer.getData('text/plain'));
              if (task) move(task, status);
            }}
          >
            <div className="kanban-heading">
              <span>{statusLabels[status]}</span>
              <Badge>{data.filter((t) => t.status === status).length}</Badge>
            </div>
            <div className="kanban-cards">
              {data
                .filter((t) => t.status === status)
                .map((task) => (
                  <article
                    className="task-card"
                    key={task.id}
                    draggable={canMove && !mutation.isPending}
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}
                  >
                    <div className="actions">
                      <Badge
                        tone={
                          task.priority === 'urgent'
                            ? 'danger'
                            : task.priority === 'high'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {priorityLabels[task.priority]}
                      </Badge>
                      <span className="mono muted">{task.competence}</span>
                    </div>
                    <Link href={`/app/tarefas/${task.id}`}>
                      <h3>{task.title}</h3>
                    </Link>
                    <p className="muted" style={{ fontSize: 11 }}>
                      {task.clients?.name}
                    </p>
                    {task.status === 'blocked' && <p className="field-error">{task.blocked_reason}</p>}
                    <div className="task-card-footer">
                      <span>{formatDate(task.due_date)}</span>
                      <Avatar name={task.assignee_id ? 'Responsável atribuído' : 'Não atribuído'} />
                    </div>
                    {canMove && (
                      <select
                        aria-label={`Mover ${task.title} para`}
                        value={task.status}
                        disabled={mutation.isPending}
                        onChange={(event) => move(task, event.target.value as TaskStatus)}
                      >
                        {taskStatuses.map((s) => (
                          <option key={s} value={s}>
                            Mover para: {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </article>
                ))}
              {!data.some((t) => t.status === status) && (
                <p className="muted" style={{ fontSize: 11, textAlign: 'center', padding: 20 }}>
                  Nenhuma tarefa
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
export function Kanban(props: Parameters<typeof Board>[0]) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Board {...props} />
    </QueryClientProvider>
  );
}
