-- Outbox is the durable source of work. Supabase Cron drains bounded batches.
-- Optional extensions remain optional in lightweight PostgreSQL test environments.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron;
  perform cron.schedule('operis-import-worker','* * * * *','select public.process_pending_imports()');
 end if;
end $$;
create function public.emit_due_notifications() returns void language plpgsql security definer set search_path='' as $$ begin
 insert into public.notifications(organization_id,user_id,kind,title,href,dedupe_key)
 select organization_id,assignee_id,case when due_date<(now() at time zone 'America/Sao_Paulo')::date then 'task_overdue' else 'task_due' end,
 case when due_date<(now() at time zone 'America/Sao_Paulo')::date then 'Uma tarefa está atrasada' else 'Uma tarefa vence hoje' end,
 '/app/tarefas/'||id,'task-due:'||id||':'||due_date
 from public.tasks where assignee_id is not null and status<>'completed' and due_date<=(now() at time zone 'America/Sao_Paulo')::date on conflict(dedupe_key) do nothing;
end $$;
revoke all on function public.emit_due_notifications() from public,anon,authenticated;
grant execute on function public.emit_due_notifications() to service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('operis-due-notifications','0 * * * *','select public.emit_due_notifications()');end if;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.tasks,public.imports,public.notifications;
 end if;
end $$;
create table public.rate_limits (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),user_id uuid not null references public.profiles(id),feature text not null,window_start timestamptz not null default now(),hits integer not null default 1,unique(organization_id,user_id,feature));
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public,anon,authenticated;
grant all on public.rate_limits to service_role;
create function public.consume_rate_limit(org_id uuid, feature_name text) returns boolean language plpgsql security definer set search_path='' as $$
declare hits integer;begin
 if not public.is_org_member(org_id) or feature_name not in ('ai_mapping','upload') then raise exception 'Permission denied';end if;
 insert into public.rate_limits(organization_id,user_id,feature) values(org_id,auth.uid(),feature_name)
 on conflict(organization_id,user_id,feature) do update set hits=case when public.rate_limits.window_start<now()-interval '1 minute' then 1 else public.rate_limits.hits+1 end,window_start=case when public.rate_limits.window_start<now()-interval '1 minute' then now() else public.rate_limits.window_start end returning rate_limits.hits into hits;
 return hits<=case when feature_name='ai_mapping' then 6 else 20 end;
end $$;
revoke all on function public.consume_rate_limit(uuid,text) from public,anon;
grant execute on function public.consume_rate_limit(uuid,text) to authenticated;
