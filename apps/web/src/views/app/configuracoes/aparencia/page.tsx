import { PageHeader, Panel } from '@operis/ui';
import { getContext } from '@/client/auth/context';
import { ActionForm } from '@/features/forms/action-form';
import { saveAppearance } from '@/client/actions/settings';
export default async function Appearance() {
  const { preferences } = await getContext();
  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title="Aparência"
        description="Uma interface que acompanha seu jeito de trabalhar."
      />
      <Panel className="panel-pad" style={{ maxWidth: 700 }}>
        <ActionForm
          action={saveAppearance}
          fields={[
            {
              name: 'theme',
              label: 'Tema',
              type: 'select',
              value: preferences.theme,
              options: [
                { value: 'light', label: 'Operis Light — claro' },
                { value: 'dark', label: 'Operis Dark — escuro' },
                { value: 'system', label: 'Acompanhar o sistema' },
              ],
            },
            {
              name: 'density',
              label: 'Densidade',
              type: 'select',
              value: preferences.density,
              options: [
                { value: 'comfortable', label: 'Confortável' },
                { value: 'compact', label: 'Compacta' },
              ],
              hint: 'A densidade compacta reduz o espaço entre as informações, preservando a legibilidade.',
            },
          ]}
        />
      </Panel>
    </>
  );
}
