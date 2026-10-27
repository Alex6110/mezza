// Edge Function: manda l'email di invito a chi non ha ancora un account Mezza.
// Segreti richiesti (Edge Functions > Secrets): SMTP_USER, SMTP_PASS (password per le app di Gmail).
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.14';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { request_id, app_url } = await req.json();
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user } } = await caller.auth.getUser();
    const { data: r } = await caller.from('link_requests').select('id,to_email,status,emailed_at,from_user').eq('id', request_id).single();
    if (!user || !r || r.from_user !== user.id) return json({ sent: false, reason: 'forbidden' }, 403);
    if (r.status !== 'pending' || r.emailed_at) return json({ sent: false, reason: 'already' });

    const { data: has } = await admin.from('profiles').select('id').eq('email', r.to_email.toLowerCase()).maybeSingle();
    if (has) return json({ sent: false, reason: 'has_account' });          // lo avvisa già la notifica in app

    const { data: me } = await admin.from('profiles').select('display_name').eq('id', r.from_user).single();
    const who = me?.display_name || 'Un amico', link = String(app_url || '').startsWith('https://') ? app_url : 'https://mezza-app.netlify.app';
    const SU = Deno.env.get('SMTP_USER'), SP = (Deno.env.get('SMTP_PASS') || '').replace(/\s/g, '');
    if (!SU || !SP) return json({ sent: false, error: 'Mancano i segreti SMTP_USER o SMTP_PASS' });
    const tx = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SU, pass: SP }, connectionTimeout: 15000 });
    await tx.sendMail({
      from: `Mezza <${Deno.env.get('SMTP_USER')}>`, to: r.to_email, subject: `${who} ti invita su Mezza`,
      text: `${who} ti ha invitato su Mezza, l'app per dividere le spese.\n\nRegistrati con questa email (${r.to_email}) e accetta l'invito:\n${link}\n`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px"><h2 style="color:#0b7f73">Mezza</h2>
        <p><b>${esc(who)}</b> ti ha invitato a dividere le spese su Mezza.</p>
        <p>Registrati con questa email (<b>${esc(r.to_email)}</b>) e accetta l'invito.</p>
        <p><a href="${link}" style="display:inline-block;background:#0b7f73;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none">Apri Mezza</a></p></div>`,
    });
    await admin.from('link_requests').update({ emailed_at: new Date().toISOString() }).eq('id', r.id);
    return json({ sent: true });
  } catch (e) { console.error('send-invite', e); return json({ sent: false, error: String((e as Error)?.message || e) }); }   // 200 così l'app può leggere il motivo
});
