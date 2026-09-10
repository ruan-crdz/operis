'use client';
import { useState, useId } from 'react';
import { useRouter } from '@/runtime/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Input } from '@operis/ui';
import type { ActionResult, SelectOption } from '@operis/types';
import { invokeAction } from './invoke-action';
export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'date' | 'month' | 'textarea' | 'select' | 'number' | 'file';
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: SelectOption[];
  value?: string;
  full?: boolean;
  accept?: string;
};
export function ActionForm({
  action,
  fields,
  submit = 'Salvar alterações',
  hidden = {},
  redirectTo,
  columns = false,
  disabled = false,
  children,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  fields: Field[];
  submit?: string;
  hidden?: Record<string, string>;
  redirectTo?: string;
  columns?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const formId = useId();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const {
    register,
    setError,
    trigger,
    formState: { errors },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(
      z.record(z.string(), z.string()).superRefine((values, context) => {
        for (const field of fields) {
          if (field.type === 'file') continue;
          const value = values[field.name] ?? '';
          if (field.required && !value.trim())
            context.addIssue({ code: 'custom', path: [field.name], message: 'Preencha este campo.' });
          else if (field.type === 'email' && value && !z.email().safeParse(value).success)
            context.addIssue({ code: 'custom', path: [field.name], message: 'Informe um email válido.' });
        }
      }),
    ),
    defaultValues: Object.fromEntries(
      fields
        .filter((f) => f.type !== 'file')
        .map((f) => [f.name, f.value ?? (f.type === 'select' ? (f.options?.[0]?.value ?? '') : '')]),
    ),
  });
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!(await trigger())) return;
        const payload = new FormData(form);
        setPending(true);
        setResult(null);
        try {
          const response = await invokeAction(action, payload);
          setResult(response);
          if (!response.ok)
            Object.entries(response.fields ?? {}).forEach(([name, message]) => setError(name, { message }));
          if (response.ok) {
            router.refresh();
            if (redirectTo) router.push(redirectTo);
          }
        } catch {
          setResult({
            ok: false,
            message: 'A conexão foi interrompida. Seus campos foram preservados; tente novamente.',
          });
        } finally {
          setPending(false);
        }
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className={columns ? 'form-grid' : 'form-stack'}>
        {fields.map((field) => (
          <div className={`field ${field.full ? 'span-full' : ''}`} key={field.name}>
            <label htmlFor={`${formId}-${field.name}`}>
              {field.label}
              {field.required ? ' *' : ''}
            </label>
            {field.type === 'select' ? (
              <select
                id={`${formId}-${field.name}`}
                {...register(field.name)}
                required={field.required}
                disabled={disabled || pending}
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={`${formId}-${field.name}-hint`}
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                id={`${formId}-${field.name}`}
                {...register(field.name)}
                required={field.required}
                placeholder={field.placeholder}
                disabled={disabled || pending}
              />
            ) : field.type === 'file' ? (
              <Input
                id={`${formId}-${field.name}`}
                name={field.name}
                type="file"
                required={field.required}
                accept={field.accept}
                disabled={disabled || pending}
              />
            ) : (
              <Input
                id={`${formId}-${field.name}`}
                {...register(field.name)}
                type={field.type ?? 'text'}
                required={field.required}
                placeholder={field.placeholder}
                disabled={disabled || pending}
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={`${formId}-${field.name}-hint`}
                autoComplete={
                  field.type === 'password'
                    ? 'current-password'
                    : field.type === 'email'
                      ? 'email'
                      : undefined
                }
              />
            )}
            <span
              id={`${formId}-${field.name}-hint`}
              className={errors[field.name] ? 'field-error' : 'field-hint'}
            >
              {errors[field.name]?.message ?? field.hint}
            </span>
          </div>
        ))}
      </div>
      {children}
      {result && (
        <div style={{ marginTop: 16 }}>
          <Alert tone={result.ok ? 'success' : 'danger'}>{result.message}</Alert>
        </div>
      )}
      <div className="form-actions">
        <Button loading={pending} disabled={disabled} type="submit">
          {submit}
        </Button>
      </div>
    </form>
  );
}
export function ActionButton({
  action,
  fields = {},
  children,
  confirm,
  variant = 'secondary',
}: {
  action: (form: FormData) => Promise<ActionResult<unknown>>;
  fields?: Record<string, string>;
  children: React.ReactNode;
  confirm?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const router = useRouter();
  return (
    <div>
      <Button
        variant={variant}
        loading={pending}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setPending(true);
          try {
            const form = new FormData();
            Object.entries(fields).forEach(([k, v]) => form.set(k, v));
            const response = await invokeAction(action, form);
            setResult(response);
            if (response.ok) router.refresh();
          } catch {
            setResult({ ok: false, message: 'Não foi possível concluir. Tente novamente.' });
          } finally {
            setPending(false);
          }
        }}
      >
        {children}
      </Button>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={result.ok ? 'muted' : 'field-error'}
          style={{ fontSize: 12, marginTop: 8 }}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
