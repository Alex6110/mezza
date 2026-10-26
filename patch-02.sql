-- Fase 2: permette di leggere i contatti (altrui) che puntano a te, per riconoscere le tue quote.
create policy contacts_select_linked on public.contacts for select to authenticated
  using (linked_user_id = auth.uid());
