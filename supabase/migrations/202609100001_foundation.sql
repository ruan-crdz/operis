-- Tenant identity and permission data. All writes are checked in PostgreSQL.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '' check(length(full_name)<=180), phone text not null default '', job_title text not null default '', avatar_path text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_preferences (
 id uuid primary key references public.profiles(id) on delete cascade,
 theme text not null default 'light' check(theme in ('light','dark','system')),
 density text not null default 'comfortable' check(density in ('comfortable','compact')),
 sidebar_collapsed boolean not null default false, timezone text not null default 'America/Sao_Paulo',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organizations (id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 180),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.organization_settings (id uuid primary key default gen_random_uuid(),organization_id uuid not null unique references public.organizations(id),ai_enabled boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.departments (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(name) between 2 and 100),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,name));
create table public.organization_members (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),user_id uuid not null references public.profiles(id),department_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,user_id),unique(organization_id,id),foreign key(organization_id,department_id) references public.departments(organization_id,id));
create table public.roles (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null,created_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,name));
create table public.permissions (id text primary key);
create table public.role_permissions (organization_id uuid not null references public.organizations(id),role_id uuid not null,permission text not null references public.permissions(id),primary key(role_id,permission),foreign key(organization_id,role_id) references public.roles(organization_id,id));
create table public.member_roles (organization_id uuid not null references public.organizations(id),member_id uuid not null,role_id uuid not null,primary key(member_id,role_id),foreign key(organization_id,member_id) references public.organization_members(organization_id,id) on delete cascade,foreign key(organization_id,role_id) references public.roles(organization_id,id));
insert into public.permissions(id) select unnest(array['organization.manage','members.read','members.manage','clients.read','clients.create','clients.update','clients.archive','tasks.read','tasks.create','tasks.update','tasks.assign','documents.read','documents.upload','documents.manage','imports.read','imports.create','imports.approve','audit.read','settings.manage']);

create function public.is_org_member(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members where organization_id=org_id and user_id=(select auth.uid())); $$;
create function public.has_org_permission(org_id uuid, permission text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members m join public.member_roles mr on mr.member_id=m.id and mr.organization_id=m.organization_id join public.role_permissions rp on rp.role_id=mr.role_id and rp.organization_id=m.organization_id where m.organization_id=org_id and m.user_id=(select auth.uid()) and rp.permission=$2); $$;
create function public.share_organization(other_user uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organization_members a join public.organization_members b on a.organization_id=b.organization_id where a.user_id=(select auth.uid()) and b.user_id=other_user); $$;

create table public.clients (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(name) between 2 and 180),trade_name text not null default '',tax_id text not null default '',email text not null default '',tax_regime text not null default 'simples' check(tax_regime in ('simples','presumido','real','other')),archived_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id));
create unique index clients_tax_id on public.clients(organization_id,tax_id) where tax_id<>'';
create index clients_name on public.clients(organization_id,name);
create table public.competencies (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),client_id uuid not null,month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),status text not null default 'open' check(status in ('open','review','closed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,client_id,month),foreign key(organization_id,client_id) references public.clients(organization_id,id));
create table public.tasks (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),client_id uuid not null,competence text not null check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),title text not null check(length(title) between 3 and 200),description text not null default '',status text not null default 'backlog' check(status in ('backlog','waiting_client','ready','in_progress','review','blocked','completed')),priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),department_id uuid,assignee_id uuid,created_by uuid not null default auth.uid() references public.profiles(id),due_date date,started_at timestamptz,completed_at timestamptz,blocked_reason text,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),foreign key(organization_id,client_id) references public.clients(organization_id,id),foreign key(organization_id,department_id) references public.departments(organization_id,id),foreign key(organization_id,assignee_id) references public.organization_members(organization_id,user_id),check(status<>'blocked' or length(trim(blocked_reason))>0 and blocked_reason is not null));
create index tasks_queue on public.tasks(organization_id,assignee_id,status,due_date);
create index tasks_client on public.tasks(organization_id,client_id,competence);
create table public.task_comments (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),task_id uuid not null,author_id uuid not null default auth.uid() references public.profiles(id),body text not null check(length(body) between 1 and 5000),created_at timestamptz not null default now(),foreign key(organization_id,task_id) references public.tasks(organization_id,id));
create table public.task_dependencies (organization_id uuid not null references public.organizations(id),task_id uuid not null,depends_on_id uuid not null,primary key(task_id,depends_on_id),check(task_id<>depends_on_id),foreign key(organization_id,task_id) references public.tasks(organization_id,id),foreign key(organization_id,depends_on_id) references public.tasks(organization_id,id));
create table public.documents (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),client_id uuid not null,competence text not null check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),original_filename text not null,mime_type text not null,size bigint not null check(size>0 and size<=10485760),storage_path text not null unique,checksum text not null,uploaded_by uuid not null default auth.uid() references public.profiles(id),category text not null default 'general',created_at timestamptz not null default now(),unique(organization_id,id),foreign key(organization_id,client_id) references public.clients(organization_id,id));
create index documents_client on public.documents(organization_id,client_id,created_at desc);
create table public.document_requests (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),client_id uuid not null,title text not null check(length(title) between 3 and 200),competence text not null check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),due_date date,created_by uuid not null default auth.uid() references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),foreign key(organization_id,client_id) references public.clients(organization_id,id));
create table public.document_request_items (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),request_id uuid not null,label text not null check(length(label) between 1 and 200),status text not null default 'pending' check(status in ('pending','received','validating','accepted','rejected')),document_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(organization_id,request_id) references public.document_requests(organization_id,id),foreign key(organization_id,document_id) references public.documents(organization_id,id));
create table public.notifications (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),user_id uuid not null references public.profiles(id),kind text not null,title text not null,href text not null,read_at timestamptz,dedupe_key text unique,created_at timestamptz not null default now());
create index notifications_user on public.notifications(organization_id,user_id,created_at desc);
create table public.audit_logs (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),actor_id uuid references public.profiles(id),action text not null,entity_type text not null,entity_id uuid,metadata jsonb not null default '{}',correlation_id uuid not null default gen_random_uuid(),created_at timestamptz not null default now());
create index audit_timeline on public.audit_logs(organization_id,created_at desc);
create table public.outbox_events (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),kind text not null,entity_id uuid not null,status text not null default 'pending' check(status in ('pending','processing','completed','failed')),attempt_count integer not null default 0,last_error text,scheduled_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now(),unique(kind,entity_id));
create table public.ai_runs (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),actor_id uuid not null references public.profiles(id),entity_id uuid not null,feature text not null,model text not null,prompt_version text not null,duration_ms integer not null,tokens integer not null default 0,status text not null check(status in ('success','error')),correlation_id uuid not null default gen_random_uuid(),created_at timestamptz not null default now());

create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); if (to_jsonb(new)->>'organization_id') is distinct from (to_jsonb(old)->>'organization_id') then raise exception 'Organization is immutable'; end if; return new; end $$;
create function public.bootstrap_profile() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),180)); insert into public.user_preferences(id) values(new.id); return new; end $$;
create trigger auth_user_created after insert on auth.users for each row execute function public.bootstrap_profile();

create function public.audit_entity() returns trigger language plpgsql security definer set search_path='' as $$
declare entity jsonb; old_entity jsonb; info jsonb; begin
 entity=to_jsonb(new); old_entity=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 info=jsonb_build_object('changed_fields',(select coalesce(jsonb_agg(key),'[]') from jsonb_each(entity) where key not in ('updated_at','created_at') and value is distinct from old_entity->key));
 if TG_TABLE_NAME='tasks' then info=info||jsonb_build_object('status',entity->>'status','previous_status',old_entity->>'status'); end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values((entity->>'organization_id')::uuid,auth.uid(),TG_TABLE_NAME||'.'||lower(TG_OP),TG_TABLE_NAME,(entity->>'id')::uuid,info);return new;
end $$;
create function public.protect_task() returns trigger language plpgsql set search_path='' as $$ begin
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.created_by<>old.created_by or new.organization_id<>old.organization_id then raise exception 'Immutable task identity';end if;
  if new.assignee_id is distinct from old.assignee_id and not public.has_org_permission(new.organization_id,'tasks.assign') then raise exception 'Assignment not permitted';end if;
  new.version=old.version+1;
 else
  if new.created_by<>auth.uid() then raise exception 'Invalid creator';end if;
  if new.assignee_id is not null and not public.has_org_permission(new.organization_id,'tasks.assign') then raise exception 'Assignment not permitted';end if;
 end if;
 if new.status in ('in_progress','completed') and exists(select 1 from public.task_dependencies d join public.tasks t on t.id=d.depends_on_id where d.task_id=new.id and t.status<>'completed') then raise exception 'Open dependency';end if;
 if new.status='completed' then new.completed_at=coalesce(new.completed_at,now());else new.completed_at=null;end if;
 if new.status='in_progress' then new.started_at=coalesce(new.started_at,now());end if;
 return new;end $$;
create trigger protect_task before insert or update on public.tasks for each row execute function public.protect_task();
create function public.notify_task() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.assignee_id is not null and (TG_OP='INSERT' or new.assignee_id is distinct from old.assignee_id) then
 insert into public.notifications(organization_id,user_id,kind,title,href) values(new.organization_id,new.assignee_id,'task_assigned','Uma tarefa foi atribuída a você','/app/tarefas/'||new.id);end if;return new;end $$;
create trigger task_assigned after insert or update on public.tasks for each row execute function public.notify_task();

-- RPC creation is atomic; membership and permission grants are never client-writable.
create function public.create_organization(org_name text, person_name text, department_names text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; member uuid; owner_role uuid; operator_role uuid; reader_role uuid; begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if length(trim(person_name))<2 or cardinality(department_names)>20 then raise exception 'Invalid onboarding';end if;
 update public.profiles set full_name=left(trim(person_name),180) where id=auth.uid();
 insert into public.organizations(name,created_by) values(trim(org_name),auth.uid()) returning id into org;
 insert into public.organization_settings(organization_id) values(org);
 insert into public.departments(organization_id,name) select org,trim(n) from unnest(department_names) n;
 insert into public.organization_members(organization_id,user_id) values(org,auth.uid()) returning id into member;
 insert into public.roles(organization_id,name) values(org,'Administrador') returning id into owner_role;
 insert into public.roles(organization_id,name) values(org,'Operador') returning id into operator_role;
 insert into public.roles(organization_id,name) values(org,'Leitor') returning id into reader_role;
 insert into public.role_permissions(organization_id,role_id,permission) select org,owner_role,id from public.permissions;
 insert into public.role_permissions(organization_id,role_id,permission) select org,operator_role,id from public.permissions where id not in ('organization.manage','members.manage','imports.approve','settings.manage','audit.read');
 insert into public.role_permissions(organization_id,role_id,permission) select org,reader_role,id from public.permissions where id like '%.read' and id<>'audit.read';
 insert into public.member_roles(organization_id,member_id,role_id) values(org,member,owner_role);
 return org;end $$;
create function public.manage_member(org_id uuid, email_address text, selected_role uuid, selected_department uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare target_user uuid; member uuid; begin
 if not public.has_org_permission(org_id,'members.manage') then raise exception 'Permission denied';end if;
 select id into target_user from auth.users where lower(email)=lower(trim(email_address));
 if target_user is null then raise exception 'Conta não encontrada. Peça ao colaborador para criar uma conta primeiro.';end if;
 if target_user=(select created_by from public.organizations where id=org_id) then raise exception 'O proprietário mantém acesso administrativo.';end if;
 insert into public.organization_members(organization_id,user_id,department_id) values(org_id,target_user,selected_department) on conflict(organization_id,user_id) do update set department_id=excluded.department_id returning id into member;
 delete from public.member_roles where member_id=member;
 insert into public.member_roles(organization_id,member_id,role_id) values(org_id,member,selected_role);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(org_id,auth.uid(),'permission.changed','organization_members',member);
end $$;

-- Explicit grants, RLS on every exposed table, no anonymous data access.
do $$ declare t text; begin
 foreach t in array array['profiles','user_preferences','organizations','organization_settings','departments','organization_members','roles','permissions','role_permissions','member_roles','clients','competencies','tasks','task_comments','task_dependencies','documents','document_requests','document_request_items','notifications','audit_logs','outbox_events','ai_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['profiles','user_preferences','organizations','organization_settings','departments','organization_members','clients','competencies','tasks','document_requests','document_request_items'] loop
  execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()',t);
 end loop;
 foreach t in array array['clients','tasks','documents','document_requests','document_request_items','competencies','organization_settings'] loop
  execute format('create trigger audit after insert or update on public.%I for each row execute function public.audit_entity()',t);
 end loop;
end $$;
grant update(full_name,phone,job_title,avatar_path) on public.profiles to authenticated;
grant update(theme,density,sidebar_collapsed,timezone) on public.user_preferences to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.share_organization(id));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy preferences_self on public.user_preferences for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy org_read on public.organizations for select to authenticated using(public.is_org_member(id));
grant update(name) on public.organizations to authenticated;
create policy org_update on public.organizations for update to authenticated using(public.has_org_permission(id,'organization.manage')) with check(public.has_org_permission(id,'organization.manage'));
create policy permissions_read on public.permissions for select to authenticated using(true);
do $$ declare t text; begin foreach t in array array['organization_settings','departments','organization_members','roles','role_permissions','member_roles'] loop
 execute format('create policy member_read on public.%I for select to authenticated using(public.is_org_member(organization_id))',t);end loop;end $$;
grant update(ai_enabled) on public.organization_settings to authenticated;
create policy settings_update on public.organization_settings for update to authenticated using(public.has_org_permission(organization_id,'settings.manage'));
grant insert,update on public.departments to authenticated;
create policy departments_write on public.departments for all to authenticated using(public.has_org_permission(organization_id,'members.manage')) with check(public.has_org_permission(organization_id,'members.manage'));
do $$ declare t text; p text; begin
 for t,p in select * from (values ('clients','clients'),('competencies','clients'),('tasks','tasks'),('task_comments','tasks'),('task_dependencies','tasks'),('documents','documents'),('document_requests','documents'),('document_request_items','documents')) v(t,p) loop
 execute format('create policy entity_read on public.%I for select to authenticated using(public.has_org_permission(organization_id,%L))',t,p||'.read');end loop;
end $$;
grant insert,update on public.clients,public.competencies,public.tasks,public.document_requests,public.document_request_items to authenticated;
grant insert on public.task_comments,public.documents to authenticated;
create policy clients_insert on public.clients for insert to authenticated with check(public.has_org_permission(organization_id,'clients.create') and archived_at is null);
create policy clients_update on public.clients for update to authenticated using(public.has_org_permission(organization_id,'clients.update')) with check(public.has_org_permission(organization_id,'clients.update'));
create function public.protect_client() returns trigger language plpgsql set search_path='' as $$ begin if new.archived_at is distinct from old.archived_at and not public.has_org_permission(new.organization_id,'clients.archive') then raise exception 'Archive not permitted';end if;return new;end $$;
create trigger protect_client before update on public.clients for each row execute function public.protect_client();
create policy competencies_write on public.competencies for all to authenticated using(public.has_org_permission(organization_id,'clients.update')) with check(public.has_org_permission(organization_id,'clients.update'));
create policy tasks_insert on public.tasks for insert to authenticated with check(public.has_org_permission(organization_id,'tasks.create') and created_by=auth.uid());
create policy tasks_update on public.tasks for update to authenticated using(public.has_org_permission(organization_id,'tasks.update')) with check(public.has_org_permission(organization_id,'tasks.update'));
create policy comments_insert on public.task_comments for insert to authenticated with check(public.has_org_permission(organization_id,'tasks.update') and author_id=auth.uid());
create policy documents_insert on public.documents for insert to authenticated with check(public.has_org_permission(organization_id,'documents.upload') and uploaded_by=auth.uid() and storage_path like 'organizations/'||organization_id||'/clients/'||client_id||'/%');
create policy requests_write on public.document_requests for all to authenticated using(public.has_org_permission(organization_id,'documents.manage')) with check(public.has_org_permission(organization_id,'documents.manage') and created_by=auth.uid());
create policy request_items_write on public.document_request_items for all to authenticated using(public.has_org_permission(organization_id,'documents.manage')) with check(public.has_org_permission(organization_id,'documents.manage'));
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid() and public.is_org_member(organization_id));
grant update(read_at) on public.notifications to authenticated;
create policy notifications_update on public.notifications for update to authenticated using(user_id=auth.uid() and public.is_org_member(organization_id));
create policy audit_read on public.audit_logs for select to authenticated using(public.has_org_permission(organization_id,'audit.read'));
create policy outbox_read on public.outbox_events for select to authenticated using(public.has_org_permission(organization_id,'imports.read'));
create policy ai_read on public.ai_runs for select to authenticated using(public.has_org_permission(organization_id,'imports.read'));
grant insert on public.ai_runs to authenticated;
create policy ai_insert on public.ai_runs for insert to authenticated with check(actor_id=auth.uid() and public.has_org_permission(organization_id,'imports.create'));

revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_org_member(uuid),public.has_org_permission(uuid,text),public.share_organization(uuid),public.create_organization(text,text,text[]),public.manage_member(uuid,text,uuid,uuid) to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
