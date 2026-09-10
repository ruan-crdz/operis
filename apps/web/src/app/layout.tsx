import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Operis — O sistema operacional da contabilidade', template: '%s · Operis' },
  description:
    'Organize a operação do seu escritório: clientes, tarefas, documentos e importações com revisão humana.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light" data-density="comfortable">
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <a className="skip-link" href="#main">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
