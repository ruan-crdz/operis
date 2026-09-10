'use client';
import { invokeAction } from '@/features/forms/invoke-action';
import Link from '@/runtime/link';
import { usePathname, useRouter } from '@/runtime/navigation';
import {
  LayoutDashboard,
  ListTodo,
  Columns3,
  Building2,
  FolderOpen,
  FileSpreadsheet,
  Settings,
  Users,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Search,
  ChevronRight,
  LogOut,
  Command,
  X,
  Sparkles,
  Sun,
  Moon,
  MonitorCog,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Avatar, Button, Input } from '@operis/ui';
import { Brand } from '@/features/auth/auth-shell';
import { searchRecords } from '@/client/queries';
import { logout } from '@/client/actions/auth';
import { toggleSidebar, setTheme } from '@/client/actions/settings';
const navigation = [
  { href: '/app', label: 'Visão geral', icon: LayoutDashboard, group: '' },
  { href: '/app/fila', label: 'Minha fila', icon: ListTodo, group: 'Operação', permission: 'tasks.read' },
  { href: '/app/tarefas', label: 'Tarefas', icon: Columns3, group: '', permission: 'tasks.read' },
  { href: '/app/clientes', label: 'Clientes', icon: Building2, group: '', permission: 'clients.read' },
  { href: '/app/departamentos', label: 'Departamentos', icon: Users, group: '', permission: 'members.read' },
  { href: '/app/assistente', label: 'Assistente', icon: Sparkles, group: 'Inteligência' },
  {
    href: '/app/documentos',
    label: 'Documentos',
    icon: FolderOpen,
    group: 'Gestão',
    permission: 'documents.read',
  },
  {
    href: '/app/importacoes',
    label: 'Importações',
    icon: FileSpreadsheet,
    group: '',
    permission: 'imports.read',
  },
  {
    href: '/app/auditoria',
    label: 'Histórico e auditoria',
    icon: History,
    group: '',
    permission: 'audit.read',
  },
];
export function AppShell({
  children,
  organization,
  name,
  avatar,
  permissions,
  collapsed: initialCollapsed,
  theme: initialTheme,
  unread,
}: {
  children: React.ReactNode;
  organization: string;
  name: string;
  avatar: string | null;
  permissions: string[];
  collapsed: boolean;
  theme: string;
  unread: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [theme, setThemeState] = useState(initialTheme);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    clients: { id: string; name: string }[];
    tasks: { id: string; title: string }[];
  }>({ clients: [], tasks: [] });
  const [searchError, setSearchError] = useState('');
  const links = navigation.filter((n) => !n.permission || permissions.includes(n.permission));
  const current =
    [...links]
      .reverse()
      .find((n) => pathname === n.href || (n.href !== '/app' && pathname.startsWith(n.href)))?.label ??
    'Configurações';
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    if (!commandOpen || query.length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      searchRecords(query)
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults(data);
          setSearchError('');
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setSearchError('Não foi possível buscar. Tente novamente.');
        });
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, commandOpen]);
  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <Brand />
          <button
            className="button button-ghost button-icon"
            title={`Tema: ${theme === 'light' ? 'claro' : theme === 'dark' ? 'escuro' : 'sistema'}`}
            aria-label="Alternar tema"
            onClick={async () => {
              const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
              setThemeState(next);
              const form = new FormData();
              form.set('theme', next);
              await invokeAction(setTheme, form);
            }}
          >
            {theme === 'light' ? <Sun size={16} /> : theme === 'dark' ? <Moon size={16} /> : <MonitorCog size={16} />}
          </button>
        </div>
        <div className="workspace">
          <Avatar name={organization} />
          <div>
            <div className="workspace-name">{organization}</div>
            <small>SEU ESCRITÓRIO</small>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {links.map((item) => (
            <div key={item.href}>
              {item.group && <p className="nav-label">{item.group}</p>}
              <Link
                className={`nav-link ${pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href)) ? 'active' : ''}`}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            </div>
          ))}
        </nav>
        <div className="nav-bottom">
          <Link
            href="/app/configuracoes"
            className={`nav-link ${pathname.startsWith('/app/configuracoes') ? 'active' : ''}`}
            title="Configurações"
          >
            <Settings size={18} />
            <span>Configurações</span>
          </Link>
          <button
            className="nav-link"
            style={{ border: 0, background: 'transparent', width: '100%' }}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={async () => {
              const next = !collapsed;
              const form = new FormData();
              form.set('collapsed', String(next));
              const result = await invokeAction(toggleSidebar, form);
              if (result.ok) setCollapsed(next);
            }}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="collapse-label">Recolher menu</span>
          </button>
        </div>
        <div className="sidebar-footer">
          <Avatar name={name} src={avatar} />
          <div>
            <Link href="/app/configuracoes/perfil" style={{ fontSize: 12 }}>
              {name || 'Meu perfil'}
            </Link>
            <small>ÁREA DE TRABALHO</small>
          </div>
        </div>
      </aside>
      <div className="shell-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Escritório</span>
            <ChevronRight size={12} />
            <span>{current}</span>
          </div>
          <select
            className="mobile-nav"
            aria-label="Navegar para"
            value={links.find((n) => n.href === pathname)?.href ?? '/app'}
            onChange={(e) => router.push(e.target.value)}
          >
            {links.map((n) => (
              <option key={n.href} value={n.href}>
                {n.label}
              </option>
            ))}
            <option value="/app/configuracoes">Configurações</option>
          </select>
          <div className="actions">
            <button
              className="search-trigger"
              onClick={() => setCommandOpen(true)}
              aria-label="Buscar no Operis"
            >
              <Search size={16} />
              <span>Buscar no Operis</span>
              <kbd>⌘ K</kbd>
            </button>
            <Link
              href="/app/notificacoes"
              className="button button-ghost button-icon"
              aria-label={`${unread} notificações não lidas`}
              style={{ position: 'relative' }}
            >
              <Bell size={18} />
              {unread > 0 && (
                <span
                  style={{ position: 'absolute', top: 0, right: 0, fontSize: 9, color: 'var(--primary)' }}
                >
                  {unread}
                </span>
              )}
            </Link>
            <Link href="/app/configuracoes/perfil" aria-label="Meu perfil">
              <Avatar name={name} src={avatar} />
            </Link>
            <form action={logout}>
              <Button variant="ghost" size="icon" aria-label="Sair">
                <LogOut size={16} />
              </Button>
            </form>
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
      </div>
      <Dialog.Root open={commandOpen} onOpenChange={setCommandOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>
              <span className="actions">
                <Command size={20} />
                Buscar e navegar
              </span>
            </Dialog.Title>
            <Dialog.Description className="muted" style={{ marginBottom: 16 }}>
              Encontre clientes, tarefas ou abra uma área do Operis.
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button className="dialog-close" variant="ghost" size="icon" aria-label="Fechar busca">
                <X size={16} />
              </Button>
            </Dialog.Close>
            <Input
              aria-label="Buscar clientes e tarefas"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite pelo menos 2 caracteres…"
            />
            {searchError && <p role="alert">{searchError}</p>}
            <div className="command-results">
              {query.length < 2 ? (
                links.map((n) => (
                  <Link href={n.href} key={n.href} onClick={() => setCommandOpen(false)}>
                    {n.label}
                  </Link>
                ))
              ) : (
                <>
                  {results.clients.map((c) => (
                    <Link key={c.id} href={`/app/clientes/${c.id}`} onClick={() => setCommandOpen(false)}>
                      Cliente · {c.name}
                    </Link>
                  ))}
                  {results.tasks.map((t) => (
                    <Link key={t.id} href={`/app/tarefas/${t.id}`} onClick={() => setCommandOpen(false)}>
                      Tarefa · {t.title}
                    </Link>
                  ))}
                  {results.clients.length + results.tasks.length === 0 && (
                    <p className="muted" style={{ padding: 12 }}>
                      Nenhum resultado encontrado.
                    </p>
                  )}
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
