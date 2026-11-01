// Edge Function: invia la notifica push quando viene inserita una riga in "notifications" (chiamata da un Database Webhook).
// Segreti: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tuaemail@gmail.com), WEBHOOK_SECRET (stringa casuale lunga)
// Ogni passaggio scrive nei Logs e la risposta contiene i dettagli per ogni dispositivo: serve a capire subito cosa non va.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  const url = Deno.env.get('SUPABASE_URL')!;
  // Chiave di servizio: prima quella nuova (SUPABASE_SECRET_KEYS), poi quella vecchia
  let secretKeys: Record<string, string> = {};
  try { secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); } catch { /* ignora */ }
  const key = Object.values(secretKeys)[0] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  // La chiave "anon" è pubblica, quindi non basta: serve il segreto del webhook (x-webhook-secret) oppure la chiave di servizio.
  const secret = Deno.env.get('WEBHOOK_SECRET');
  const okSecret = !!secret && req.headers.get('x-webhook-secret') === secret;
  const okKey = !!key && req.headers.get('Authorization') === `Bearer ${key}`;
  if (!okSecret && !okKey) { console.log('rifiutata: manca l’intestazione x-webhook-secret o è diversa da WEBHOOK_SECRET'); return json({ errore: 'forbidden' }, 403); }

  try {
    const body = await req.json();
    if (body.type && body.type !== 'INSERT') return json({ ignorata: body.type });   // solo i nuovi inserimenti
    const record = body.record;
    if (!record?.user_id) return json({ errore: 'nessun record' }, 400);
    console.log('notifica', record.type, 'per', record.user_id);

    const admin = createClient(url, key);
    const { data: subs, error: e1 } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', record.user_id);
    if (e1) { console.log('errore nella lettura dei dispositivi:', e1.message); return json({ errore: 'lettura dispositivi: ' + e1.message }, 500); }
    if (!subs?.length) { console.log('nessun dispositivo iscritto per questo utente'); return json({ inviate: 0, motivo: 'nessun dispositivo iscritto' }); }

    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
    const payload = JSON.stringify({ title: record.title, body: record.body || '', tag: record.id || record.type, url: '/' });
    const res = await Promise.allSettled(subs.map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high' })));

    const dettagli = res.map((r, i) => r.status === 'fulfilled'
      ? { ok: true, stato: r.value.statusCode, servizio: new URL(subs[i].endpoint).host }
      : { ok: false, stato: (r.reason as { statusCode?: number })?.statusCode, errore: String((r.reason as { body?: string })?.body || (r.reason as Error)?.message || r.reason).slice(0, 200), servizio: new URL(subs[i].endpoint).host });
    console.log(JSON.stringify(dettagli));

    // dispositivi che non esistono più (app disinstallata, permesso revocato): li togliamo
    const dead = subs.filter((_, i) => [404, 410].includes(dettagli[i].stato ?? 0)).map(s => s.id);
    if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
    return json({ inviate: dettagli.filter(d => d.ok).length, rimosse: dead.length, dettagli });
  } catch (e) { console.log('errore:', String(e)); return json({ errore: String(e) }, 500); }
});
