import { notFound } from '@/runtime/navigation';
import { z } from 'zod';
import { PageHeader, Badge } from '@operis/ui';
import { mappingSchema } from '@operis/domain';
import { requirePermission } from '@/client/auth/context';
import { check } from '@/client/actions/helpers';
import { ImportWizard } from '@/features/imports/wizard';
export default async function ImportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, orgId, permissions } = await requirePermission('imports.read');
  const { data: item, error } = await db
    .from('imports')
    .select('*,clients(name)')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  check(error);
  if (!item) notFound();
  const [templates, settings] = await Promise.all([
    db
      .from('import_templates')
      .select('id,name,headers,mapping')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('organization_settings').select('ai_enabled').eq('organization_id', orgId).single(),
  ]);
  check(templates.error);
  check(settings.error);
  const sheets = z
    .array(z.object({ name: z.string(), rows: z.array(z.array(z.string())) }))
    .parse(item.sheets);
  const validation = z
    .object({
      issues: z.array(
        z.object({
          row: z.number(),
          field: z.string(),
          severity: z.enum(['error', 'warning']),
          message: z.string(),
        }),
      ),
      valid: z.number(),
      ignored: z.number(),
      total: z.number(),
    })
    .nullable()
    .parse(item.validation);
  return (
    <>
      <PageHeader
        eyebrow={`${item.clients?.name} · ${item.competence}`}
        title="Revisar importação"
        description="Mapeie, confira e aprove com segurança."
        actions={<Badge tone="ai">Assistente de importação</Badge>}
      />
      <ImportWizard
        key={`${item.id}:${item.version}`}
        item={item}
        sheets={sheets}
        savedMapping={mappingSchema.parse(item.mapping)}
        validation={validation}
        templates={(templates.data ?? []).map((t) => ({
          ...t,
          headers: z.array(z.string()).parse(t.headers),
          mapping: mappingSchema.parse(t.mapping),
        }))}
        canEdit={permissions.has('imports.create')}
        canApprove={permissions.has('imports.approve')}
        aiConfigured={Boolean(settings.data?.ai_enabled)}
      />
    </>
  );
}
