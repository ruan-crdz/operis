-- Operis Ledger: real double-entry bookkeeping, immutable posting and accounting reports.
insert into public.permissions(id) values
 ('ledger.read'),('ledger.accounts.manage'),('ledger.entries.create'),('ledger.entries.post'),
 ('ledger.reports.read'),('ledger.close'),('ledger.reopen')
on conflict do nothing;

-- Existing roles receive conservative defaults. Only administrators post and close.
insert into public.role_permissions(organization_id,role_id,permission)
select r.organization_id,r.id,p.id from public.roles r cross join public.permissions p
where r.name='Administrador' and p.id like 'ledger.%'
on conflict do nothing;
insert into public.role_permissions(organization_id,role_id,permission)
select r.organization_id,r.id,p.id from public.roles r cross join public.permissions p
where r.name='Operador' and p.id in ('ledger.read','ledger.entries.create','ledger.reports.read')
on conflict do nothing;
insert into public.role_permissions(organization_id,role_id,permission)
select r.organization_id,r.id,p.id from public.roles r cross join public.permissions p
where r.name='Leitor' and p.id in ('ledger.read','ledger.reports.read')
on conflict do nothing;

-- Keep the same defaults for organizations created after this migration.
create or replace function public.create_organization(org_name text, person_name text, department_names text[]) returns uuid language plpgsql security definer set search_path='' as $$
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
 insert into public.role_permissions(organization_id,role_id,permission) select org,operator_role,id from public.permissions
  where id not in ('organization.manage','members.manage','imports.approve','settings.manage','audit.read','ledger.accounts.manage','ledger.entries.post','ledger.close','ledger.reopen');
 insert into public.role_permissions(organization_id,role_id,permission) select org,reader_role,id from public.permissions
  where (id like '%.read' and id<>'audit.read') or id='ledger.reports.read';
 insert into public.member_roles(organization_id,member_id,role_id) values(org,member,owner_role);
 return org;end $$;

create table public.ledger_books (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 code text not null default 'principal' check(code ~ '^[a-z][a-z0-9_-]{1,39}$'),
 name text not null default 'Livro principal' check(length(trim(name)) between 2 and 180),
 currency text not null default 'BRL' check(currency ~ '^[A-Z]{3}$'),
 active boolean not null default true,
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,client_id,id),
 unique(organization_id,client_id,code),
 foreign key(organization_id,client_id) references public.clients(organization_id,id)
);

create table public.ledger_periods (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 competence text not null check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 status text not null default 'open' check(status in ('open','closed')),
 next_entry_number bigint not null default 1 check(next_entry_number>0),
 revision integer not null default 1 check(revision>0),
 closed_at timestamptz,
 closed_by uuid references public.profiles(id),
 reopened_at timestamptz,
 reopened_by uuid references public.profiles(id),
 reopen_reason text,
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,client_id,book_id,id),
 unique(organization_id,book_id,competence),
 foreign key(organization_id,client_id,book_id) references public.ledger_books(organization_id,client_id,id),
 check((status='closed' and closed_at is not null and closed_by is not null) or status='open')
);

create table public.ledger_accounts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 parent_id uuid,
 code text not null check(length(trim(code)) between 1 and 60),
 name text not null check(length(trim(name)) between 2 and 180),
 account_type text not null check(account_type in ('asset','liability','equity','revenue','expense')),
 normal_balance text not null check(normal_balance in ('debit','credit')),
 is_postable boolean not null default true,
 is_active boolean not null default true,
 description text not null default '' check(length(description)<=1000),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,client_id,book_id,id),
 unique(organization_id,book_id,code),
 foreign key(organization_id,client_id,book_id) references public.ledger_books(organization_id,client_id,id),
 foreign key(organization_id,client_id,book_id,parent_id) references public.ledger_accounts(organization_id,client_id,book_id,id),
 check(parent_id is null or parent_id<>id)
);

alter table public.documents add unique(organization_id,client_id,id);

create table public.ledger_journal_entries (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 period_id uuid not null,
 entry_number bigint,
 entry_date date not null,
 description text not null check(length(trim(description)) between 3 and 1000),
 reference text not null default '' check(length(reference)<=180),
 source_type text not null default 'manual' check(source_type in ('manual','opening','adjustment','reversal','import')),
 document_id uuid,
 status text not null default 'draft' check(status in ('draft','posted','reversed')),
 idempotency_key uuid not null,
 reversal_of_entry_id uuid,
 reversed_by_entry_id uuid,
 created_by uuid not null default auth.uid() references public.profiles(id),
 posted_by uuid references public.profiles(id),
 posted_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,client_id,book_id,id),
 unique(organization_id,client_id,idempotency_key),
 unique(organization_id,reversal_of_entry_id),
 foreign key(organization_id,client_id,book_id) references public.ledger_books(organization_id,client_id,id),
 foreign key(organization_id,client_id,book_id,period_id) references public.ledger_periods(organization_id,client_id,book_id,id),
 foreign key(organization_id,client_id,document_id) references public.documents(organization_id,client_id,id),
 foreign key(organization_id,client_id,book_id,reversal_of_entry_id) references public.ledger_journal_entries(organization_id,client_id,book_id,id),
 foreign key(organization_id,client_id,book_id,reversed_by_entry_id) references public.ledger_journal_entries(organization_id,client_id,book_id,id),
 check((status='draft' and entry_number is null and posted_at is null and posted_by is null) or (status in ('posted','reversed') and entry_number is not null and posted_at is not null and posted_by is not null)),
 check(reversal_of_entry_id is null or reversal_of_entry_id<>id),
 check(reversed_by_entry_id is null or reversed_by_entry_id<>id)
);
create unique index ledger_entry_number on public.ledger_journal_entries(organization_id,book_id,entry_number) where entry_number is not null;

create table public.ledger_journal_lines (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 entry_id uuid not null,
 account_id uuid not null,
 line_number integer not null check(line_number>0),
 side text not null check(side in ('debit','credit')),
 amount numeric(19,2) not null check(amount>0),
 memo text not null default '' check(length(memo)<=500),
 created_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,entry_id,line_number),
 foreign key(organization_id,client_id,book_id,entry_id) references public.ledger_journal_entries(organization_id,client_id,book_id,id) on delete cascade,
 foreign key(organization_id,client_id,book_id,account_id) references public.ledger_accounts(organization_id,client_id,book_id,id)
);

create index ledger_period_lookup on public.ledger_periods(organization_id,client_id,competence,status);
create index ledger_accounts_tree on public.ledger_accounts(organization_id,book_id,parent_id,code);
create index ledger_entries_report on public.ledger_journal_entries(organization_id,book_id,entry_date,entry_number) where status in ('posted','reversed');
create index ledger_lines_account on public.ledger_journal_lines(organization_id,book_id,account_id,entry_id);

create function public.ensure_ledger_book(org_id uuid,target_client uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.has_org_permission(org_id,'ledger.accounts.manage') then raise exception 'Permission denied';end if;
 if not exists(select 1 from public.clients where organization_id=org_id and id=target_client and archived_at is null) then raise exception 'Cliente não pertence ao escritório ou está arquivado.';end if;
 select id into result from public.ledger_books where organization_id=org_id and client_id=target_client and code='principal';
 if result is null then
  insert into public.ledger_books(organization_id,client_id) values(org_id,target_client) returning id into result;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(org_id,auth.uid(),'ledger.book.created','ledger_books',result);
 end if;
 return result;
end $$;

create function public.open_ledger_period(book uuid,target_competence text) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_books; result uuid;
begin
 select * into item from public.ledger_books where id=book;
 if not found or not public.has_org_permission(item.organization_id,'ledger.entries.create') then raise exception 'Permission denied';end if;
 if target_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Competência inválida.';end if;
 select id into result from public.ledger_periods where organization_id=item.organization_id and book_id=item.id and competence=target_competence;
 if result is null then
  insert into public.ledger_periods(organization_id,client_id,book_id,competence) values(item.organization_id,item.client_id,item.id,target_competence) returning id into result;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.period.opened','ledger_periods',result,jsonb_build_object('competence',target_competence));
 end if;
 return result;
end $$;

create function public.create_ledger_account(book uuid,account_code text,account_name text,account_kind text,account_normal_balance text,postable boolean default true,parent uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_books; result uuid;
begin
 select * into item from public.ledger_books where id=book;
 if not found or not public.has_org_permission(item.organization_id,'ledger.accounts.manage') then raise exception 'Permission denied';end if;
 if length(trim(account_code)) not between 1 and 60 or length(trim(account_name)) not between 2 and 180 then raise exception 'Código ou nome da conta inválido.';end if;
 if account_kind not in ('asset','liability','equity','revenue','expense') or account_normal_balance not in ('debit','credit') then raise exception 'Classificação contábil inválida.';end if;
 if parent is not null and not exists(select 1 from public.ledger_accounts where organization_id=item.organization_id and client_id=item.client_id and book_id=item.id and id=parent and not is_postable) then raise exception 'A conta pai precisa ser sintética e pertencer ao mesmo plano.';end if;
 insert into public.ledger_accounts(organization_id,client_id,book_id,parent_id,code,name,account_type,normal_balance,is_postable)
 values(item.organization_id,item.client_id,item.id,parent,trim(account_code),trim(account_name),account_kind,account_normal_balance,postable) returning id into result;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.account.created','ledger_accounts',result,jsonb_build_object('code',trim(account_code),'postable',postable));
 return result;
end $$;

create function public.create_ledger_entry(book uuid,period uuid,entry_date date,entry_description text,entry_reference text,idempotency uuid,entry_lines jsonb,source_document uuid default null,entry_source text default 'manual') returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_books; target_period public.ledger_periods; result uuid; line jsonb; position integer:=0; target_account public.ledger_accounts;
begin
 select * into item from public.ledger_books where id=book;
 if not found or not public.has_org_permission(item.organization_id,'ledger.entries.create') then raise exception 'Permission denied';end if;
 select * into target_period from public.ledger_periods where organization_id=item.organization_id and client_id=item.client_id and book_id=item.id and id=period for update;
 if not found or target_period.status<>'open' then raise exception 'O período contábil não está aberto.';end if;
 if to_char(entry_date,'YYYY-MM')<>target_period.competence then raise exception 'A data não pertence à competência selecionada.';end if;
 if length(trim(entry_description)) not between 3 and 1000 or entry_source not in ('manual','opening','adjustment','import') then raise exception 'Dados do lançamento inválidos.';end if;
 if jsonb_typeof(entry_lines)<>'array' or jsonb_array_length(entry_lines) not between 2 and 1000 then raise exception 'Informe entre 2 e 1.000 partidas.';end if;
 if source_document is not null and not exists(select 1 from public.documents where organization_id=item.organization_id and client_id=item.client_id and id=source_document) then raise exception 'Documento não pertence à empresa.';end if;
 select id into result from public.ledger_journal_entries where organization_id=item.organization_id and client_id=item.client_id and idempotency_key=idempotency;
 if result is not null then return result;end if;
 insert into public.ledger_journal_entries(organization_id,client_id,book_id,period_id,entry_date,description,reference,source_type,document_id,idempotency_key)
 values(item.organization_id,item.client_id,item.id,target_period.id,entry_date,trim(entry_description),left(coalesce(entry_reference,''),180),entry_source,source_document,idempotency) returning id into result;
 for line in select value from jsonb_array_elements(entry_lines) loop
  position:=position+1;
  select * into target_account from public.ledger_accounts where organization_id=item.organization_id and client_id=item.client_id and book_id=item.id and id=(line->>'account_id')::uuid;
  if not found or not target_account.is_active or not target_account.is_postable then raise exception 'A partida % usa uma conta inativa, sintética ou de outra empresa.',position;end if;
  if line->>'side' not in ('debit','credit') or (line->>'amount')::numeric<=0 then raise exception 'A partida % possui natureza ou valor inválido.',position;end if;
  insert into public.ledger_journal_lines(organization_id,client_id,book_id,entry_id,account_id,line_number,side,amount,memo)
  values(item.organization_id,item.client_id,item.id,result,target_account.id,position,line->>'side',(line->>'amount')::numeric,left(coalesce(line->>'memo',''),500));
 end loop;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.entry.drafted','ledger_journal_entries',result,jsonb_build_object('lines',position,'competence',target_period.competence));
 return result;
end $$;

create function public.assert_ledger_entry_balanced(target_entry uuid) returns void language plpgsql security definer set search_path='' as $$
declare debit_total numeric(19,2); credit_total numeric(19,2); debit_lines integer; credit_lines integer;
begin
 select coalesce(sum(amount) filter(where side='debit'),0),coalesce(sum(amount) filter(where side='credit'),0),count(*) filter(where side='debit'),count(*) filter(where side='credit')
 into debit_total,credit_total,debit_lines,credit_lines from public.ledger_journal_lines where entry_id=target_entry;
 if debit_lines=0 or credit_lines=0 or debit_total<=0 or debit_total<>credit_total then
  raise exception 'Lançamento desbalanceado: débitos % e créditos %.',to_char(debit_total,'FM999999999999990D00'),to_char(credit_total,'FM999999999999990D00');
 end if;
end $$;

create function public.guard_ledger_posting() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='draft' and new.status='posted' then perform public.assert_ledger_entry_balanced(old.id); return new;end if;
 if old.status in ('posted','reversed') then
  if old.status='posted' and new.status='reversed' and new.reversed_by_entry_id is not null
   and new.organization_id=old.organization_id and new.client_id=old.client_id and new.book_id=old.book_id and new.period_id=old.period_id
   and new.entry_number=old.entry_number and new.entry_date=old.entry_date and new.description=old.description and new.reference=old.reference
   and new.source_type=old.source_type and new.document_id is not distinct from old.document_id and new.idempotency_key=old.idempotency_key
   and new.reversal_of_entry_id is not distinct from old.reversal_of_entry_id and new.created_by=old.created_by and new.posted_by=old.posted_by and new.posted_at=old.posted_at
  then return new;end if;
  raise exception 'Lançamento postado é imutável. Faça um estorno.';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger guard_ledger_entry before update or delete on public.ledger_journal_entries for each row execute function public.guard_ledger_posting();

create function public.guard_ledger_line() returns trigger language plpgsql set search_path='' as $$
declare target uuid; state text;
begin
 target:=case when tg_op='DELETE' then old.entry_id else new.entry_id end;
 select status into state from public.ledger_journal_entries where id=target;
 if state is distinct from 'draft' then raise exception 'Partidas de lançamento postado são imutáveis. Faça um estorno.';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger guard_ledger_line before insert or update or delete on public.ledger_journal_lines for each row execute function public.guard_ledger_line();

create function public.post_ledger_entry(entry uuid,expected_version integer) returns bigint language plpgsql security definer set search_path='' as $$
declare item public.ledger_journal_entries; target_period public.ledger_periods; assigned_number bigint;
begin
 select * into item from public.ledger_journal_entries where id=entry for update;
 if not found or not public.has_org_permission(item.organization_id,'ledger.entries.post') then raise exception 'Permission denied';end if;
 if item.status<>'draft' or item.version<>expected_version then raise exception 'O lançamento mudou ou já foi postado. Recarregue a página.';end if;
 select * into target_period from public.ledger_periods where id=item.period_id for update;
 if target_period.status<>'open' then raise exception 'O período contábil está fechado.';end if;
 perform public.assert_ledger_entry_balanced(item.id);
 assigned_number:=target_period.next_entry_number;
 update public.ledger_periods set next_entry_number=next_entry_number+1,updated_at=now() where id=target_period.id;
 update public.ledger_journal_entries set status='posted',entry_number=assigned_number,posted_by=auth.uid(),posted_at=now(),version=version+1,updated_at=now() where id=item.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.entry.posted','ledger_journal_entries',item.id,jsonb_build_object('entry_number',assigned_number));
 insert into public.outbox_events(organization_id,kind,entity_id) values(item.organization_id,'ledger.entry.posted',item.id) on conflict do nothing;
 return assigned_number;
end $$;

create function public.discard_ledger_entry(entry uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare item public.ledger_journal_entries;
begin
 select * into item from public.ledger_journal_entries where id=entry for update;
 if not found or not public.has_org_permission(item.organization_id,'ledger.entries.create') then raise exception 'Permission denied';end if;
 if item.status<>'draft' or item.version<>expected_version then raise exception 'Somente um rascunho atual pode ser descartado.';end if;
 delete from public.ledger_journal_lines where entry_id=item.id;
 delete from public.ledger_journal_entries where id=item.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(item.organization_id,auth.uid(),'ledger.entry.discarded','ledger_journal_entries',item.id);
end $$;

create function public.reverse_ledger_entry(entry uuid,target_period_id uuid,reversal_date date,reversal_reason text,idempotency uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare original public.ledger_journal_entries; target_period public.ledger_periods; result uuid; assigned_number bigint;
begin
 select * into original from public.ledger_journal_entries where id=entry for update;
 if not found or not public.has_org_permission(original.organization_id,'ledger.entries.post') then raise exception 'Permission denied';end if;
 if original.status<>'posted' or original.reversed_by_entry_id is not null then raise exception 'Somente um lançamento postado e ainda não estornado pode ser estornado.';end if;
 if length(trim(reversal_reason))<5 then raise exception 'Explique o motivo do estorno.';end if;
 select * into target_period from public.ledger_periods where id=target_period_id and organization_id=original.organization_id and client_id=original.client_id and book_id=original.book_id for update;
 if not found or target_period.status<>'open' then raise exception 'Selecione um período aberto da mesma empresa.';end if;
 if to_char(reversal_date,'YYYY-MM')<>target_period.competence then raise exception 'A data do estorno não pertence ao período selecionado.';end if;
 insert into public.ledger_journal_entries(organization_id,client_id,book_id,period_id,entry_date,description,reference,source_type,idempotency_key,reversal_of_entry_id)
 values(original.organization_id,original.client_id,original.book_id,target_period.id,reversal_date,'Estorno: '||left(trim(reversal_reason),980),original.reference,'reversal',idempotency,original.id) returning id into result;
 assigned_number:=target_period.next_entry_number;
 insert into public.ledger_journal_lines(organization_id,client_id,book_id,entry_id,account_id,line_number,side,amount,memo)
 select organization_id,client_id,book_id,result,account_id,line_number,case side when 'debit' then 'credit' else 'debit' end,amount,left('Estorno · '||memo,500) from public.ledger_journal_lines where entry_id=original.id order by line_number;
 perform public.assert_ledger_entry_balanced(result);
 update public.ledger_periods set next_entry_number=next_entry_number+1,updated_at=now() where id=target_period.id;
 update public.ledger_journal_entries set status='posted',entry_number=assigned_number,posted_by=auth.uid(),posted_at=now(),version=version+1,updated_at=now() where id=result;
 update public.ledger_journal_entries set status='reversed',reversed_by_entry_id=result,version=version+1,updated_at=now() where id=original.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(original.organization_id,auth.uid(),'ledger.entry.reversed','ledger_journal_entries',original.id,jsonb_build_object('reversal_entry_id',result,'entry_number',assigned_number,'reason',left(trim(reversal_reason),1000)));
 insert into public.outbox_events(organization_id,kind,entity_id) values(original.organization_id,'ledger.entry.posted',result) on conflict do nothing;
 return result;
end $$;

create function public.close_ledger_period(period uuid,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare item public.ledger_periods; debit_total numeric; credit_total numeric;
begin
 select * into item from public.ledger_periods where id=period for update;
 if not found or not public.has_org_permission(item.organization_id,'ledger.close') then raise exception 'Permission denied';end if;
 if item.status<>'open' or item.revision<>expected_revision then raise exception 'O período mudou ou já está fechado.';end if;
 if exists(select 1 from public.ledger_journal_entries where period_id=item.id and status='draft') then raise exception 'Poste ou descarte os lançamentos em rascunho antes de fechar.';end if;
 select coalesce(sum(l.amount) filter(where l.side='debit'),0),coalesce(sum(l.amount) filter(where l.side='credit'),0) into debit_total,credit_total
 from public.ledger_journal_entries e join public.ledger_journal_lines l on l.entry_id=e.id and l.organization_id=e.organization_id where e.period_id=item.id and e.status in ('posted','reversed');
 if debit_total<>credit_total then raise exception 'O período está desbalanceado e não pode ser fechado.';end if;
 update public.ledger_periods set status='closed',closed_at=now(),closed_by=auth.uid(),revision=revision+1,updated_at=now() where id=item.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.period.closed','ledger_periods',item.id,jsonb_build_object('competence',item.competence,'debits',debit_total,'credits',credit_total));
 insert into public.outbox_events(organization_id,kind,entity_id) values(item.organization_id,'ledger.period.closed',item.id) on conflict do nothing;
end $$;

create function public.reopen_ledger_period(period uuid,reopen_explanation text) returns void language plpgsql security definer set search_path='' as $$
declare item public.ledger_periods;
begin
 select * into item from public.ledger_periods where id=period for update;
 if not found or not public.has_org_permission(item.organization_id,'ledger.reopen') then raise exception 'Permission denied';end if;
 if item.status<>'closed' or length(trim(reopen_explanation))<5 then raise exception 'Somente período fechado pode ser reaberto, com justificativa.';end if;
 update public.ledger_periods set status='open',closed_at=null,closed_by=null,reopened_at=now(),reopened_by=auth.uid(),reopen_reason=left(trim(reopen_explanation),1000),revision=revision+1,updated_at=now() where id=item.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.period.reopened','ledger_periods',item.id,jsonb_build_object('competence',item.competence,'reason',left(trim(reopen_explanation),1000)));
end $$;

create function public.ledger_journal(book uuid,date_from date,date_to date) returns table(entry_id uuid,entry_number bigint,entry_date date,description text,reference text,source_type text,line_number integer,account_id uuid,account_code text,account_name text,side text,amount numeric,document_id uuid,created_by_name text) language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.ledger_books where id=book;
 if org is null or not public.has_org_permission(org,'ledger.reports.read') then raise exception 'Permission denied';end if;
 return query select e.id,e.entry_number,e.entry_date,e.description,e.reference,e.source_type,l.line_number,a.id,a.code,a.name,l.side,l.amount,e.document_id,p.full_name
 from public.ledger_journal_entries e join public.ledger_journal_lines l on l.organization_id=e.organization_id and l.entry_id=e.id
 join public.ledger_accounts a on a.organization_id=l.organization_id and a.id=l.account_id
 join public.profiles p on p.id=e.created_by
 where e.book_id=book and e.status in ('posted','reversed') and e.entry_date between date_from and date_to
 order by e.entry_date,e.entry_number,l.line_number;
end $$;

create function public.ledger_general_ledger(book uuid,target_account uuid,date_from date,date_to date) returns table(entry_id uuid,entry_number bigint,entry_date date,description text,reference text,side text,debit numeric,credit numeric,opening_balance numeric,balance numeric) language plpgsql stable security definer set search_path='' as $$
declare org uuid; normal text; opening_signed numeric;
begin
 select b.organization_id,a.normal_balance into org,normal from public.ledger_books b join public.ledger_accounts a on a.organization_id=b.organization_id and a.book_id=b.id where b.id=book and a.id=target_account;
 if org is null or not public.has_org_permission(org,'ledger.reports.read') then raise exception 'Permission denied';end if;
 select coalesce(sum(case l.side when 'debit' then l.amount else -l.amount end),0) into opening_signed
 from public.ledger_journal_entries e join public.ledger_journal_lines l on l.organization_id=e.organization_id and l.entry_id=e.id
 where e.book_id=book and l.account_id=target_account and e.status in ('posted','reversed') and e.entry_date<date_from;
 return query select e.id,e.entry_number,e.entry_date,e.description,e.reference,l.side,
  case when l.side='debit' then l.amount else 0::numeric end,case when l.side='credit' then l.amount else 0::numeric end,
  case when normal='debit' then opening_signed else -opening_signed end,
  case when normal='debit' then opening_signed+sum(case l.side when 'debit' then l.amount else -l.amount end) over(order by e.entry_date,e.entry_number,l.line_number)
       else -(opening_signed+sum(case l.side when 'debit' then l.amount else -l.amount end) over(order by e.entry_date,e.entry_number,l.line_number)) end
 from public.ledger_journal_entries e join public.ledger_journal_lines l on l.organization_id=e.organization_id and l.entry_id=e.id
 where e.book_id=book and l.account_id=target_account and e.status in ('posted','reversed') and e.entry_date between date_from and date_to
 order by e.entry_date,e.entry_number,l.line_number;
end $$;

create function public.ledger_trial_balance(book uuid,date_from date,date_to date) returns table(account_id uuid,account_code text,account_name text,account_type text,normal_balance text,opening_debit numeric,opening_credit numeric,period_debit numeric,period_credit numeric,closing_debit numeric,closing_credit numeric) language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.ledger_books where id=book;
 if org is null or not public.has_org_permission(org,'ledger.reports.read') then raise exception 'Permission denied';end if;
 return query with totals as (
  select a.id,a.code,a.name,a.account_type,a.normal_balance,
   coalesce(sum(case when e.entry_date<date_from and l.side='debit' then l.amount when e.entry_date<date_from and l.side='credit' then -l.amount else 0 end),0) opening_signed,
   coalesce(sum(l.amount) filter(where e.entry_date between date_from and date_to and l.side='debit'),0) debits,
   coalesce(sum(l.amount) filter(where e.entry_date between date_from and date_to and l.side='credit'),0) credits
  from public.ledger_accounts a left join public.ledger_journal_lines l on l.organization_id=a.organization_id and l.account_id=a.id
  left join public.ledger_journal_entries e on e.organization_id=l.organization_id and e.id=l.entry_id and e.status in ('posted','reversed') and e.entry_date<=date_to
  where a.book_id=book and a.is_postable
  group by a.id,a.code,a.name,a.account_type,a.normal_balance
 ) select t.id,t.code,t.name,t.account_type,t.normal_balance,greatest(t.opening_signed,0),greatest(-t.opening_signed,0),t.debits,t.credits,
  greatest(t.opening_signed+t.debits-t.credits,0),greatest(-(t.opening_signed+t.debits-t.credits),0)
 from totals t order by t.code;
end $$;

do $$ declare t text; begin
 foreach t in array array['ledger_books','ledger_periods','ledger_accounts','ledger_journal_entries','ledger_journal_lines'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy ledger_read on public.%I for select to authenticated using(public.has_org_permission(organization_id,''ledger.read''))',t);
 end loop;
 foreach t in array array['ledger_books','ledger_periods','ledger_accounts','ledger_journal_entries'] loop execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()',t);end loop;
end $$;

revoke all on function public.assert_ledger_entry_balanced(uuid) from public,anon,authenticated;
grant execute on function public.ensure_ledger_book(uuid,uuid),public.open_ledger_period(uuid,text),public.create_ledger_account(uuid,text,text,text,text,boolean,uuid),public.create_ledger_entry(uuid,uuid,date,text,text,uuid,jsonb,uuid,text),public.post_ledger_entry(uuid,integer),public.discard_ledger_entry(uuid,integer),public.reverse_ledger_entry(uuid,uuid,date,text,uuid),public.close_ledger_period(uuid,integer),public.reopen_ledger_period(uuid,text),public.ledger_journal(uuid,date,date),public.ledger_general_ledger(uuid,uuid,date,date),public.ledger_trial_balance(uuid,date,date) to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
