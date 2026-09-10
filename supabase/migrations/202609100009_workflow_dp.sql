-- Generic versioned workflow engine and the first operational vertical: monthly payroll operations (DP).
insert into public.permissions(id) values
 ('dp.read'),('dp.manage'),('dp.review'),
 ('workflows.read'),('workflows.manage'),
 ('occurrences.read'),('occurrences.manage'),
 ('processes.read'),('processes.manage'),('processes.review')
on conflict do nothing;

-- Competence becomes a first-class cross-tenant relationship in this phase.
alter table public.competencies add unique(organization_id,id);

-- The public client link is represented by a digest only. The clear token is
-- created by the trusted Edge Function when this channel is enabled.
alter table public.document_requests
 add column external_token_hash text,
 add column external_status text not null default 'not_created' check(external_status in ('not_created','active','expired','revoked','answered')),
 add column external_sent_at timestamptz,
 add column external_first_viewed_at timestamptz,
 add column external_responded_at timestamptz,
 add column external_expires_at timestamptz;
create unique index document_requests_external_token on public.document_requests(external_token_hash) where external_token_hash is not null;

-- Import type makes the registry extensible without changing the parser's
-- existing approval boundary.
alter table public.imports add column import_type text not null default 'employee_master'
 check(import_type in ('employee_master','payroll_variables','occurrences','generic_table'));

-- Existing roles receive the same defaults used by create_organization.
insert into public.role_permissions(organization_id,role_id,permission)
select r.organization_id,r.id,p.id from public.roles r cross join public.permissions p
where r.name='Administrador' and p.id in ('dp.read','dp.manage','dp.review','workflows.read','workflows.manage','occurrences.read','occurrences.manage','processes.read','processes.manage','processes.review')
on conflict do nothing;
insert into public.role_permissions(organization_id,role_id,permission)
select r.organization_id,r.id,p.id from public.roles r cross join public.permissions p
where r.name='Operador' and p.id in ('dp.read','dp.manage','dp.review','workflows.read','occurrences.read','occurrences.manage','processes.read','processes.manage','processes.review')
on conflict do nothing;
insert into public.role_permissions(organization_id,role_id,permission)
select r.organization_id,r.id,p.id from public.roles r cross join public.permissions p
where r.name='Leitor' and p.id in ('dp.read','workflows.read','occurrences.read','processes.read')
on conflict do nothing;

create table public.workflows (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), department_id uuid not null,
 slug text not null check(slug ~ '^[a-z][a-z0-9_-]{1,79}$'), name text not null check(length(name) between 3 and 180),
 status text not null default 'draft' check(status in ('draft','published','archived')), created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,slug),
 foreign key(organization_id,department_id) references public.departments(organization_id,id)
);
create table public.workflow_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), workflow_id uuid not null,
 version integer not null check(version>0), status text not null default 'draft' check(status in ('draft','published','archived')),
 require_distinct_reviewer boolean not null default true, settings jsonb not null default '{}', published_at timestamptz,
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,workflow_id,version), foreign key(organization_id,workflow_id) references public.workflows(organization_id,id)
);
create table public.workflow_steps (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), workflow_version_id uuid not null,
 code text not null check(code ~ '^[a-z][a-z0-9_]{1,79}$'), position integer not null check(position>0), name text not null check(length(name) between 3 and 180),
 kind text not null check(kind in ('manual','automatic','approval','wait','condition','integration')), required boolean not null default true,
 expected_duration_minutes integer check(expected_duration_minutes between 1 and 525600), due_offset_days integer not null default 0 check(due_offset_days between -365 and 365),
 config jsonb not null default '{}', created_at timestamptz not null default now(), unique(organization_id,id),
 unique(organization_id,workflow_version_id,code), unique(organization_id,workflow_version_id,position),
 foreign key(organization_id,workflow_version_id) references public.workflow_versions(organization_id,id)
);
create table public.workflow_step_dependencies (
 organization_id uuid not null references public.organizations(id), workflow_version_id uuid not null, step_id uuid not null, depends_on_id uuid not null,
 created_at timestamptz not null default now(), primary key(organization_id,step_id,depends_on_id), check(step_id<>depends_on_id),
 foreign key(organization_id,workflow_version_id) references public.workflow_versions(organization_id,id),
 foreign key(organization_id,step_id) references public.workflow_steps(organization_id,id),
 foreign key(organization_id,depends_on_id) references public.workflow_steps(organization_id,id)
);
create table public.department_processes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), department_id uuid not null, client_id uuid not null,
 competence_id uuid not null, competence text not null check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), workflow_version_id uuid not null,
 status text not null default 'not_started' check(status in ('not_started','collecting_information','waiting_client','ready','in_progress','requires_attention','awaiting_review','approved','completed','blocked')),
 owner_id uuid, reviewer_id uuid, prepared_by uuid references public.profiles(id), started_at timestamptz, due_at timestamptz, ready_at timestamptz,
 completed_at timestamptz, blocked_reason text, metadata jsonb not null default '{}', version integer not null default 1,
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,workflow_version_id,client_id,competence),
 foreign key(organization_id,department_id) references public.departments(organization_id,id), foreign key(organization_id,client_id) references public.clients(organization_id,id),
 foreign key(organization_id,competence_id) references public.competencies(organization_id,id), foreign key(organization_id,workflow_version_id) references public.workflow_versions(organization_id,id),
 foreign key(organization_id,owner_id) references public.organization_members(organization_id,user_id), foreign key(organization_id,reviewer_id) references public.organization_members(organization_id,user_id),
 check(status<>'blocked' or blocked_reason is not null and length(trim(blocked_reason))>=3)
);
create table public.workflow_step_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), process_id uuid not null, workflow_step_id uuid not null,
 status text not null default 'pending' check(status in ('pending','ready','in_progress','waiting','completed','skipped','failed','blocked')),
 assigned_to uuid, task_id uuid, started_at timestamptz, completed_at timestamptz, error text, result jsonb, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,process_id,workflow_step_id),
 unique(task_id), foreign key(organization_id,process_id) references public.department_processes(organization_id,id),
 foreign key(organization_id,workflow_step_id) references public.workflow_steps(organization_id,id),
 foreign key(organization_id,assigned_to) references public.organization_members(organization_id,user_id), foreign key(organization_id,task_id) references public.tasks(organization_id,id)
);
create table public.employees (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), client_id uuid not null,
 name text not null check(length(trim(name)) between 2 and 180), cpf text not null check(public.valid_cpf(cpf)), registration text,
 admission_date date, termination_date date, status text not null default 'active' check(status in ('active','on_leave','terminated')),
 source_import_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 unique(organization_id,client_id,cpf), foreign key(organization_id,client_id) references public.clients(organization_id,id),
 foreign key(organization_id,source_import_id) references public.imports(organization_id,id), check(termination_date is null or admission_date is null or termination_date>=admission_date)
);
create unique index employees_registration on public.employees(organization_id,client_id,registration) where registration is not null;
create table public.payroll_variables (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), process_id uuid not null,
 client_id uuid not null, competence text not null check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), employee_id uuid,
 code text not null check(length(trim(code)) between 1 and 80), kind text not null check(kind in ('earning','discount','quantity','other')),
 quantity numeric(14,4), amount numeric(14,2), source text not null check(source in ('manual','spreadsheet','document','client','integration','ai_assisted')),
 source_import_id uuid, source_sheet text, source_row integer check(source_row is null or source_row>0), idempotency_key uuid not null,
 status text not null default 'staging' check(status in ('staging','validated','rejected','applied')), metadata jsonb not null default '{}',
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,process_id,idempotency_key),
 foreign key(organization_id,process_id) references public.department_processes(organization_id,id),
 foreign key(organization_id,client_id) references public.clients(organization_id,id),
 foreign key(organization_id,employee_id) references public.employees(organization_id,id),
 foreign key(organization_id,source_import_id) references public.imports(organization_id,id),
 check(quantity is not null or amount is not null)
);
create index payroll_variables_process on public.payroll_variables(organization_id,process_id,status,employee_id);
create table public.dp_occurrences (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), process_id uuid not null, client_id uuid not null,
 competence_id uuid not null, type text not null check(type in ('admission','termination','vacation','leave','salary_change','role_change','work_schedule_change','dependent_change','variable_earning','variable_discount','overtime','absence','bonus','commission','other')),
 status text not null default 'draft' check(status in ('draft','received','requires_review','validated','rejected','applied')),
 employee_id uuid, effective_date date not null, reported_at timestamptz not null default now(), source text not null check(source in ('manual','spreadsheet','document','client','integration','ai_assisted')),
 source_document_id uuid, source_import_id uuid, source_sheet text, source_row integer check(source_row is null or source_row>0), idempotency_key uuid not null,
 created_by uuid not null default auth.uid() references public.profiles(id), reviewed_by uuid references public.profiles(id), notes text not null default '' check(length(notes)<=4000),
 metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,process_id,idempotency_key),
 foreign key(organization_id,process_id) references public.department_processes(organization_id,id), foreign key(organization_id,client_id) references public.clients(organization_id,id),
 foreign key(organization_id,competence_id) references public.competencies(organization_id,id), foreign key(organization_id,employee_id) references public.employees(organization_id,id),
 foreign key(organization_id,source_document_id) references public.documents(organization_id,id), foreign key(organization_id,source_import_id) references public.imports(organization_id,id)
);
create table public.dp_collection_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), process_id uuid not null,
 code text not null, label text not null check(length(label) between 2 and 180), position integer not null,
 status text not null default 'not_requested' check(status in ('not_requested','requested','waiting','received','validated','not_applicable','rejected')),
 response text not null default 'pending' check(response in ('pending','has_information','no_occurrence','not_applicable')),
 document_id uuid, notes text not null default '' check(length(notes)<=2000), updated_by uuid references public.profiles(id), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,process_id,code), foreign key(organization_id,process_id) references public.department_processes(organization_id,id),
 foreign key(organization_id,document_id) references public.documents(organization_id,id), check(response<>'has_information' or status not in ('not_requested','requested'))
);
create table public.dp_validation_results (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), process_id uuid not null, validation_run_id uuid not null,
 rule_id text not null, rule_version integer not null check(rule_version>0), category text not null check(category in ('data_quality','operational','legal','financial','integration')),
 severity text not null check(severity in ('error','warning','info')), entity_type text not null, entity_id uuid, message text not null, details jsonb not null default '{}',
 created_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid references public.profiles(id), resolution text,
 unique(organization_id,id), foreign key(organization_id,process_id) references public.department_processes(organization_id,id),
 check(resolved_at is null or resolved_by is not null and resolution is not null and length(trim(resolution))>=5)
);
create table public.process_approvals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), process_id uuid not null,
 requested_by uuid not null references public.profiles(id), decided_by uuid references public.profiles(id), decision text not null default 'pending' check(decision in ('pending','approved','returned')),
 comment text not null default '' check(length(comment)<=2000), requested_at timestamptz not null default now(), decided_at timestamptz,
 unique(organization_id,id), foreign key(organization_id,process_id) references public.department_processes(organization_id,id), check(decision='pending' or decided_by is not null and decided_at is not null)
);
create unique index one_pending_process_approval on public.process_approvals(organization_id,process_id) where decision='pending';
create table public.process_evidence (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), process_id uuid not null,
 evidence_type text not null check(evidence_type in ('document','import','validation','approval','occurrence','comment')), entity_id uuid not null,
 added_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(), unique(organization_id,id),
 unique(organization_id,process_id,evidence_type,entity_id), foreign key(organization_id,process_id) references public.department_processes(organization_id,id)
);

create index department_processes_portfolio on public.department_processes(organization_id,department_id,competence,status,owner_id);
create index department_processes_owner on public.department_processes(organization_id,owner_id,status,due_at);
create index workflow_step_runs_process on public.workflow_step_runs(organization_id,process_id,status);
create index dp_occurrences_process on public.dp_occurrences(organization_id,process_id,type,status);
create index dp_occurrences_employee on public.dp_occurrences(organization_id,employee_id,effective_date) where employee_id is not null;
create index dp_collection_process on public.dp_collection_items(organization_id,process_id,status);
create index dp_validation_open on public.dp_validation_results(organization_id,process_id,severity) where resolved_at is null;

-- A completed employee-master import promotes identity data to the durable
-- registry. Salary remains only in the immutable competence snapshot.
create function public.promote_employee_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.employees(organization_id,client_id,name,cpf,admission_date,source_import_id)
 values(new.organization_id,new.client_id,new.employee_name,new.employee_cpf,new.admission_date,new.import_id)
 on conflict(organization_id,client_id,cpf) do update set
  name=excluded.name,
  admission_date=coalesce(public.employees.admission_date,excluded.admission_date),
  source_import_id=excluded.source_import_id,
  updated_at=now();
 return new;
end $$;
create trigger promote_employee after insert on public.employee_snapshots for each row execute function public.promote_employee_snapshot();

-- Published versions and their graph never change retroactively.
create function public.protect_published_workflow() returns trigger language plpgsql set search_path='' as $$
declare version_status text;
begin
 if tg_table_name='workflow_versions' then
  if old.status='archived' or (old.status='published' and not (tg_op='UPDATE' and new.status='archived' and (to_jsonb(new)-'status')=(to_jsonb(old)-'status'))) then raise exception 'Workflow publicado é imutável. Crie uma nova versão.';end if;
 else
  select status into version_status from public.workflow_versions where id=coalesce(old.workflow_version_id,new.workflow_version_id);
  if version_status in('published','archived') then raise exception 'Workflow publicado é imutável. Crie uma nova versão.';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger immutable_published_version before update or delete on public.workflow_versions for each row execute function public.protect_published_workflow();
create trigger immutable_published_step before update or delete on public.workflow_steps for each row execute function public.protect_published_workflow();
create trigger immutable_published_dependency before update or delete on public.workflow_step_dependencies for each row execute function public.protect_published_workflow();

create function public.prevent_workflow_cycle() returns trigger language plpgsql set search_path='' as $$
declare cycle_found boolean;
begin
 if not exists(select 1 from public.workflow_steps where organization_id=new.organization_id and workflow_version_id=new.workflow_version_id and id in(new.step_id,new.depends_on_id) group by organization_id,workflow_version_id having count(*)=2) then raise exception 'Etapas não pertencem à mesma versão.';end if;
 with recursive graph(step_id,depends_on_id) as (
  select d.step_id,d.depends_on_id from public.workflow_step_dependencies d where d.organization_id=new.organization_id and d.workflow_version_id=new.workflow_version_id
  union select new.step_id,new.depends_on_id
 ), walk(id) as (select new.depends_on_id union select g.depends_on_id from graph g join walk w on g.step_id=w.id)
 select exists(select 1 from walk where id=new.step_id) into cycle_found;
 if cycle_found then raise exception 'Dependência criaria um ciclo no workflow.';end if;
 return new;
end $$;
create trigger workflow_dependency_acyclic before insert or update on public.workflow_step_dependencies for each row execute function public.prevent_workflow_cycle();

create function public.ensure_dp_workflow(org_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare workflow uuid; version_id uuid; department uuid;
begin
 if not public.has_org_permission(org_id,'processes.manage') then raise exception 'Permission denied';end if;
 select id into workflow from public.workflows where organization_id=org_id and slug='dp-monthly-close';
 if workflow is not null then select id into version_id from public.workflow_versions where organization_id=org_id and workflow_id=workflow and status='published' order by version desc limit 1; return version_id;end if;
 select id into department from public.departments where organization_id=org_id and lower(name) in ('departamento pessoal','dp') order by case when lower(name)='departamento pessoal' then 0 else 1 end limit 1;
 if department is null then insert into public.departments(organization_id,name) values(org_id,'Departamento Pessoal') returning id into department;end if;
 insert into public.workflows(organization_id,department_id,slug,name,status) values(org_id,department,'dp-monthly-close','Fechamento mensal — Departamento Pessoal','draft') returning id into workflow;
 insert into public.workflow_versions(organization_id,workflow_id,version,status,require_distinct_reviewer) values(org_id,workflow,1,'draft',true) returning id into version_id;
 insert into public.workflow_steps(organization_id,workflow_version_id,code,position,name,kind,expected_duration_minutes,due_offset_days) values
 (org_id,version_id,'open',1,'Abrir competência','automatic',30,-10),(org_id,version_id,'request',2,'Solicitar informações ao cliente','manual',60,-9),
 (org_id,version_id,'receive',3,'Receber documentos e movimentações','wait',2880,-7),(org_id,version_id,'admissions',4,'Conferir admissões','manual',90,-5),
 (org_id,version_id,'terminations',5,'Conferir desligamentos','manual',90,-5),(org_id,version_id,'vacations',6,'Conferir férias','manual',90,-5),
 (org_id,version_id,'leaves',7,'Conferir afastamentos','manual',60,-5),(org_id,version_id,'registration',8,'Conferir alterações cadastrais','manual',60,-5),
 (org_id,version_id,'variables',9,'Conferir variáveis da folha','manual',120,-4),(org_id,version_id,'validate',10,'Validar informações','automatic',30,-3),
 (org_id,version_id,'resolve',11,'Resolver inconsistências','manual',120,-2),(org_id,version_id,'prepare',12,'Preparar processamento','manual',180,-2),
 (org_id,version_id,'review',13,'Revisão','manual',120,-1),(org_id,version_id,'approval',14,'Aprovação','approval',60,0),
 (org_id,version_id,'close',15,'Fechamento','manual',60,0),(org_id,version_id,'archive',16,'Arquivamento das evidências','manual',60,1);
 insert into public.workflow_step_dependencies(organization_id,workflow_version_id,step_id,depends_on_id)
 select org_id,version_id,s.id,p.id from public.workflow_steps s join public.workflow_steps p on p.organization_id=s.organization_id and p.workflow_version_id=s.workflow_version_id
 where s.workflow_version_id=version_id and ((s.position between 2 and 3 and p.position=s.position-1) or (s.position between 4 and 9 and p.position=3) or (s.position=10 and p.position between 4 and 9) or (s.position between 11 and 16 and p.position=s.position-1));
 update public.workflow_versions set status='published',published_at=now() where id=version_id;
 update public.workflows set status='published' where id=workflow;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(org_id,auth.uid(),'workflow.version.published','workflow_versions',version_id,jsonb_build_object('version',1,'slug','dp-monthly-close'));
 return version_id;
end $$;

create function public.clone_workflow_version(source_version_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare source public.workflow_versions; result uuid; old_step record; new_step_id uuid; id_map jsonb:='{}';
begin
 select * into source from public.workflow_versions where id=source_version_id;
 if not found or not public.has_org_permission(source.organization_id,'workflows.manage') then raise exception 'Permission denied';end if;
 insert into public.workflow_versions(organization_id,workflow_id,version,status,require_distinct_reviewer,settings)
 select source.organization_id,source.workflow_id,coalesce(max(version),0)+1,'draft',source.require_distinct_reviewer,source.settings from public.workflow_versions where organization_id=source.organization_id and workflow_id=source.workflow_id
 returning id into result;
 for old_step in select * from public.workflow_steps where organization_id=source.organization_id and workflow_version_id=source.id order by position loop
  insert into public.workflow_steps(organization_id,workflow_version_id,code,position,name,kind,required,expected_duration_minutes,due_offset_days,config)
  values(source.organization_id,result,old_step.code,old_step.position,old_step.name,old_step.kind,old_step.required,old_step.expected_duration_minutes,old_step.due_offset_days,old_step.config) returning id into new_step_id;
  id_map=id_map||jsonb_build_object(old_step.id::text,new_step_id::text);
 end loop;
 insert into public.workflow_step_dependencies(organization_id,workflow_version_id,step_id,depends_on_id)
 select source.organization_id,result,(id_map->>d.step_id::text)::uuid,(id_map->>d.depends_on_id::text)::uuid from public.workflow_step_dependencies d where d.organization_id=source.organization_id and d.workflow_version_id=source.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(source.organization_id,auth.uid(),'workflow.version.cloned','workflow_versions',result,jsonb_build_object('source_version_id',source.id));
 return result;
end $$;

create function public.publish_workflow_version(version_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.workflow_versions;
begin
 select * into item from public.workflow_versions where id=version_id for update;
 if not found or not public.has_org_permission(item.organization_id,'workflows.manage') then raise exception 'Permission denied';end if;
 if item.status<>'draft' then raise exception 'Somente uma versão em rascunho pode ser publicada.';end if;
 if not exists(select 1 from public.workflow_steps where organization_id=item.organization_id and workflow_version_id=item.id) then raise exception 'Adicione ao menos uma etapa.';end if;
 if (select count(*) from public.workflow_steps s where s.organization_id=item.organization_id and s.workflow_version_id=item.id and not exists(select 1 from public.workflow_step_dependencies d where d.organization_id=s.organization_id and d.workflow_version_id=s.workflow_version_id and d.step_id=s.id))<>1 then raise exception 'O workflow precisa ter exatamente uma etapa inicial.';end if;
 update public.workflow_versions set status='published',published_at=now() where id=item.id;
 update public.workflows set status='published' where organization_id=item.organization_id and id=item.workflow_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'workflow.version.published','workflow_versions',item.id,jsonb_build_object('version',item.version));
end $$;

create function public.archive_workflow_version(version_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.workflow_versions;
begin
 select * into item from public.workflow_versions where id=version_id for update;
 if not found or not public.has_org_permission(item.organization_id,'workflows.manage') then raise exception 'Permission denied';end if;
 if item.status<>'published' then raise exception 'Somente uma versão publicada pode ser arquivada.';end if;
 update public.workflow_versions set status='archived' where id=item.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'workflow.version.archived','workflow_versions',item.id,jsonb_build_object('version',item.version));
end $$;

create function public.start_department_process(org_id uuid,target_client uuid,target_competence text,process_owner uuid default null,process_reviewer uuid default null,due timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare version_id uuid; workflow_id uuid; department uuid; competence_id uuid; process uuid; created boolean:=false; step record; task uuid;
begin
 if not public.has_org_permission(org_id,'processes.manage') then raise exception 'Permission denied';end if;
 if target_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Competência inválida.';end if;
 if not exists(select 1 from public.clients where organization_id=org_id and id=target_client and archived_at is null) then raise exception 'Cliente não pertence ao escritório ou está arquivado.';end if;
 if process_owner is not null and not exists(select 1 from public.organization_members where organization_id=org_id and user_id=process_owner) then raise exception 'Responsável não pertence ao escritório.';end if;
 if process_reviewer is not null and not exists(select 1 from public.organization_members where organization_id=org_id and user_id=process_reviewer) then raise exception 'Revisor não pertence ao escritório.';end if;
 version_id:=public.ensure_dp_workflow(org_id);
 select v.workflow_id,w.department_id into workflow_id,department from public.workflow_versions v join public.workflows w on w.id=v.workflow_id and w.organization_id=v.organization_id where v.id=version_id;
 insert into public.competencies(organization_id,client_id,month) values(org_id,target_client,target_competence) on conflict(organization_id,client_id,month) do update set month=excluded.month returning id into competence_id;
 select id into process from public.department_processes where organization_id=org_id and workflow_version_id=version_id and client_id=target_client and competence=target_competence;
 if process is not null then return process;end if;
 insert into public.department_processes(organization_id,department_id,client_id,competence_id,competence,workflow_version_id,owner_id,reviewer_id,due_at)
 values(org_id,department,target_client,competence_id,target_competence,version_id,coalesce(process_owner,auth.uid()),process_reviewer,coalesce(due,(target_competence||'-25')::date+interval '1 month')) returning id into process;
 insert into public.workflow_step_runs(organization_id,process_id,workflow_step_id,status,assigned_to)
 select org_id,process,s.id,case when not exists(select 1 from public.workflow_step_dependencies d where d.organization_id=org_id and d.workflow_version_id=version_id and d.step_id=s.id) then 'ready' else 'pending' end,coalesce(process_owner,auth.uid())
 from public.workflow_steps s where s.organization_id=org_id and s.workflow_version_id=version_id;
 for step in select sr.id,s.name,s.kind,s.due_offset_days from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id and s.organization_id=sr.organization_id where sr.process_id=process and s.kind in('manual','approval') loop
  insert into public.tasks(organization_id,client_id,competence,title,description,status,priority,department_id,assignee_id,due_date)
  values(org_id,target_client,target_competence,step.name,'Etapa do workflow de fechamento mensal de Departamento Pessoal.','backlog','normal',department,coalesce(process_owner,auth.uid()),(coalesce(due,(target_competence||'-25')::date+interval '1 month')::date+step.due_offset_days)) returning id into task;
  update public.workflow_step_runs set task_id=task where id=step.id;
 end loop;
 insert into public.dp_collection_items(organization_id,process_id,code,label,position) values
 (org_id,process,'admissions','Admissões do período',1),(org_id,process,'terminations','Desligamentos',2),(org_id,process,'vacations','Férias',3),
 (org_id,process,'leaves','Afastamentos',4),(org_id,process,'overtime','Horas extras',5),(org_id,process,'absences','Faltas',6),
 (org_id,process,'commissions','Comissões',7),(org_id,process,'bonuses','Bonificações',8),(org_id,process,'discounts','Descontos',9),
 (org_id,process,'salary_changes','Alterações salariais',10),(org_id,process,'registration_changes','Alterações cadastrais',11),
 (org_id,process,'payroll_file','Folha/ponto ou arquivo equivalente',12),(org_id,process,'other','Outros eventos',13);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(org_id,auth.uid(),'dp.process.created','department_processes',process,jsonb_build_object('competence',target_competence,'workflow_version_id',version_id));
 insert into public.outbox_events(organization_id,kind,entity_id) values(org_id,'dp.process.instantiated',process) on conflict do nothing;
 return process;
end $$;

create function public.bulk_start_department_processes(org_id uuid,client_ids uuid[],target_competence text,process_owner uuid default null,due timestamptz default null) returns integer language plpgsql security definer set search_path='' as $$
declare client uuid; total integer:=0;
begin
 if cardinality(client_ids)>500 then raise exception 'Limite de 500 clientes por abertura.';end if;
 foreach client in array client_ids loop perform public.start_department_process(org_id,client,target_competence,process_owner,null,due);total:=total+1;end loop;
 return total;
end $$;

create function public.update_collection_item(item_id uuid,next_status text,next_response text,document uuid default null,item_notes text default '') returns void language plpgsql security definer set search_path='' as $$
declare item public.dp_collection_items;
begin
 select * into item from public.dp_collection_items where id=item_id for update;
 if not found or not public.has_org_permission(item.organization_id,'dp.manage') then raise exception 'Permission denied';end if;
 if next_status not in ('not_requested','requested','waiting','received','validated','not_applicable','rejected') or next_response not in ('pending','has_information','no_occurrence','not_applicable') then raise exception 'Situação inválida.';end if;
 if next_response='pending' and next_status in ('validated','not_applicable') then raise exception 'Informe se houve movimentação, ausência de ocorrência ou item não aplicável.';end if;
 if next_response='has_information' and next_status in ('not_requested','requested') then raise exception 'Informação recebida exige conferência.';end if;
 update public.dp_collection_items set status=next_status,response=next_response,document_id=document,notes=left(coalesce(item_notes,''),2000),updated_by=auth.uid(),updated_at=now() where id=item_id;
 if document is not null then insert into public.process_evidence(organization_id,process_id,evidence_type,entity_id) values(item.organization_id,item.process_id,'document',document) on conflict do nothing;end if;
 update public.department_processes set status=case when next_status in('requested','waiting') then 'waiting_client' when status='not_started' then 'collecting_information' else status end,started_at=coalesce(started_at,now()),version=version+1 where id=item.process_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'dp.collection.updated','dp_collection_items',item.id,jsonb_build_object('status',next_status,'response',next_response));
end $$;

create function public.create_dp_occurrence(process uuid,occurrence_type text,employee uuid,effective date,occurrence_source text,occurrence_notes text,idempotency uuid,document uuid default null,source_import uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.department_processes; result uuid; requires_employee boolean;
begin
 select * into item from public.department_processes where id=process for update;
 if not found or not public.has_org_permission(item.organization_id,'occurrences.manage') then raise exception 'Permission denied';end if;
 if item.status='completed' then raise exception 'Reabra o processo antes de registrar movimentações.';end if;
 requires_employee:=occurrence_type not in ('admission','other');
 if occurrence_type not in ('admission','termination','vacation','leave','salary_change','role_change','work_schedule_change','dependent_change','variable_earning','variable_discount','overtime','absence','bonus','commission','other') then raise exception 'Tipo de movimentação inválido.';end if;
 if requires_employee and employee is null then raise exception 'Selecione o colaborador desta movimentação.';end if;
 if employee is not null and not exists(select 1 from public.employees where organization_id=item.organization_id and client_id=item.client_id and id=employee) then raise exception 'Colaborador não pertence ao cliente.';end if;
 select id into result from public.dp_occurrences where organization_id=item.organization_id and process_id=item.id and idempotency_key=idempotency;
 if result is not null then return result;end if;
 insert into public.dp_occurrences(organization_id,process_id,client_id,competence_id,type,status,employee_id,effective_date,source,source_document_id,source_import_id,idempotency_key,notes)
 values(item.organization_id,item.id,item.client_id,item.competence_id,occurrence_type,'received',employee,effective,occurrence_source,document,source_import,idempotency,left(coalesce(occurrence_notes,''),4000))
 on conflict(organization_id,process_id,idempotency_key) do nothing returning id into result;
 if result is null then select id into result from public.dp_occurrences where organization_id=item.organization_id and process_id=item.id and idempotency_key=idempotency;return result;end if;
 insert into public.process_evidence(organization_id,process_id,evidence_type,entity_id) values(item.organization_id,item.id,'occurrence',result) on conflict do nothing;
 if document is not null then insert into public.process_evidence(organization_id,process_id,evidence_type,entity_id) values(item.organization_id,item.id,'document',document) on conflict do nothing;end if;
 if source_import is not null then insert into public.process_evidence(organization_id,process_id,evidence_type,entity_id) values(item.organization_id,item.id,'import',source_import) on conflict do nothing;end if;
 update public.department_processes set status='requires_attention',version=version+1 where id=item.id and status='not_started';
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'dp.occurrence.created','dp_occurrences',result,jsonb_build_object('type',occurrence_type,'source',occurrence_source));
 return result;
end $$;

create function public.validate_department_process(process uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.department_processes; run uuid:=gen_random_uuid();
begin
 select * into item from public.department_processes where id=process for update;
 if not found or not public.has_org_permission(item.organization_id,'dp.manage') then raise exception 'Permission denied';end if;
 update public.dp_validation_results set resolved_at=coalesce(resolved_at,now()),resolved_by=coalesce(resolved_by,auth.uid()),resolution=coalesce(resolution,'Substituída por nova execução da mesma regra.') where process_id=item.id and resolved_at is null;
 insert into public.dp_validation_results(organization_id,process_id,validation_run_id,rule_id,rule_version,category,severity,entity_type,entity_id,message)
 select item.organization_id,item.id,run,'employee.cpf.valid',1,'data_quality','error','employee',e.id,'CPF do colaborador é estruturalmente inválido.' from public.employees e where e.organization_id=item.organization_id and e.client_id=item.client_id and not public.valid_cpf(e.cpf)
 union all select item.organization_id,item.id,run,'employee.admission.required',1,'data_quality','error','employee',e.id,'Colaborador ativo sem data de admissão.' from public.employees e where e.organization_id=item.organization_id and e.client_id=item.client_id and e.status='active' and e.admission_date is null
 union all select item.organization_id,item.id,run,'employee.termination.order',1,'data_quality','error','employee',e.id,'Desligamento anterior à admissão.' from public.employees e where e.organization_id=item.organization_id and e.client_id=item.client_id and e.termination_date<e.admission_date
 union all select item.organization_id,item.id,run,'occurrence.employee.required',1,'operational','error','occurrence',o.id,'Movimentação exige colaborador identificado.' from public.dp_occurrences o where o.process_id=item.id and o.type not in('admission','other') and o.employee_id is null
 union all select item.organization_id,item.id,run,'occurrence.date.competence',1,'operational','error','occurrence',o.id,'Data da movimentação está fora da competência.' from public.dp_occurrences o where o.process_id=item.id and to_char(o.effective_date,'YYYY-MM')<>item.competence
 union all select item.organization_id,item.id,run,'collection.pending',1,'operational','warning','collection_item',c.id,'Cliente ainda não confirmou este item da coleta.' from public.dp_collection_items c where c.process_id=item.id and c.response='pending';
 insert into public.process_evidence(organization_id,process_id,evidence_type,entity_id)
 select item.organization_id,item.id,'validation',v.id from public.dp_validation_results v where v.process_id=item.id and v.validation_run_id=run on conflict do nothing;
 update public.department_processes set status=case when exists(select 1 from public.dp_validation_results where process_id=item.id and validation_run_id=run and severity='error') then 'requires_attention' else 'ready' end,ready_at=case when not exists(select 1 from public.dp_validation_results where process_id=item.id and validation_run_id=run and severity='error') then now() else ready_at end,metadata=metadata||jsonb_build_object('last_validation_run_id',run,'last_validation_at',now()),version=version+1 where id=item.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'dp.validation.completed','department_processes',item.id,jsonb_build_object('validation_run_id',run,'blocking_errors',(select count(*) from public.dp_validation_results where process_id=item.id and validation_run_id=run and severity='error')));
 return run;
end $$;

create function public.resolve_dp_validation(result_id uuid,resolution_text text) returns void language plpgsql security definer set search_path='' as $$
declare item public.dp_validation_results;
begin
 select * into item from public.dp_validation_results where id=result_id for update;
 if not found or not public.has_org_permission(item.organization_id,'dp.review') then raise exception 'Permission denied';end if;
 if length(trim(resolution_text))<5 then raise exception 'Informe uma justificativa.';end if;
 update public.dp_validation_results set resolved_at=now(),resolved_by=auth.uid(),resolution=left(trim(resolution_text),2000) where id=item.id and resolved_at is null;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'dp.validation.resolved','dp_validation_results',item.id,jsonb_build_object('rule_id',item.rule_id));
end $$;

create function public.update_workflow_step_run(run_id uuid,expected_version integer,next_status text,next_assignee uuid default null,step_note text default '') returns integer language plpgsql security definer set search_path='' as $$
declare run public.workflow_step_runs; process public.department_processes; task_status text;
begin
 select * into run from public.workflow_step_runs where id=run_id for update;
 if not found or not public.has_org_permission(run.organization_id,'processes.manage') then raise exception 'Permission denied';end if;
 if run.version<>expected_version then raise exception 'A etapa mudou. Recarregue antes de continuar.';end if;
 select * into process from public.department_processes where id=run.process_id for update;
 if next_status not in ('ready','in_progress','waiting','completed','skipped','failed','blocked') then raise exception 'Transição inválida.';end if;
 if not ((run.status='pending' and next_status in('ready','skipped')) or (run.status='ready' and next_status in('in_progress','waiting','completed','skipped','blocked')) or (run.status='in_progress' and next_status in('waiting','completed','failed','blocked')) or (run.status='waiting' and next_status in('ready','in_progress','completed','blocked')) or (run.status in('failed','blocked') and next_status in('ready','in_progress'))) then raise exception 'Transição inválida para o estado atual.';end if;
 if next_status in('completed','in_progress') and exists(select 1 from public.workflow_step_dependencies d join public.workflow_step_runs p on p.organization_id=d.organization_id and p.process_id=run.process_id and p.workflow_step_id=d.depends_on_id where d.organization_id=run.organization_id and d.step_id=run.workflow_step_id and p.status not in('completed','skipped')) then raise exception 'Conclua as etapas anteriores primeiro.';end if;
 if next_status='blocked' and length(trim(coalesce(step_note,'')))<3 then raise exception 'Informe o motivo do bloqueio.';end if;
 if next_assignee is not null and not exists(select 1 from public.organization_members where organization_id=run.organization_id and user_id=next_assignee) then raise exception 'Responsável não pertence ao escritório.';end if;
 update public.workflow_step_runs set status=next_status,assigned_to=coalesce(next_assignee,assigned_to),started_at=case when next_status='in_progress' then coalesce(started_at,now()) else started_at end,completed_at=case when next_status in('completed','skipped') then now() else null end,error=case when next_status in('failed','blocked') then left(step_note,2000) else null end,version=version+1 where id=run.id;
 perform set_config('operis.workflow_sync','1',true);
 if run.task_id is not null then
  task_status:=case next_status when 'in_progress' then 'in_progress' when 'waiting' then 'waiting_client' when 'completed' then 'completed' when 'skipped' then 'completed' when 'blocked' then 'blocked' when 'failed' then 'blocked' else 'ready' end;
  update public.tasks set status=task_status,assignee_id=coalesce(next_assignee,assignee_id),blocked_reason=case when task_status='blocked' then left(step_note,2000) else null end where id=run.task_id;
 end if;
 update public.workflow_step_runs child set status='ready',version=version+1 where child.organization_id=run.organization_id and child.process_id=run.process_id and child.status='pending' and not exists(select 1 from public.workflow_step_dependencies d join public.workflow_step_runs prior on prior.organization_id=d.organization_id and prior.process_id=child.process_id and prior.workflow_step_id=d.depends_on_id where d.organization_id=child.organization_id and d.step_id=child.workflow_step_id and prior.status not in('completed','skipped'));
 update public.tasks t set status='ready' from public.workflow_step_runs child
 where child.organization_id=run.organization_id and child.process_id=run.process_id and child.status='ready' and child.task_id=t.id and t.status='backlog';
 update public.department_processes set status=case when next_status='blocked' then 'blocked' when next_status='failed' then 'requires_attention' else 'in_progress' end,started_at=coalesce(started_at,now()),blocked_reason=case when next_status='blocked' then left(step_note,2000) else null end,version=version+1 where id=process.id and status not in('awaiting_review','approved','completed');
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(run.organization_id,auth.uid(),'workflow.step.'||next_status,'workflow_step_runs',run.id,jsonb_build_object('process_id',run.process_id));
 return run.version+1;
end $$;

create function public.protect_workflow_task() returns trigger language plpgsql set search_path='' as $$
begin
 if current_setting('operis.workflow_sync',true)<>'1' and new.status is distinct from old.status and exists(select 1 from public.workflow_step_runs where organization_id=old.organization_id and task_id=old.id) then raise exception 'Atualize esta tarefa pelo processo de Departamento Pessoal.';end if;
 return new;
end $$;
create trigger workflow_task_source before update on public.tasks for each row execute function public.protect_workflow_task();

create function public.request_process_review(process_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare item public.department_processes; approval_step uuid;
begin
 select * into item from public.department_processes where id=process_id for update;
 if not found or not public.has_org_permission(item.organization_id,'processes.manage') then raise exception 'Permission denied';end if;
 if item.version<>expected_version then raise exception 'O processo mudou. Recarregue antes de continuar.';end if;
 if not item.metadata ? 'last_validation_at' then raise exception 'Execute a validação antes de solicitar revisão.';end if;
 if exists(select 1 from public.dp_validation_results v where v.process_id=item.id and v.severity='error' and v.resolved_at is null) then raise exception 'Resolva os erros bloqueantes antes de solicitar revisão.';end if;
 select sr.id into approval_step from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id and s.organization_id=sr.organization_id where sr.process_id=item.id and s.kind='approval';
 if exists(select 1 from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id and s.organization_id=sr.organization_id where sr.process_id=item.id and s.position<(select position from public.workflow_steps s2 join public.workflow_step_runs sr2 on sr2.workflow_step_id=s2.id and sr2.organization_id=s2.organization_id where sr2.id=approval_step) and s.required and sr.status not in('completed','skipped')) then raise exception 'Conclua as etapas obrigatórias de preparação.';end if;
 insert into public.process_approvals(organization_id,process_id,requested_by) values(item.organization_id,item.id,auth.uid());
 update public.department_processes set status='awaiting_review',prepared_by=auth.uid(),version=version+1 where id=item.id;
 update public.workflow_step_runs set status='ready',version=version+1 where id=approval_step;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(item.organization_id,auth.uid(),'dp.review.requested','department_processes',item.id);
 if item.reviewer_id is not null then insert into public.notifications(organization_id,user_id,kind,title,href,dedupe_key) values(item.organization_id,item.reviewer_id,'dp_review','Revisão de DP solicitada','/app/departamentos/dp/clientes/'||item.client_id||'/competencias/'||item.competence,'dp-review:'||item.id||':'||item.version) on conflict(dedupe_key) do nothing;end if;
end $$;

create function public.review_department_process(process_id uuid,expected_version integer,review_decision text,review_comment text default '') returns void language plpgsql security definer set search_path='' as $$
declare item public.department_processes; approval public.process_approvals; distinct_reviewer boolean; approval_step public.workflow_step_runs;
begin
 select * into item from public.department_processes where id=process_id for update;
 if not found or not public.has_org_permission(item.organization_id,'processes.review') then raise exception 'Permission denied';end if;
 if item.version<>expected_version or item.status<>'awaiting_review' then raise exception 'O processo não está aguardando esta revisão.';end if;
 if review_decision not in('approved','returned') then raise exception 'Decisão inválida.';end if;
 if review_decision='returned' and length(trim(review_comment))<5 then raise exception 'Explique o que precisa ser corrigido.';end if;
 select require_distinct_reviewer into distinct_reviewer from public.workflow_versions where id=item.workflow_version_id;
 if review_decision='approved' and distinct_reviewer and item.prepared_by=auth.uid() then raise exception 'A revisão exige uma segunda pessoa.';end if;
 select * into approval from public.process_approvals pa where pa.process_id=item.id and pa.decision='pending' for update;
 if not found then raise exception 'Solicitação de revisão não encontrada.';end if;
 update public.process_approvals set decision=review_decision,decided_by=auth.uid(),decided_at=now(),comment=left(coalesce(review_comment,''),2000) where id=approval.id;
 select sr.* into approval_step from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id and s.organization_id=sr.organization_id where sr.process_id=item.id and s.kind='approval';
 if review_decision='approved' then
 update public.department_processes set status='approved',reviewer_id=auth.uid(),version=version+1 where id=item.id;
  update public.workflow_step_runs set status='completed',completed_at=now(),version=version+1 where id=approval_step.id;
  update public.workflow_step_runs child set status='ready',version=version+1 where child.process_id=item.id and child.status='pending' and not exists(select 1 from public.workflow_step_dependencies d join public.workflow_step_runs p on p.process_id=child.process_id and p.workflow_step_id=d.depends_on_id where d.step_id=child.workflow_step_id and d.organization_id=child.organization_id and p.status not in('completed','skipped'));
  perform set_config('operis.workflow_sync','1',true);
  update public.tasks set status='completed' where id=approval_step.task_id;
  update public.tasks t set status='ready' from public.workflow_step_runs child where child.process_id=item.id and child.status='ready' and child.task_id=t.id and t.status='backlog';
 else
  update public.department_processes set status='requires_attention',version=version+1 where id=item.id;
  update public.workflow_step_runs set status='ready',error=left(review_comment,2000),version=version+1 where id=approval_step.id;
  perform set_config('operis.workflow_sync','1',true);
  update public.tasks set status='ready' where id=approval_step.task_id;
 end if;
 insert into public.process_evidence(organization_id,process_id,evidence_type,entity_id) values(item.organization_id,item.id,'approval',approval.id) on conflict do nothing;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'dp.review.'||review_decision,'department_processes',item.id,jsonb_build_object('approval_id',approval.id));
 insert into public.notifications(organization_id,user_id,kind,title,href,dedupe_key) values(item.organization_id,item.prepared_by,case when review_decision='approved' then 'dp_approved' else 'dp_returned' end,case when review_decision='approved' then 'Fechamento de DP aprovado' else 'Fechamento de DP devolvido' end,'/app/departamentos/dp/clientes/'||item.client_id||'/competencias/'||item.competence,'dp-decision:'||approval.id) on conflict(dedupe_key) do nothing;
end $$;

create function public.complete_department_process(process_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare item public.department_processes;
begin
 select * into item from public.department_processes where id=process_id for update;
 if not found or not public.has_org_permission(item.organization_id,'processes.manage') then raise exception 'Permission denied';end if;
 if item.version<>expected_version then raise exception 'O processo mudou. Recarregue antes de continuar.';end if;
 if item.status not in('approved','in_progress') then raise exception 'O processo precisa estar aprovado e em fechamento.';end if;
 if exists(select 1 from public.dp_validation_results v where v.process_id=item.id and v.severity='error' and v.resolved_at is null) then raise exception 'Existem erros bloqueantes.';end if;
 if exists(select 1 from public.dp_collection_items c where c.process_id=item.id and c.response='pending') then raise exception 'Ainda existem itens de coleta sem resposta do cliente.';end if;
 if exists(select 1 from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id and s.organization_id=sr.organization_id where sr.process_id=item.id and s.required and sr.status not in('completed','skipped')) then raise exception 'Conclua todas as etapas obrigatórias.';end if;
 if not exists(select 1 from public.process_approvals pa where pa.process_id=item.id and pa.decision='approved') then raise exception 'A aprovação é obrigatória.';end if;
 update public.department_processes set status='completed',completed_at=now(),version=version+1 where id=item.id;
 update public.competencies set status='closed' where id=item.competence_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(item.organization_id,auth.uid(),'dp.process.completed','department_processes',item.id);
 insert into public.outbox_events(organization_id,kind,entity_id) values(item.organization_id,'dp.process.completed',item.id) on conflict do nothing;
end $$;

create function public.reopen_department_process(process_id uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare item public.department_processes;
begin
 select * into item from public.department_processes where id=process_id for update;
 if not found or not public.has_org_permission(item.organization_id,'processes.review') then raise exception 'Permission denied';end if;
 if item.status<>'completed' or length(trim(reason))<5 then raise exception 'Somente processo concluído pode ser reaberto, com justificativa.';end if;
 update public.department_processes set status='requires_attention',completed_at=null,version=version+1,metadata=metadata||jsonb_build_object('last_reopen_reason',left(trim(reason),1000)) where id=item.id;
 update public.competencies set status='review' where id=item.competence_id;
 update public.workflow_step_runs sr set status=case when s.code='close' then 'ready' else 'pending' end,completed_at=null,version=sr.version+1 from public.workflow_steps s where sr.process_id=item.id and sr.workflow_step_id=s.id and s.code in('close','archive');
 perform set_config('operis.workflow_sync','1',true);
 update public.tasks t set status=case when s.code='close' then 'ready' else 'backlog' end from public.workflow_step_runs sr join public.workflow_steps s on s.id=sr.workflow_step_id and s.organization_id=sr.organization_id where sr.process_id=item.id and sr.task_id=t.id and s.code in('close','archive');
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'dp.process.reopened','department_processes',item.id,jsonb_build_object('reason',left(trim(reason),1000)));
end $$;

-- Prefer Supabase Queues when pgmq is available; the existing outbox remains the atomic business source and observable fallback.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pgmq') then
  create extension if not exists pgmq;
  perform pgmq.create('operis_jobs');
 end if;
end $$;
create function public.enqueue_due_operis_jobs() returns integer language plpgsql security definer set search_path='' as $$
declare amount integer:=0; event record;
begin
 if auth.role()<>'service_role' then raise exception 'Permission denied';end if;
 if exists(select 1 from pg_extension where extname='pgmq') then
  for event in select id,organization_id,kind,entity_id from public.outbox_events where status='pending' and scheduled_at<=now() order by created_at limit 50 for update skip locked loop
   execute 'select pgmq.send($1,$2::jsonb)' using 'operis_jobs',jsonb_build_object('outbox_id',event.id,'organization_id',event.organization_id,'kind',event.kind,'entity_id',event.entity_id);
   update public.outbox_events set status='processing',started_at=now(),attempt_count=attempt_count+1 where id=event.id; amount:=amount+1;
  end loop;
 end if;
 return amount;
end $$;
revoke all on function public.enqueue_due_operis_jobs() from public,anon,authenticated;
grant execute on function public.enqueue_due_operis_jobs() to service_role;

-- New tables are read through permission-scoped RLS. State transitions are RPC-only.
do $$ declare t text; begin
 foreach t in array array['workflows','workflow_versions','workflow_steps','workflow_step_dependencies','department_processes','workflow_step_runs','employees','payroll_variables','dp_occurrences','dp_collection_items','dp_validation_results','process_approvals','process_evidence'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['workflows','department_processes','workflow_step_runs','employees','dp_occurrences'] loop execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()',t);end loop;
 foreach t in array array['department_processes','workflow_step_runs','employees','dp_occurrences','dp_collection_items'] loop execute format('create trigger audit after insert or update on public.%I for each row execute function public.audit_entity()',t);end loop;
end $$;
create policy workflows_read on public.workflows for select to authenticated using(public.has_org_permission(organization_id,'workflows.read'));
create policy workflow_versions_read on public.workflow_versions for select to authenticated using(public.has_org_permission(organization_id,'workflows.read'));
create policy workflow_steps_read on public.workflow_steps for select to authenticated using(public.has_org_permission(organization_id,'workflows.read'));
create policy workflow_dependencies_read on public.workflow_step_dependencies for select to authenticated using(public.has_org_permission(organization_id,'workflows.read'));
create policy processes_read on public.department_processes for select to authenticated using(public.has_org_permission(organization_id,'processes.read'));
create policy step_runs_read on public.workflow_step_runs for select to authenticated using(public.has_org_permission(organization_id,'processes.read'));
create policy employees_read on public.employees for select to authenticated using(public.has_org_permission(organization_id,'dp.read'));
create policy payroll_variables_read on public.payroll_variables for select to authenticated using(public.has_org_permission(organization_id,'dp.read'));
create policy occurrences_read on public.dp_occurrences for select to authenticated using(public.has_org_permission(organization_id,'occurrences.read'));
create policy collection_read on public.dp_collection_items for select to authenticated using(public.has_org_permission(organization_id,'dp.read'));
create policy validations_read on public.dp_validation_results for select to authenticated using(public.has_org_permission(organization_id,'dp.read'));
create policy process_approvals_read on public.process_approvals for select to authenticated using(public.has_org_permission(organization_id,'processes.read'));
create policy process_evidence_read on public.process_evidence for select to authenticated using(public.has_org_permission(organization_id,'processes.read'));

revoke execute on function public.ensure_dp_workflow(uuid),public.start_department_process(uuid,uuid,text,uuid,uuid,timestamptz),public.bulk_start_department_processes(uuid,uuid[],text,uuid,timestamptz),public.update_collection_item(uuid,text,text,uuid,text),public.create_dp_occurrence(uuid,text,uuid,date,text,text,uuid,uuid,uuid),public.validate_department_process(uuid),public.resolve_dp_validation(uuid,text),public.update_workflow_step_run(uuid,integer,text,uuid,text),public.request_process_review(uuid,integer),public.review_department_process(uuid,integer,text,text),public.complete_department_process(uuid,integer),public.reopen_department_process(uuid,text) from public,anon;
grant execute on function public.ensure_dp_workflow(uuid),public.start_department_process(uuid,uuid,text,uuid,uuid,timestamptz),public.bulk_start_department_processes(uuid,uuid[],text,uuid,timestamptz),public.update_collection_item(uuid,text,text,uuid,text),public.create_dp_occurrence(uuid,text,uuid,date,text,text,uuid,uuid,uuid),public.validate_department_process(uuid),public.resolve_dp_validation(uuid,text),public.update_workflow_step_run(uuid,integer,text,uuid,text),public.request_process_review(uuid,integer),public.review_department_process(uuid,integer,text,text),public.complete_department_process(uuid,integer),public.reopen_department_process(uuid,text) to authenticated;
revoke execute on function public.clone_workflow_version(uuid),public.publish_workflow_version(uuid),public.archive_workflow_version(uuid) from public,anon;
grant execute on function public.clone_workflow_version(uuid),public.publish_workflow_version(uuid),public.archive_workflow_version(uuid) to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
