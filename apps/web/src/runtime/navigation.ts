'use client';
import { useSyncExternalStore } from 'react';
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export class Navigation extends Error {
  constructor(public destination: string) {
    super(destination);
  }
}
export function routeLocation() {
  return typeof window === 'undefined' ? '/' : window.location.hash.slice(1) || '/';
}
export function resolveRoute(href: string, current = routeLocation()) {
  if (href.startsWith('?')) return current.split('?')[0] + href;
  if (!href.startsWith('/') || href.startsWith('//')) throw new Error('Destino de navegação inválido.');
  return href;
}
export function routeHref(href: string) {
  return `${basePath}/#${resolveRoute(href)}`;
}
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  window.addEventListener('operis:navigation', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('operis:navigation', listener);
  };
};
export function useLocation() {
  return useSyncExternalStore(subscribe, routeLocation, () => '/');
}
export function usePathname() {
  return useLocation().split('?')[0]!;
}
export const router = {
  push(href: string) {
    window.location.hash = resolveRoute(href);
  },
  replace(href: string) {
    window.history.replaceState(null, '', routeHref(href));
    window.dispatchEvent(new Event('operis:navigation'));
  },
  refresh() {
    window.dispatchEvent(new Event('operis:refresh'));
  },
};
export function useRouter() {
  return router;
}
export function redirect(href: string): never {
  throw new Navigation(href);
}
export function notFound(): never {
  throw new Navigation('/nao-encontrado');
}
export function authCallbackUrl(recovery = false) {
  const app = process.env.NEXT_PUBLIC_APP_URL || `${window.location.origin}${basePath}/`;
  const url = new URL(app.endsWith('/') ? app : `${app}/`);
  url.searchParams.set('auth', recovery ? 'recovery' : 'callback');
  return url.toString();
}
