import Link from '@/runtime/link';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader, Panel } from '@operis/ui';
import { getContext } from '@/client/auth/context';
export default async function Settings() {
  const { permissions } = await getContext();
  const links = [
    { href: 'perfil', title: 'Meu perfil', description: 'Nome, cargo, contato e sua foto.' },
    { href: 'aparencia', title: 'Aparência', description: 'Tema claro, escuro e densidade da operação.' },
    ...(permissions.has('members.read')
      ? [
          {
            href: 'equipe',
            title: 'Equipe e acessos',
            description: 'Colaboradores, departamentos e papéis de acesso.',
          },
        ]
      : []),
    ...(permissions.has('organization.manage')
      ? [
          {
            href: 'organizacao',
            title: 'Escritório',
            description: 'Identidade do escritório e uso da inteligência.',
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader
        eyebrow="Seu espaço de trabalho"
        title="Configurações"
        description="Ajuste o Operis à rotina do seu escritório."
      />
      <div className="settings-grid">
        {links.map((link) => (
          <Panel key={link.href}>
            <Link href={`/app/configuracoes/${link.href}`} className="settings-link">
              <h2 className="actions" style={{ justifyContent: 'space-between' }}>
                {link.title}
                <ArrowUpRight size={18} />
              </h2>
              <p className="muted">{link.description}</p>
            </Link>
          </Panel>
        ))}
      </div>
    </>
  );
}
