create function public.create_document_request(org_id uuid,target_client uuid,title text,competence text,labels text[],due date default null) returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid;begin
 if not public.has_org_permission(org_id,'documents.manage') then raise exception 'Permission denied';end if;
 if cardinality(labels) not between 1 and 50 then raise exception 'Informe os documentos solicitados.';end if;
 insert into public.document_requests(organization_id,client_id,title,competence,due_date,created_by) values(org_id,target_client,title,competence,due,auth.uid()) returning id into request_id;
 insert into public.document_request_items(organization_id,request_id,label) select org_id,request_id,unnest(labels);return request_id;end $$;
revoke all on function public.create_document_request(uuid,uuid,text,text,text[],date) from public,anon;
grant execute on function public.create_document_request(uuid,uuid,text,text,text[],date) to authenticated;
create function public.protect_request_item() returns trigger language plpgsql set search_path='' as $$
declare requested_client uuid;document_client uuid;begin
 if new.status in ('received','validating','accepted') and new.document_id is null then raise exception 'Vincule um documento recebido.';end if;
 if new.document_id is not null then
 select client_id into requested_client from public.document_requests where id=new.request_id and organization_id=new.organization_id;
 select client_id into document_client from public.documents where id=new.document_id and organization_id=new.organization_id;
 if requested_client is distinct from document_client then raise exception 'O documento pertence a outro cliente.';end if;end if;return new;end $$;
create trigger protect_request_item before insert or update on public.document_request_items for each row execute function public.protect_request_item();
create or replace function public.valid_cpf(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare digits text:=regexp_replace(value,'[^0-9]','','g');s integer;n integer;i integer;begin
 if digits !~ '^[0-9]{11}$' or digits ~ '^([0-9])\1{10}$' then return false;end if;
 for n in 9..10 loop s=0;for i in 1..n loop s=s+substring(digits,i,1)::integer*(n+2-i);end loop;
 if ((s*10)%11)%10<>substring(digits,n+1,1)::integer then return false;end if;end loop;return true;end $$;
