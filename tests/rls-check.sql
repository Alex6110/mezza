-- Controllo isolamento dei dati (RLS). Non modifica nulla: finisce con ROLLBACK.
-- Prima: crea due account di prova NON collegati tra loro (anche con alias Gmail, es. nome+test1@gmail.com
-- e nome+test2@gmail.com, la posta arriva nella stessa casella) e inserisci qualche contatto e spesa nel primo.
-- Poi: Authentication > Users, copia i loro id. Con "Trova e sostituisci" cambia in questo file:
--     AAAA-ID-DI-A   ->  id del primo account
--     BBBB-ID-DI-B   ->  id del secondo account
--     b@example.com  ->  email del secondo account
-- Infine incolla tutto nel SQL Editor ed esegui. Leggi la tabella dei risultati: ogni riga deve dire "OK".

begin;
create function public.zz_try(q text) returns text language plpgsql as $f$
begin execute q; return 'ERRORE: scrittura riuscita'; exception when others then return 'OK: bloccato'; end $f$;
create function public.zz_n(q text) returns bigint language plpgsql as $f$
declare n bigint; begin execute 'select count(*) from (' || q || ') t' into n; return n; end $f$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'BBBB-ID-DI-B', 'email', 'b@example.com', 'role', 'authenticated')::text, true);

select test, case when n = 0 then 'OK' else 'ERRORE: ' || n || ' righe visibili/modificate' end as esito from (
  select 'B legge i contatti di A' as test, zz_n($$select 1 from contacts where owner_id = 'AAAA-ID-DI-A'$$) as n
  union all select 'B legge le spese di A', zz_n($$select 1 from expenses where created_by = 'AAAA-ID-DI-A'$$)
  union all select 'B legge le quote di A', zz_n($$select 1 from expense_shares s join expenses e on e.id = s.expense_id where e.created_by = 'AAAA-ID-DI-A'$$)
  union all select 'B legge i saldi di A', zz_n($$select 1 from settlements where created_by = 'AAAA-ID-DI-A'$$)
  union all select 'B legge i gruppi di A', zz_n($$select 1 from groups where owner_id = 'AAAA-ID-DI-A'$$)
  union all select 'B legge le notifiche di A', zz_n($$select 1 from notifications where user_id = 'AAAA-ID-DI-A'$$)
  union all select 'B legge il profilo di A', zz_n($$select 1 from profiles where id = 'AAAA-ID-DI-A'$$)
  union all select 'B modifica i contatti di A', zz_n($$with u as (update contacts set name = 'hack' where owner_id = 'AAAA-ID-DI-A' returning 1) select * from u$$)
  union all select 'B elimina le spese di A', zz_n($$with d as (delete from expenses where created_by = 'AAAA-ID-DI-A' returning 1) select * from d$$)
) r
union all select 'B crea una spesa a nome di A', replace(zz_try($$insert into expenses (created_by, title, amount_cents) values ('AAAA-ID-DI-A', 'x', 100)$$), 'ERRORE: scrittura riuscita', 'ERRORE: scrittura riuscita')
union all select 'B crea un contatto a nome di A', zz_try($$insert into contacts (owner_id, name) values ('AAAA-ID-DI-A', 'x')$$);

rollback;
