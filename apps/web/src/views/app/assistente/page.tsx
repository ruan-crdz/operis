import { PageHeader } from '@operis/ui';
import { getContext } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { AssistantChat } from '@/features/assistant/chat';
export default async function Assistant() {
  const { db, orgId } = await getContext();
  const settings = await db
    .from('organization_settings')
    .select('ai_enabled')
    .eq('organization_id', orgId)
    .single();
  check(settings.error);
  return (
    <>
      <PageHeader
        eyebrow="Inteligência"
        title="Assistente"
        description="Pergunte sobre clientes, competências, documentos, ou como usar o Operis."
      />
      <AssistantChat aiEnabled={Boolean(settings.data?.ai_enabled)} />
    </>
  );
}
