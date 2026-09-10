import Link from '@/runtime/link';
import { Bell } from 'lucide-react';
import { EmptyState, PageHeader, Panel } from '@operis/ui';
import { formatDate } from '@operis/domain';
import { getContext } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { ActionButton } from '@/features/forms/action-form';
import { markRead } from '@/client/actions/settings';
export default async function Notifications() {
  const { db, orgId, user } = await getContext();
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  check(error);
  return (
    <>
      <PageHeader
        eyebrow="Acompanhe as mudanças"
        title="Notificações"
        description="Atribuições, prazos e resultados da sua operação."
        actions={
          data?.some((n) => !n.read_at) ? (
            <ActionButton action={markRead}>Marcar todas como lidas</ActionButton>
          ) : undefined
        }
      />
      <Panel>
        {data?.length ? (
          data.map((n) => (
            <div key={n.id} className={`notice-row ${!n.read_at ? 'unread' : ''}`}>
              <Bell size={16} className="muted" />
              <div style={{ flex: 1 }}>
                <Link href={n.href}>{n.title}</Link>
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {formatDate(n.created_at)} · {n.read_at ? 'Lida' : 'Não lida'}
                </p>
              </div>
              {!n.read_at && (
                <ActionButton action={markRead} fields={{ id: n.id }}>
                  Marcar como lida
                </ActionButton>
              )}
            </div>
          ))
        ) : (
          <EmptyState
            title="Tudo acompanhado"
            description="Novas atribuições e atualizações da operação aparecerão aqui."
          />
        )}
      </Panel>
    </>
  );
}
