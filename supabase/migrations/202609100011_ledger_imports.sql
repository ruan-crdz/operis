-- Operis Ledger Parte 2: extrato bancario, regras de classificacao deterministicas e conciliacao 1:1.
create table public.ledger_bank_accounts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 ledger_account_id uuid not null,
 bank_name text not null check(length(trim(bank_name)) between 1 and 120),
 account_label text not null default '' check(length(account_label)<=180),
 active boolean not null default true,
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,client_id,book_id,id),
 foreign key(organization_id,client_id,book_id) references public.ledger_books(organization_id,client_id,id),
 foreign key(organization_id,client_id,book_id,ledger_account_id) references public.ledger_accounts(organization_id,client_id,book_id,id)
);

create table public.ledger_import_batches (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 bank_account_id uuid not null,
 original_filename text not null,
 checksum text not null,
 row_count integer not null default 0 check(row_count>=0),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,bank_account_id,checksum),
 foreign key(organization_id,client_id,book_id) references public.ledger_books(organization_id,client_id,id),
 foreign key(organization_id,client_id,book_id,bank_account_id) references public.ledger_bank_accounts(organization_id,client_id,book_id,id)
);

create table public.ledger_bank_transactions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 bank_account_id uuid not null,
 batch_id uuid not null,
 posted_date date not null,
 amount numeric(19,2) not null check(amount<>0),
 description text not null default '' check(length(description)<=500),
 fitid text,
 status text not null default 'unmatched' check(status in ('unmatched','matched','ignored')),
 matched_entry_id uuid,
 matched_by uuid references public.profiles(id),
 matched_at timestamptz,
 created_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,client_id,book_id) references public.ledger_books(organization_id,client_id,id),
 foreign key(organization_id,client_id,book_id,bank_account_id) references public.ledger_bank_accounts(organization_id,client_id,book_id,id),
 foreign key(organization_id,batch_id) references public.ledger_import_batches(organization_id,id),
 foreign key(organization_id,client_id,book_id,matched_entry_id) references public.ledger_journal_entries(organization_id,client_id,book_id,id),
 check((status='matched')=(matched_entry_id is not null))
);
create unique index ledger_bank_txn_fitid on public.ledger_bank_transactions(organization_id,bank_account_id,fitid) where fitid is not null;
create index ledger_bank_txn_lookup on public.ledger_bank_transactions(organization_id,bank_account_id,status,posted_date);

create table public.ledger_classification_rules (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 match_value text not null check(length(trim(match_value)) between 2 and 180),
 counterpart_account_id uuid not null,
 priority integer not null default 100 check(priority between 1 and 1000),
 active boolean not null default true,
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,client_id,book_id) references public.ledger_books(organization_id,client_id,id),
 foreign key(organization_id,client_id,book_id,counterpart_account_id) references public.ledger_accounts(organization_id,client_id,book_id,id)
);
create index ledger_rules_lookup on public.ledger_classification_rules(organization_id,book_id,active,priority);

do $$ declare t text; begin
 foreach t in array array['ledger_bank_accounts','ledger_import_batches','ledger_bank_transactions','ledger_classification_rules'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy ledger_read on public.%I for select to authenticated using(public.has_org_permission(organization_id,''ledger.read''))',t);
 end loop;
 foreach t in array array['ledger_bank_accounts','ledger_classification_rules'] loop execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()',t);end loop;
end $$;

create function public.create_ledger_bank_account(book uuid,for_account uuid,bank text,label text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_books; result uuid;
begin
 select * into item from public.ledger_books where id=book;
 if not found or not public.has_org_permission(item.organization_id,'ledger.accounts.manage') then raise exception 'Permission denied';end if;
 if not exists(select 1 from public.ledger_accounts where organization_id=item.organization_id and client_id=item.client_id and book_id=item.id and id=for_account and account_type='asset' and is_postable) then
  raise exception 'Selecione uma conta analítica do tipo Ativo para representar o banco.';
 end if;
 if length(trim(bank)) not between 1 and 120 then raise exception 'Informe o nome do banco.';end if;
 insert into public.ledger_bank_accounts(organization_id,client_id,book_id,ledger_account_id,bank_name,account_label)
 values(item.organization_id,item.client_id,item.id,for_account,trim(bank),left(coalesce(label,''),180)) returning id into result;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(item.organization_id,auth.uid(),'ledger.bank_account.created','ledger_bank_accounts',result);
 return result;
end $$;

create function public.import_bank_statement(bank_account uuid,filename text,file_checksum text,transactions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_bank_accounts; batch uuid; inserted integer:=0; row_item jsonb; existing uuid;
begin
 select * into item from public.ledger_bank_accounts where id=bank_account;
 if not found or not public.has_org_permission(item.organization_id,'ledger.entries.create') then raise exception 'Permission denied';end if;
 if jsonb_typeof(transactions)<>'array' or jsonb_array_length(transactions) not between 1 and 5000 then raise exception 'Envie entre 1 e 5.000 lançamentos do extrato.';end if;
 select id into existing from public.ledger_import_batches where organization_id=item.organization_id and bank_account_id=bank_account and checksum=file_checksum;
 if existing is not null then return existing;end if;
 insert into public.ledger_import_batches(organization_id,client_id,book_id,bank_account_id,original_filename,checksum)
 values(item.organization_id,item.client_id,item.book_id,bank_account,left(filename,255),file_checksum) returning id into batch;
 for row_item in select value from jsonb_array_elements(transactions) loop
  if (row_item->>'amount')::numeric=0 then continue;end if;
  insert into public.ledger_bank_transactions(organization_id,client_id,book_id,bank_account_id,batch_id,posted_date,amount,description,fitid)
  values(item.organization_id,item.client_id,item.book_id,bank_account,batch,(row_item->>'date')::date,(row_item->>'amount')::numeric,left(coalesce(row_item->>'description',''),500),nullif(row_item->>'fitid',''))
  on conflict (organization_id,bank_account_id,fitid) where fitid is not null do nothing;
  inserted:=inserted+1;
 end loop;
 update public.ledger_import_batches set row_count=inserted where id=batch;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.bank_statement.imported','ledger_import_batches',batch,jsonb_build_object('rows',inserted));
 return batch;
end $$;

create function public.create_ledger_classification_rule(book uuid,value text,counterpart uuid,rule_priority integer default 100) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_books; result uuid;
begin
 select * into item from public.ledger_books where id=book;
 if not found or not public.has_org_permission(item.organization_id,'ledger.accounts.manage') then raise exception 'Permission denied';end if;
 if not exists(select 1 from public.ledger_accounts where organization_id=item.organization_id and client_id=item.client_id and book_id=item.id and id=counterpart and is_postable) then raise exception 'Selecione uma conta analítica para a contrapartida.';end if;
 insert into public.ledger_classification_rules(organization_id,client_id,book_id,match_value,counterpart_account_id,priority)
 values(item.organization_id,item.client_id,item.id,trim(value),counterpart,coalesce(rule_priority,100)) returning id into result;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.rule.created','ledger_classification_rules',result,jsonb_build_object('match_value',trim(value)));
 return result;
end $$;

create function public.create_entry_from_bank_transaction(transaction_id uuid,counterpart uuid,entry_description text) returns uuid language plpgsql security definer set search_path='' as $$
declare txn public.ledger_bank_transactions; bank public.ledger_bank_accounts; target_period public.ledger_periods; result uuid; is_inflow boolean;
begin
 select * into txn from public.ledger_bank_transactions where id=transaction_id for update;
 if not found or not public.has_org_permission(txn.organization_id,'ledger.entries.create') then raise exception 'Permission denied';end if;
 if txn.status<>'unmatched' then raise exception 'Este lançamento do extrato já foi conciliado ou ignorado.';end if;
 select * into bank from public.ledger_bank_accounts where id=txn.bank_account_id;
 select * into target_period from public.ledger_periods where organization_id=txn.organization_id and client_id=txn.client_id and book_id=txn.book_id and competence=to_char(txn.posted_date,'YYYY-MM');
 if not found or target_period.status<>'open' then raise exception 'Abra a competência % antes de classificar este lançamento.',to_char(txn.posted_date,'YYYY-MM');end if;
 is_inflow:=txn.amount>0;
 result:=public.create_ledger_entry(
  txn.book_id,target_period.id,txn.posted_date,
  coalesce(nullif(trim(entry_description),''),txn.description),'',gen_random_uuid(),
  jsonb_build_array(
   jsonb_build_object('account_id',case when is_inflow then bank.ledger_account_id else counterpart end,'side','debit','amount',abs(txn.amount),'memo',''),
   jsonb_build_object('account_id',case when is_inflow then counterpart else bank.ledger_account_id end,'side','credit','amount',abs(txn.amount),'memo','')
  ),null,'import'
 );
 update public.ledger_bank_transactions set status='matched',matched_entry_id=result,matched_by=auth.uid(),matched_at=now() where id=txn.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(txn.organization_id,auth.uid(),'ledger.bank_transaction.matched','ledger_bank_transactions',txn.id,jsonb_build_object('entry_id',result));
 return result;
end $$;

create function public.ignore_bank_transaction(transaction_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare txn public.ledger_bank_transactions;
begin
 select * into txn from public.ledger_bank_transactions where id=transaction_id for update;
 if not found or not public.has_org_permission(txn.organization_id,'ledger.entries.create') then raise exception 'Permission denied';end if;
 if txn.status<>'unmatched' then raise exception 'Somente um lançamento não conciliado pode ser ignorado.';end if;
 update public.ledger_bank_transactions set status='ignored',matched_by=auth.uid(),matched_at=now() where id=txn.id;
end $$;

revoke all on function public.import_bank_statement(uuid,text,text,jsonb) from public,anon;
grant execute on function public.create_ledger_bank_account(uuid,uuid,text,text),public.import_bank_statement(uuid,text,text,jsonb),public.create_ledger_classification_rule(uuid,text,uuid,integer),public.create_entry_from_bank_transaction(uuid,uuid,text),public.ignore_bank_transaction(uuid) to authenticated;
