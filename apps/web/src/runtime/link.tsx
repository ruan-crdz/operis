'use client';
import type { AnchorHTMLAttributes, FormHTMLAttributes } from 'react';
import { router, routeHref, useLocation } from './navigation';
export default function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  useLocation();
  const download = href.startsWith('/api/');
  const internal = href.startsWith('/') || href.startsWith('?');
  return (
    <a
      {...props}
      href={internal ? routeHref(download ? '/app/documentos' : href) : href}
      onClick={async (event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (download) {
          event.preventDefault();
          try {
            const { downloadFile } = await import('@/client/downloads');
            await downloadFile(href);
          } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.');
          }
        }
      }}
    />
  );
}
export function FilterForm(props: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        new FormData(event.currentTarget).forEach((value, key) => {
          if (typeof value === 'string') params.set(key, value);
        });
        router.push(`?${params}`);
      }}
    />
  );
}
