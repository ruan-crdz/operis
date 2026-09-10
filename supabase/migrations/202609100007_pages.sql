-- The browser can read/mutate through RLS, but cannot supply a fabricated workbook.
-- Only the Edge parser signs the exact original-derived payload. This secret is never exposed via the Data API.
create schema if not exists operis_private;
revoke all on schema operis_private from public,anon,authenticated;
create table operis_private.edge_secrets(name text primary key,value text not null);
revoke all on operis_private.edge_secrets from public,anon,authenticated;
insert into operis_private.edge_secrets values('import_signing_key',replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));

-- RFC 2104 HMAC-SHA256 using PostgreSQL's built-in SHA256 (no optional extension).
create function operis_private.hmac_sha256(message bytea,secret bytea) returns bytea language plpgsql immutable strict set search_path='' as $$
declare k bytea:=secret; ipad bytea:=decode(repeat('36',64),'hex'); opad bytea:=decode(repeat('5c',64),'hex'); i integer;
begin
 if octet_length(k)>64 then k:=sha256(k);end if;
 for i in 0..octet_length(k)-1 loop
  ipad:=set_byte(ipad,i,get_byte(ipad,i)#get_byte(k,i));
  opad:=set_byte(opad,i,get_byte(opad,i)#get_byte(k,i));
 end loop;
 return sha256(opad||sha256(ipad||message));
end $$;
revoke all on function operis_private.hmac_sha256(bytea,bytea) from public,anon,authenticated;
revoke execute on function public.create_import(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;

create function public.create_verified_import(payload text,signature text) returns uuid language plpgsql security definer set search_path='' as $$
declare secret text; expected text; doc jsonb; result uuid;
begin
 if auth.uid() is null then raise exception 'Permission denied';end if;
 if octet_length(payload)>15000000 then raise exception 'Workbook too large';end if;
 select value into secret from operis_private.edge_secrets where name='import_signing_key';
 expected:=encode(operis_private.hmac_sha256(convert_to(payload,'UTF8'),convert_to(secret,'UTF8')),'hex');
 if signature is null or expected is null or signature<>expected then raise exception 'Assinatura de processamento inválida.';end if;
 doc:=payload::jsonb;
 if doc->>'actor' is distinct from auth.uid()::text or (doc->>'expires')::bigint is null or (doc->>'expires')::bigint<extract(epoch from now()) or (doc->>'expires')::bigint>extract(epoch from now())+180 then raise exception 'Autorização de processamento expirada ou inválida.';end if;
 if not public.has_org_permission((doc->>'org')::uuid,'imports.create') then raise exception 'Permission denied';end if;
 if not exists(select 1 from storage.objects where bucket_id='documents' and name=doc->>'path' and owner_id=auth.uid()::text) then raise exception 'Arquivo original não encontrado.';end if;
 select id into result from public.imports where organization_id=(doc->>'org')::uuid and client_id=(doc->>'client')::uuid and competence=doc->>'competence' and checksum=doc->>'checksum';
 if result is not null then return result;end if;
 return public.create_import((doc->>'org')::uuid,(doc->>'client')::uuid,doc->>'competence',doc->>'filename',doc->>'path',doc->>'checksum',doc->'workbook');
end $$;
revoke all on function public.create_verified_import(text,text) from public,anon;
grant execute on function public.create_verified_import(text,text) to authenticated;
