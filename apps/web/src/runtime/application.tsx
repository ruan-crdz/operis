'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, ToastProvider } from '@operis/ui';
import { routes, matchRoute } from './routes';
import { routeSkeletons, FormSkeleton } from './skeletons';
import { Navigation, router, routeLocation, useLocation } from './navigation';
import { applyPreferences } from './preferences';
import { createClient, isConfigured } from '@/client/db/client';
import Layout from '@/views/app/layout';
import NotFound from '@/app/not-found';
type Loader = (props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) => ReactNode | Promise<ReactNode>;
let callback: Promise<void> | undefined;
async function finishAuth() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('auth')) return;
  if (callback) return callback;
  callback = (async () => {
    const db = createClient();
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const recovery = url.searchParams.get('auth') === 'recovery';
    const result = code
      ? await db.auth.exchangeCodeForSession(code)
      : tokenHash
        ? await db.auth.verifyOtp({ token_hash: tokenHash, type: recovery ? 'recovery' : 'email' })
        : null;
    window.history.replaceState(null, '', `${url.pathname}#/login`);
    if (!result || result.error)
      throw new Error(
        'O link expirou ou foi aberto em outro navegador. Solicite um novo link e abra no navegador em que fez o pedido.',
      );
    router.replace(recovery ? '/atualizar-senha' : '/app');
  })();
  return callback;
}
export default function Application() {
  const location = useLocation();
  const [revision, setRevision] = useState(0);
  const [screen, setScreen] = useState<{ key: string; node: ReactNode }>();
  const key = `${location}:${revision}`;
  useEffect(() => {
    applyPreferences();
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener('operis:refresh', refresh);
    const subscription = isConfigured()
      ? createClient().auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT') {
            setScreen(undefined);
            router.replace('/login');
          }
        }).data.subscription
      : undefined;
    return () => {
      window.removeEventListener('operis:refresh', refresh);
      subscription?.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let current = true;
    (async () => {
      await finishAuth();
      if (location !== routeLocation()) return;
      const url = new URL(location, 'https://operis.invalid');
      const match = matchRoute(url.pathname);
      if (!match) {
        if (current) setScreen({ key, node: <NotFound /> });
        return;
      }
      const { route, id } = match;
      const screenModule = await routes[route]();
      const loader: Loader = screenModule.default;
      let node = await loader({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
      });
      if (url.pathname === '/app' || url.pathname.startsWith('/app/'))
        node = await Layout({ children: node });
      if (current) setScreen({ key, node });
    })().catch((error) => {
      if (!current) return;
      if (error instanceof Navigation) {
        router.replace(error.destination);
        return;
      }
      setScreen({
        key,
        node: (
          <main id="main" className="panel-pad">
            <Alert tone="danger">
              {error instanceof Error ? error.message : 'Não foi possível carregar a página.'}
            </Alert>
            <Button onClick={() => router.refresh()}>Tentar novamente</Button>
            <Button onClick={() => router.replace('/login')}>Voltar para entrar</Button>
          </main>
        ),
      });
    });
    return () => {
      current = false;
    };
  }, [location, key]);
  return (
    <ToastProvider>
      {screen?.key === key ? (
        <div key={key}>{screen.node}</div>
      ) : (
        (() => {
          const match = matchRoute(new URL(location, 'https://operis.invalid').pathname);
          const Placeholder = match ? routeSkeletons[match.route] : FormSkeleton;
          return <Placeholder />;
        })()
      )}
    </ToastProvider>
  );
}
