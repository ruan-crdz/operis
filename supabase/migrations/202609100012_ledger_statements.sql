-- Operis Ledger Parte 3: DRE, Balanco Patrimonial e checklist de fechamento.
create table public.ledger_statement_mappings (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null,
 book_id uuid not null,
 account_id uuid not null,
 line_key text not null check(line_key in ('gross_revenue','deductions','cost','expense')),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,book_id,account_id),
 foreign key(organization_id,client_id,book_id) references public.ledger_books(organization_id,client_id,id),
 foreign key(organization_id,client_id,book_id,account_id) references public.ledger_accounts(organization_id,client_id,book_id,id)
);

do $$ begin
 execute 'alter table public.ledger_statement_mappings enable row level security';
 execute 'revoke all on public.ledger_statement_mappings from anon,authenticated';
 execute 'grant select on public.ledger_statement_mappings to authenticated';
 execute 'create policy ledger_read on public.ledger_statement_mappings for select to authenticated using(public.has_org_permission(organization_id,''ledger.read''))';
 execute 'create trigger touch before update on public.ledger_statement_mappings for each row execute function public.touch_updated_at()';
end $$;

create function public.map_ledger_statement_account(book uuid,target_account uuid,line text) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_accounts; result uuid; wants_revenue boolean;
begin
 select * into item from public.ledger_accounts where id=target_account and book_id=book;
 if not found or not public.has_org_permission(item.organization_id,'ledger.accounts.manage') then raise exception 'Permission denied';end if;
 if line not in ('gross_revenue','deductions','cost','expense') then raise exception 'Linha de demonstração inválida.';end if;
 wants_revenue:=line in ('gross_revenue','deductions');
 if wants_revenue and item.account_type<>'revenue' then raise exception 'Essa linha aceita apenas contas de Receita.';end if;
 if not wants_revenue and item.account_type<>'expense' then raise exception 'Essa linha aceita apenas contas de Despesa.';end if;
 insert into public.ledger_statement_mappings(organization_id,client_id,book_id,account_id,line_key)
 values(item.organization_id,item.client_id,item.book_id,target_account,line)
 on conflict(organization_id,book_id,account_id) do update set line_key=excluded.line_key,updated_at=now()
 returning id into result;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(item.organization_id,auth.uid(),'ledger.statement_mapping.saved','ledger_statement_mappings',result,jsonb_build_object('line_key',line));
 return result;
end $$;

create function public.ledger_income_statement(book uuid,date_from date,date_to date) returns table(line_key text,amount numeric) language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.ledger_books where id=book;
 if org is null or not public.has_org_permission(org,'ledger.reports.read') then raise exception 'Permission denied';end if;
 return query
 select coalesce(m.line_key,case when a.account_type='revenue' then 'unmapped_revenue' else 'unmapped_expense' end),
  sum(case when a.account_type='revenue' then (case l.side when 'credit' then l.amount else -l.amount end)
           else (case l.side when 'debit' then l.amount else -l.amount end) end)
 from public.ledger_accounts a
 join public.ledger_journal_lines l on l.organization_id=a.organization_id and l.account_id=a.id
 join public.ledger_journal_entries e on e.organization_id=l.organization_id and e.id=l.entry_id and e.status in ('posted','reversed') and e.entry_date between date_from and date_to
 left join public.ledger_statement_mappings m on m.organization_id=a.organization_id and m.book_id=a.book_id and m.account_id=a.id
 where a.book_id=book and a.account_type in ('revenue','expense')
 group by 1;
end $$;

create function public.ledger_balance_sheet(book uuid,as_of date) returns table(account_type text,account_id uuid,code text,name text,balance numeric) language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.ledger_books where id=book;
 if org is null or not public.has_org_permission(org,'ledger.reports.read') then raise exception 'Permission denied';end if;
 return query
 select a.account_type,a.id,a.code,a.name,
  coalesce(sum(case when a.normal_balance='debit' then (case l.side when 'debit' then l.amount else -l.amount end)
                    else (case l.side when 'credit' then l.amount else -l.amount end) end),0)
 from public.ledger_accounts a
 left join (
  select l2.account_id,l2.side,l2.amount from public.ledger_journal_lines l2
  join public.ledger_journal_entries e2 on e2.organization_id=l2.organization_id and e2.id=l2.entry_id
  where e2.book_id=book and e2.status in ('posted','reversed') and e2.entry_date<=as_of
 ) l on l.account_id=a.id
 where a.book_id=book and a.is_postable and a.account_type in ('asset','liability','equity')
 group by a.account_type,a.id,a.code,a.name
 order by a.account_type,a.code;
end $$;

create function public.ledger_closing_checklist(period uuid) returns table(check_key text,ok boolean,detail text) language plpgsql stable security definer set search_path='' as $$
declare item public.ledger_periods; drafts integer; unmapped integer; unmatched integer;
begin
 select * into item from public.ledger_periods where id=period;
 if not found or not public.has_org_permission(item.organization_id,'ledger.reports.read') then raise exception 'Permission denied';end if;
 select count(*) into drafts from public.ledger_journal_entries where period_id=period and status='draft';
 select count(distinct a.id) into unmapped from public.ledger_accounts a
  where a.book_id=item.book_id and a.account_type in ('revenue','expense')
  and not exists(select 1 from public.ledger_statement_mappings m where m.book_id=a.book_id and m.account_id=a.id)
  and exists(select 1 from public.ledger_journal_lines l join public.ledger_journal_entries e on e.id=l.entry_id and e.organization_id=l.organization_id where l.account_id=a.id and e.period_id=period and e.status in ('posted','reversed'));
 select count(*) into unmatched from public.ledger_bank_transactions t where t.book_id=item.book_id and t.status='unmatched' and to_char(t.posted_date,'YYYY-MM')=item.competence;
 return query values
  ('drafts',drafts=0,drafts||' lançamento(s) em rascunho nesta competência'),
  ('unmapped_accounts',unmapped=0,unmapped||' conta(s) de resultado usadas sem mapeamento na DRE'),
  ('unmatched_bank',unmatched=0,unmatched||' lançamento(s) do extrato ainda não conciliados');
end $$;

grant execute on function public.map_ledger_statement_account(uuid,uuid,text),public.ledger_income_statement(uuid,date,date),public.ledger_balance_sheet(uuid,date),public.ledger_closing_checklist(uuid) to authenticated;
