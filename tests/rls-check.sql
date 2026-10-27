-- Controllo isolamento dei dati (RLS). Non modifica nulla: finisce con ROLLBACK.
-- 1) Crea due account di prova NON collegati tra loro e inserisci qualche contatto e spesa nel primo.
-- 2) Authentication > Users: copia i loro id. Sostituisci in questo file (Trova e sostituisci):
--      AAAA-ID-DI-A  con l'id del primo account   |   BBBB-ID-DI-B  con l'id del secondo
--      b@example.com con l'email del secondo
-- 3) Incolla tutto nel SQL Editor ed esegui. Nei risultati ogni riga "atteso 0" deve valere 0.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'BBBB-ID-DI-B', 'email', 'b@example.com', 'role', 'authenticated')::text, true);

select 'contatti di A visibili a B (atteso 0)' as test, count(*) from contacts where owner_id = 'AAAA-ID-DI-A'
union all select 'spese di A visibili a B (atteso 0)', count(*) from expenses where created_by = 'AAAA-ID-DI-A'
union all select 'quote di A visibili a B (atteso 0)', count(*) from expense_shares s join expenses e on e.id = s.expense_id where e.created_by = 'AAAA-ID-DI-A'
union all select 'saldi di A visibili a B (atteso 0)', count(*) from settlements where created_by = 'AAAA-ID-DI-A'
union all select 'gruppi di A visibili a B (atteso 0)', count(*) from groups where owner_id = 'AAAA-ID-DI-A'
union all select 'notifiche di A visibili a B (atteso 0)', count(*) from notifications where user_id = 'AAAA-ID-DI-A'
union all select 'inviti di A visibili a B (atteso 0)', count(*) from link_requests where from_user = 'AAAA-ID-DI-A'
union all select 'profilo di A visibile a B (atteso 0)', count(*) from profiles where id = 'AAAA-ID-DI-A';

-- Tentativi di scrittura: tutti devono risultare "OK: bloccato"
do $$ begin
  begin insert into expenses (created_by, title, amount_cents) values ('AAAA-ID-DI-A', 'x', 100);
    raise notice 'ERRORE: B ha creato una spesa a nome di A';
  exception when others then raise notice 'OK: bloccato (%)', sqlerrm; end;
  begin insert into contacts (owner_id, name) values ('AAAA-ID-DI-A', 'x');
    raise notice 'ERRORE: B ha creato un contatto a nome di A';
  exception when others then raise notice 'OK: bloccato (%)', sqlerrm; end;
end $$;

with u as (update contacts set name = 'hack' where owner_id = 'AAAA-ID-DI-A' returning 1) select 'contatti di A modificati da B (atteso 0)' as test, count(*) from u;
with d as (delete from expenses where created_by = 'AAAA-ID-DI-A' returning 1) select 'spese di A eliminate da B (atteso 0)' as test, count(*) from d;
rollback;
