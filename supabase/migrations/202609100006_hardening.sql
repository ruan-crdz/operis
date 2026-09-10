alter table public.profiles add constraint avatar_owned_path check(avatar_path is null or avatar_path like id::text||'/%');
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin
 new.updated_at=now();
 if (to_jsonb(new)->>'organization_id') is distinct from (to_jsonb(old)->>'organization_id') or (to_jsonb(new)->>'id') is distinct from (to_jsonb(old)->>'id') or (to_jsonb(new)->>'created_at') is distinct from (to_jsonb(old)->>'created_at') then raise exception 'Identity and organization are immutable';end if;
 return new;end $$;
-- Indexes for tenant joins used by permission checks and document checklists.
create index member_user on public.organization_members(user_id,organization_id);
create index comments_task on public.task_comments(organization_id,task_id,created_at desc);
create index requests_client on public.document_requests(organization_id,client_id,due_date);
create index request_items_parent on public.document_request_items(organization_id,request_id);
create index outbox_pending on public.outbox_events(scheduled_at) where status='pending';

create function public.set_task_dependency(task_id uuid, dependency_id uuid, remove_dependency boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.tasks where id=task_id;
 if not public.has_org_permission(org,'tasks.update') then raise exception 'Permission denied';end if;
 -- Serialize graph edits within the organization, preventing concurrent cycles.
 perform 1 from public.organizations where id=org for update;
 if remove_dependency then delete from public.task_dependencies d where d.task_id=$1 and d.depends_on_id=$2 and organization_id=org;
 else
 if exists(select 1 from public.tasks where id=$1 and status in ('in_progress','completed')) then raise exception 'Retorne a tarefa para Pronto antes de adicionar uma dependência.';end if;
 if $1=$2 or exists(with recursive dependencies(id) as(select $2 union select d.depends_on_id from public.task_dependencies d join dependencies p on d.task_id=p.id where d.organization_id=org) select 1 from dependencies where id=$1) then raise exception 'Essa dependência criaria um ciclo.';end if;
 insert into public.task_dependencies(organization_id,task_id,depends_on_id) values(org,$1,$2) on conflict do nothing;
 end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(org,auth.uid(),'task.dependency_changed','tasks',$1,jsonb_build_object('dependency_id',$2,'removed',remove_dependency));
end $$;
revoke all on function public.set_task_dependency(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_task_dependency(uuid,uuid,boolean) to authenticated;
