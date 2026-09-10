create table public.imports (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),client_id uuid not null,
 competence text not null check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),original_filename text not null,storage_path text not null unique,checksum text not null,
 status text not null default 'mapping' check(status in ('mapping','awaiting_approval','approved','processing','completed','failed','cancelled')),
 sheets jsonb not null check(jsonb_typeof(sheets)='array' and jsonb_array_length(sheets) between 1 and 20),sheet_index integer not null default 0,header_row integer not null default 1 check(header_row between 1 and 50),
 headers jsonb not null default '[]',mapping jsonb not null default '{}',validation jsonb,validated_records jsonb,
 created_by uuid not null default auth.uid() references public.profiles(id),approved_by uuid references public.profiles(id),approved_at timestamptz,completed_at timestamptz,
 row_count integer not null default 0,version integer not null default 1,correlation_id uuid not null default gen_random_uuid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,client_id,competence,checksum),foreign key(organization_id,client_id) references public.clients(organization_id,id)
);
create index imports_status on public.imports(organization_id,status,created_at desc);
create table public.import_templates (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(name) between 2 and 180),headers jsonb not null,mapping jsonb not null,fingerprint text not null,source_import_id uuid not null,created_by uuid not null default auth.uid() references public.profiles(id),created_at timestamptz not null default now(),foreign key(organization_id,source_import_id) references public.imports(organization_id,id));
create table public.employee_snapshots (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),client_id uuid not null,import_id uuid not null,competence text not null,employee_name text not null,employee_cpf text not null,salary numeric(12,2),admission_date date,created_at timestamptz not null default now(),unique(organization_id,client_id,competence,employee_cpf),foreign key(organization_id,client_id) references public.clients(organization_id,id),foreign key(organization_id,import_id) references public.imports(organization_id,id));
create table public.approvals (id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),import_id uuid not null unique,requested_by uuid not null references public.profiles(id),decided_by uuid not null references public.profiles(id),decision text not null check(decision in ('approved','rejected')),comment text not null default '',decided_at timestamptz not null default now(),foreign key(organization_id,import_id) references public.imports(organization_id,id));
do $$ declare t text;begin foreach t in array array['imports','import_templates','employee_snapshots','approvals'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy import_read on public.%I for select to authenticated using(public.has_org_permission(organization_id,''imports.read''))',t);
 execute format('create trigger audit after insert or update on public.%I for each row execute function public.audit_entity()',t);
end loop;end $$;
create trigger touch before update on public.imports for each row execute function public.touch_updated_at();

create function public.valid_cpf(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare digits text:=regexp_replace(value,'[^0-9]','','g'); s integer; n integer; i integer;begin
 if digits !~ '^[0-9]{11}$' or digits ~ '^([0-9])\1{10}$' then return false;end if;
 for n in 9..10 loop s=0;for i in 1..n loop s=s+substring(digits,i,1)::integer*(n+2-i);end loop;
 -- CPF weights are 10..2 for the first digit and 11..2 for the second.
 s=0;for i in 1..n loop s=s+substring(digits,i,1)::integer*(n+1-i+1);end loop;
 if ((s*10)%11)%10<>substring(digits,n+1,1)::integer then return false;end if;end loop;return true;end $$;

create function public.create_import(org_id uuid, target_client uuid, target_competence text, filename text, path text, file_checksum text, workbook jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; sheet jsonb;begin
 if not public.has_org_permission(org_id,'imports.create') then raise exception 'Permission denied';end if;
 if path not like 'organizations/'||org_id||'/clients/'||target_client||'/%' then raise exception 'Invalid storage path';end if;
 if octet_length(workbook::text)>15000000 then raise exception 'Workbook too large';end if;
 for sheet in select value from jsonb_array_elements(workbook) loop
 if jsonb_typeof(sheet->'rows')<>'array' or jsonb_array_length(sheet->'rows')>5001 then raise exception 'Limite de 5.000 linhas por planilha.';end if;
 end loop;
 insert into public.imports(organization_id,client_id,competence,original_filename,storage_path,checksum,sheets,created_by) values(org_id,target_client,target_competence,filename,path,file_checksum,workbook,auth.uid()) returning id into result;return result;
end $$;
create function public.configure_import(import_id uuid, expected_version integer, selected_sheet integer, selected_header integer, selected_mapping jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item public.imports; row_data jsonb; parsed_headers jsonb;begin
 select * into item from public.imports where id=import_id for update;
 if not found or not public.has_org_permission(item.organization_id,'imports.create') then raise exception 'Permission denied';end if;
 if item.version<>expected_version then raise exception 'A importação mudou. Recarregue antes de salvar.';end if;
 if item.status not in ('mapping','awaiting_approval','failed') then raise exception 'Importação já aprovada ou encerrada.';end if;
 if selected_sheet<0 or selected_sheet>=jsonb_array_length(item.sheets) or selected_header<1 or selected_header>50 then raise exception 'Seleção inválida.';end if;
 row_data=item.sheets->selected_sheet->'rows'->(selected_header-1);
 if row_data is null or jsonb_typeof(row_data)<>'array' then raise exception 'Cabeçalho não encontrado.';end if;
 select jsonb_agg(trim(value)) into parsed_headers from jsonb_array_elements_text(row_data);
 if jsonb_array_length(parsed_headers)>100 or exists(select 1 from jsonb_array_elements_text(parsed_headers) h where trim(h)='') or (select count(*) from jsonb_array_elements_text(parsed_headers))<>(select count(distinct value) from jsonb_array_elements_text(parsed_headers)) then raise exception 'Cabeçalhos vazios ou duplicados. Escolha outra linha ou corrija o arquivo.';end if;
 if jsonb_typeof(selected_mapping)<>'object' or exists(select 1 from jsonb_each_text(selected_mapping) m where not parsed_headers ? m.key or m.value not in ('employee_name','employee_cpf','salary','admission_date','ignore')) then raise exception 'Mapeamento inválido.';end if;
 update public.imports set sheet_index=selected_sheet,header_row=selected_header,headers=parsed_headers,mapping=selected_mapping,status='mapping',validation=null,validated_records=null,version=version+1 where id=import_id;
 return item.version+1;
end $$;

-- Validation runs inside the database as well as in the domain layer. Approval can
-- never trust a caller-supplied list of validated records or error counts.
create function public.validate_import(import_id uuid, expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.imports; row_data jsonb; cells jsonb; mapped jsonb; records jsonb:='[]'; issues jsonb:='[]'; row_number integer; i integer; target text; v text; cpf text; salary numeric; admission date; name text; errors_before integer; ignored integer:=0; seen text[]:='{}'; result jsonb;
begin
 select * into item from public.imports where id=import_id for update;
 if not found or not public.has_org_permission(item.organization_id,'imports.create') then raise exception 'Permission denied';end if;
 if item.version<>expected_version or item.status not in ('mapping','awaiting_approval','failed') then raise exception 'Recarregue a importação antes de validar.';end if;
 if not exists(select 1 from jsonb_each_text(item.mapping) where value='employee_name') or not exists(select 1 from jsonb_each_text(item.mapping) where value='employee_cpf') then raise exception 'Mapeie nome e CPF.';end if;
 if exists(select value from jsonb_each_text(item.mapping) where value<>'ignore' group by value having count(*)>1) then raise exception 'Destinos duplicados.';end if;
 row_number=0;
 for row_data in select value from jsonb_array_elements(item.sheets->item.sheet_index->'rows') loop
 row_number=row_number+1;if row_number<=item.header_row then continue;end if;
 if not exists(select 1 from jsonb_array_elements_text(row_data) where trim(value)<>'') then ignored=ignored+1;continue;end if;
 mapped='{}';errors_before=jsonb_array_length(issues);
 for i in 0..jsonb_array_length(item.headers)-1 loop target=item.mapping->>(item.headers->>i);if target is not null and target<>'ignore' then mapped=mapped||jsonb_build_object(target,trim(coalesce(row_data->>i,'')));end if;end loop;
 name=coalesce(mapped->>'employee_name','');cpf=regexp_replace(coalesce(mapped->>'employee_cpf',''),'[^0-9]','','g');salary=null;admission=null;
 if length(name)<2 or length(name)>180 then issues=issues||jsonb_build_array(jsonb_build_object('row',row_number,'field','employee_name','severity','error','message','Nome obrigatório (2 a 180 caracteres).'));end if;
 if not public.valid_cpf(cpf) or cpf=any(seen) then issues=issues||jsonb_build_array(jsonb_build_object('row',row_number,'field','employee_cpf','severity','error','message','CPF inválido ou duplicado.'));end if;seen=array_append(seen,cpf);
 if exists(select 1 from public.employee_snapshots e where e.organization_id=item.organization_id and e.client_id=item.client_id and e.competence=item.competence and e.employee_cpf=cpf) then issues=issues||jsonb_build_array(jsonb_build_object('row',row_number,'field','employee_cpf','severity','error','message','Colaborador já importado nesta competência.'));end if;
 v=trim(regexp_replace(coalesce(mapped->>'salary',''),'^R\$\s*',''));
 if v<>'' then begin
 if v !~ '^-?([0-9]{1,3}(\.[0-9]{3})+|[0-9]+)(,[0-9]{1,2})?$' and v !~ '^-?[0-9]+(\.[0-9]{1,2})?$' then raise exception 'invalid money';end if;
 if position(',' in v)>0 then v=replace(replace(v,'.',''),',','.');end if;salary=v::numeric;
 if salary<0 or salary>9999999999.99 then raise exception 'invalid money';end if;
 exception when others then issues=issues||jsonb_build_array(jsonb_build_object('row',row_number,'field','salary','severity','error','message','Valor monetário inválido ou negativo.'));end;end if;
 v=coalesce(mapped->>'admission_date','');
 if v<>'' then begin
 if v ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then v=substring(v,7,4)||'-'||substring(v,4,2)||'-'||substring(v,1,2);end if;
 if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date';end if;admission=v::date;
 exception when others then issues=issues||jsonb_build_array(jsonb_build_object('row',row_number,'field','admission_date','severity','error','message','Data inválida.'));end;end if;
 if jsonb_array_length(issues)=errors_before then records=records||jsonb_build_array(jsonb_build_object('employee_name',name,'employee_cpf',cpf,'salary',salary,'admission_date',admission));end if;
 end loop;
 if jsonb_array_length(records)=0 and jsonb_array_length(issues)=0 then issues=jsonb_build_array(jsonb_build_object('row',0,'field','file','severity','error','message','Nenhuma linha para importar.'));end if;
 result=jsonb_build_object('issues',issues,'valid',jsonb_array_length(records),'ignored',ignored,'total',row_number-item.header_row);
 update public.imports set validation=result,validated_records=records,row_count=jsonb_array_length(records),status=case when jsonb_array_length(issues)=0 then 'awaiting_approval' else 'mapping' end,version=version+1 where id=import_id;
 return result;
end $$;
create function public.approve_import(import_id uuid, expected_version integer, approval_comment text default '') returns void language plpgsql security definer set search_path='' as $$
declare item public.imports;begin
 select * into item from public.imports where id=import_id for update;
 if not found or not public.has_org_permission(item.organization_id,'imports.approve') then raise exception 'Permission denied';end if;
 if item.status in ('approved','processing','completed') then return;end if;
 if item.version<>expected_version or item.status<>'awaiting_approval' or jsonb_array_length(item.validation->'issues')<>0 or item.row_count=0 then raise exception 'Valide sem erros antes de aprovar.';end if;
 insert into public.approvals(organization_id,import_id,requested_by,decided_by,decision,comment) values(item.organization_id,item.id,item.created_by,auth.uid(),'approved',left(approval_comment,1000));
 update public.imports set status='approved',approved_by=auth.uid(),approved_at=now(),version=version+1 where id=import_id;
 insert into public.outbox_events(organization_id,kind,entity_id) values(item.organization_id,'import.process',item.id) on conflict do nothing;
end $$;
create function public.process_import(import_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare item public.imports;begin
 select * into item from public.imports where id=import_id for update;
 if not found then raise exception 'Import not found';end if;
 if coalesce(auth.role(),'')<>'service_role' and not public.has_org_permission(item.organization_id,'imports.approve') then raise exception 'Permission denied';end if;
 if item.status='completed' then return item.row_count;end if;
 if item.status not in ('approved','failed') or item.approved_at is null then raise exception 'Aprovação necessária.';end if;
 insert into public.employee_snapshots(organization_id,client_id,import_id,competence,employee_name,employee_cpf,salary,admission_date)
 select item.organization_id,item.client_id,item.id,item.competence,r->>'employee_name',r->>'employee_cpf',(r->>'salary')::numeric,(r->>'admission_date')::date from jsonb_array_elements(item.validated_records) r;
 update public.imports set status='completed',completed_at=now(),version=version+1 where id=import_id;
 update public.outbox_events set status='completed',completed_at=now(),last_error=null where kind='import.process' and entity_id=import_id;
 insert into public.notifications(organization_id,user_id,kind,title,href,dedupe_key) values(item.organization_id,item.created_by,'import_completed','Importação concluída: '||item.row_count||' colaboradores','/app/importacoes/'||item.id,'import-completed:'||item.id) on conflict(dedupe_key) do nothing;
 return item.row_count;
end $$;
create function public.save_import_template(import_id uuid, template_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.imports; result uuid;begin
 select * into item from public.imports where id=import_id;
 if not found or not public.has_org_permission(item.organization_id,'imports.create') or item.status<>'completed' then raise exception 'Conclua a importação primeiro.';end if;
 insert into public.import_templates(organization_id,name,headers,mapping,fingerprint,source_import_id,created_by) values(item.organization_id,template_name,item.headers,item.mapping,md5(item.headers::text),item.id,auth.uid()) returning id into result;return result;end $$;
create function public.process_pending_imports() returns integer language plpgsql security definer set search_path='' as $$
declare job public.outbox_events; processed integer:=0;begin
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'Worker only';end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 for job in select * from public.outbox_events where kind='import.process' and status='pending' and scheduled_at<=now() order by created_at limit 5 for update skip locked loop
 update public.outbox_events set status='processing',started_at=now(),attempt_count=attempt_count+1 where id=job.id;
 begin perform public.process_import(job.entity_id);processed=processed+1;
 exception when others then
 update public.outbox_events set status=case when job.attempt_count>=4 then 'failed' else 'pending' end,last_error='Não foi possível processar. Verifique duplicidades e tente novamente.',scheduled_at=now()+make_interval(secs=>power(2,job.attempt_count)::integer*30) where id=job.id;
 if job.attempt_count>=4 then update public.imports set status='failed' where id=job.entity_id;end if;
 end;end loop;return processed;end $$;
revoke execute on all functions in schema public from public,anon;
grant execute on function public.create_import(uuid,uuid,text,text,text,text,jsonb),public.configure_import(uuid,integer,integer,integer,jsonb),public.validate_import(uuid,integer),public.approve_import(uuid,integer,text),public.process_import(uuid),public.save_import_template(uuid,text) to authenticated;
revoke execute on function public.process_pending_imports() from authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
