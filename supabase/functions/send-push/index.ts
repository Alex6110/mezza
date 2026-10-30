// Edge Function: invia la notifica push quando viene inserita una riga in "notifications" (chiamata da un Database Webhook).
// Segreti: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (es. mailto:tuaemail@gmail.com)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async req => {
  const url = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // La chiave "anon" è pubblica: accetto solo chiamate con la chiave di servizio (la manda il Database Webhook).
  if (req.headers.get('Authorization') !== `Bearer ${key}`) return new Response('forbidden', { status: 403 });
  try {
    const { record } = await req.json();
    if (!record?.user_id) return new Response('nessun record');
    const admin = createClient(url, key);
    const { data: subs } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', record.user_id);
    if (!subs?.length) return new Response('nessun dispositivo iscritto');

    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
    const payload = JSON.stringify({ title: record.title, body: record.body || '', tag: record.type, url: '/' });
    const res = await Promise.allSettled(subs.map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 })));

    // dispositivi che non esistono più (app disinstallata, permesso revocato): li togliamo
    const dead = subs.filter((_, i) => { const r = res[i]; return r.status === 'rejected' && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0); }).map(s => s.id);
    if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
    return new Response(JSON.stringify({ inviate: res.filter(r => r.status === 'fulfilled').length, rimosse: dead.length }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(String(e), { status: 500 }); }
});
