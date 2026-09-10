import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Inbox, LoaderCircle } from 'lucide-react';
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
export const buttonVariants = cva('button', {
  variants: {
    variant: {
      primary: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      danger: 'button-danger',
      ai: 'button-ai',
    },
    size: { default: '', sm: 'button-sm', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});
export function Button({
  variant,
  size,
  loading,
  children,
  disabled,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', className)} />;
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'ai';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}
export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cn('panel', className)} />;
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={24} />
      </span>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {action}
    </div>
  );
}
export function Alert({
  children,
  tone = 'warning',
}: {
  children: ReactNode;
  tone?: 'warning' | 'danger' | 'success';
}) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
export function Stat({
  label,
  value,
  caption,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  caption: string;
  tone?: string;
}) {
  return (
    <div className={`stat stat-${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString('pt-BR')}</strong>
      <small>{caption}</small>
    </div>
  );
}
export function Avatar({ name, src }: { name: string; src?: string | null }) {
  return src ? (
    <span
      className="avatar"
      role="img"
      aria-label={name}
      style={{ backgroundImage: `url("${src}")`, backgroundSize: 'cover' }}
    />
  ) : (
    <span className="avatar" aria-label={name}>
      {name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0])
        .join('')
        .toUpperCase() || 'OP'}
    </span>
  );
}
