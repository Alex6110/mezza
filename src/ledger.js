// Calcolo dei saldi dal punto di vista dell'utente. Importi in centesimi.
// Saldo con una persona: > 0 = ti deve, < 0 = devi dare.
import { supabase } from './supabase.js';

export async function loadLedger(me) {
  const [c, e, s, n] = await Promise.all([
    supabase.from('contacts').select('id,owner_id,name,linked_user_id'),
    supabase.from('expenses')
      .select('id,title,amount_cents,spent_on,created_by,payer_contact_id,created_at,expense_shares(contact_id,amount_cents)')
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('settlements').select('id,created_by,contact_id,direction,amount_cents,status,method,settled_on,created_at'),
    supabase.from('notifications').select('id,title,body,created_at,read_at').order('created_at', { ascending: false }).limit(30),
  ]);
  const err = [c, e, s, n].find(r => r.error)?.error;
  if (err) throw err;

  const mine = c.data.filter(x => x.owner_id === me);
  const toMe = new Set(c.data.filter(x => x.linked_user_id === me).map(x => x.id)); // "io" nei libri altrui
  const keyOf = uid => mine.find(x => x.linked_user_id === uid)?.id ?? 'u:' + uid;
  const bal = {}, delta = {}, items = {};
  const add = (k, v, it) => { if (k) { bal[k] = (bal[k] || 0) + v; (items[k] ||= []).push({ ...it, v }); } };

  for (const x of e.data) {
    const own = x.created_by === me;
    const iPaid = own ? x.payer_contact_id == null : toMe.has(x.payer_contact_id);
    const payerKey = own ? x.payer_contact_id : (x.payer_contact_id == null ? keyOf(x.created_by) : null);
    let d = 0;
    const ex = { kind: 'e', id: x.id, title: x.title, date: x.spent_on, ts: x.created_at, total: x.amount_cents, iPaid };
    for (const sh of x.expense_shares) {
      const mineShare = own ? sh.contact_id == null : toMe.has(sh.contact_id);
      const otherShare = own ? sh.contact_id != null : sh.contact_id == null;
      if (iPaid && otherShare) { add(own ? sh.contact_id : keyOf(x.created_by), sh.amount_cents, ex); d += sh.amount_cents; }
      else if (!iPaid && mineShare && payerKey) { add(payerKey, -sh.amount_cents, ex); d -= sh.amount_cents; }
    }
    delta[x.id] = d;
  }
  for (const t of s.data) {
    if (t.status !== 'confirmed') continue;
    const own = t.created_by === me;
    const iGave = own ? t.direction === 'paid' : t.direction === 'received';
    add(own ? t.contact_id : keyOf(t.created_by), iGave ? t.amount_cents : -t.amount_cents, { kind: 's', id: t.id, method: t.method, date: t.settled_on, ts: t.created_at });
  }
  const v = Object.values(bal);
  return {
    owed: v.filter(x => x > 0).reduce((a, b) => a + b, 0),
    owe: Math.abs(v.filter(x => x < 0).reduce((a, b) => a + b, 0)),
    contacts: mine, bal, items,
    recent: e.data.slice(0, 6).map(x => ({ ...x, delta: delta[x.id] })),
    notifs: n.data,
  };
}
