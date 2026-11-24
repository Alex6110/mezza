import './style.css';
import { supabase } from './supabase.js';
import { APP_NAME } from './config.js';
import { mountShell } from './shell.js';
import { applyAccent } from './accent.js';

// Il browser (Chrome/Android) avvisa quando l'app è installabile: conserviamo l'evento per il pulsante "Installa".
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__mezzaInstall = e; window.dispatchEvent(new Event('mezza-install-ready')); });
window.addEventListener('appinstalled', () => { window.__mezzaInstall = null; });

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const logo = `<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#0b7f73"/><circle cx="256" cy="256" r="130" fill="none" stroke="#fff" stroke-width="28"/><path d="M256 126a130 130 0 0 1 0 260z" fill="#fff"/></svg>`;

// ---------- Tema: Sistema / Chiaro / Scuro ----------
const getTheme = () => localStorage.getItem('mezza-theme') || 'system';
function applyTheme(t) {
  t === 'system' ? document.documentElement.removeAttribute('data-theme') : (document.documentElement.dataset.theme = t);
  localStorage.setItem('mezza-theme', t);
}
applyTheme(getTheme());
applyAccent();

// ---------- Stato ----------
let mode = 'login';        // login | signup | forgot | sent | recovery
let user = null;

const ERRORS = [
  ['Invalid login credentials', 'Email o password non corretti.'],
  ['Email not confirmed', 'Conferma prima il tuo indirizzo email dal link che ti abbiamo inviato.'],
  ['User already registered', 'Esiste già un account con questa email.'],
  ['Password should be at least', 'La password deve avere almeno 8 caratteri.'],
  ['rate limit', 'Troppi tentativi. Riprova tra qualche minuto.'],
];
const tr = m => ERRORS.find(([k]) => m.includes(k))?.[1] || 'Qualcosa è andato storto. Riprova.';
const msg = (t, type = 'err') => { const m = app.querySelector('#msg'); if (m) { m.textContent = t; m.className = 'msg ' + type; } };

// ---------- Viste ----------
const field = (label, name, type, extra = '') => `<label>${label}<input name="${name}" type="${type}" required ${extra}></label>`;
const head = sub => `<div class="brand">${logo}<b>${APP_NAME}</b></div><p class="lead">${sub}</p>`;

function authView() {
  if (mode === 'sent') return `${head('Controlla la posta')}<div class="stack"><p>Ti abbiamo inviato una email: apri il link per continuare.</p>
    <button class="btn" data-mode="login">Torna all'accesso</button></div>`;
  if (mode === 'forgot') return `${head('Recupera la password')}<form data-form="forgot">${field('Email', 'email', 'email', 'autocomplete="email"')}
    <p class="msg" id="msg"></p><button class="btn primary">Invia il link</button><button type="button" class="link" data-mode="login">Annulla</button></form>`;
  if (mode === 'recovery') return `${head('Scegli una nuova password')}<form data-form="recovery">${field('Nuova password', 'password', 'password', 'minlength="8" autocomplete="new-password"')}
    <p class="msg" id="msg"></p><button class="btn primary">Salva password</button></form>`;
  const signup = mode === 'signup';
  return `${head('Dividi le spese, senza pensieri.')}
    <div class="seg" role="tablist"><button class="${signup ? '' : 'on'}" data-mode="login">Accedi</button><button class="${signup ? 'on' : ''}" data-mode="signup">Registrati</button></div>
    <form data-form="${mode}">
      ${signup ? field('Nome', 'name', 'text', 'maxlength="40" autocomplete="name"') : ''}
      ${field('Email', 'email', 'email', 'autocomplete="email"')}
      ${field('Password', 'password', 'password', `minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"`)}
      <p class="msg" id="msg"></p>
      <button class="btn primary">${signup ? 'Crea account' : 'Accedi'}</button>
      ${signup ? '<p class="legal">Registrandoti accetti l’<a href="/privacy.html" target="_blank" rel="noopener">informativa privacy</a>.</p>' : ''}
      ${signup ? '' : '<button type="button" class="link" data-mode="forgot">Password dimenticata?</button>'}
    </form>`;
}

function homeView() {
  const name = user.user_metadata?.name || user.email.split('@')[0], t = getTheme();
  return `${head('Accesso effettuato')}<div class="stack">
    <div><div class="avatar">${esc(name[0].toUpperCase())}</div><h2>Ciao, ${esc(name)}</h2><p class="lead">${esc(user.email)}</p></div>
    <div><label>Aspetto</label><div class="seg">${[['system', 'Sistema'], ['light', 'Chiaro'], ['dark', 'Scuro']]
      .map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-theme="${k}">${l}</button>`).join('')}</div></div>
    <button class="btn" data-logout>Esci</button></div>`;
}

// Modalità offline: ricordiamo l'utente per poter aprire l'app senza rete (i dati arrivano dall'ultima copia salvata)
const OFF_KEY = 'mezza-offline-user';
const readOffline = () => { try { return JSON.parse(localStorage.getItem(OFF_KEY)); } catch { return null; } };
const clearOffline = () => { Object.keys(localStorage).filter(k => k.startsWith('mezza-snap-') || k === OFF_KEY).forEach(k => localStorage.removeItem(k)); };

const render = () => {
  if (user && !user.offline) { try { localStorage.setItem(OFF_KEY, JSON.stringify({ id: user.id, email: user.email, user_metadata: { name: user.user_metadata?.name } })); } catch { /* ignora */ } }
  if (user && mode !== 'recovery') return mountShell(app, user, { applyTheme, getTheme, logout: () => { clearOffline(); return supabase.auth.signOut(); } });
  app.onclick = null;
  app.innerHTML = `<div class="wrap"><section class="panel">${authView()}</section></div>`;
};

// ---------- Eventi ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-mode],[data-logout]');   // niente [data-theme]: l'attributo è anche su <html> quando scegli Chiaro/Scuro
  if (!t) return;
  if (t.dataset.mode) { mode = t.dataset.mode; render(); }
  else { await supabase.auth.signOut(); mode = 'login'; }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, kind = form.dataset.form, f = Object.fromEntries(new FormData(form)), btn = form.querySelector('.primary');
  btn.disabled = true;
  try {
    if (kind === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
      if (error) throw error;
    } else if (kind === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password,
        options: { data: { name: f.name.trim() }, emailRedirectTo: location.origin } });
      if (error) throw error;
      if (!data.session) { mode = 'sent'; render(); }
    } else if (kind === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: location.origin });
      if (error) throw error;
      mode = 'sent'; render();
    } else if (kind === 'recovery') {
      const { error } = await supabase.auth.updateUser({ password: f.password });
      if (error) throw error;
      mode = 'login'; render();
    }
  } catch (err) { msg(tr(err.message || '')); }
  finally { btn.disabled = false; }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (!session && user?.offline && !navigator.onLine) return;   // senza rete restiamo in modalità offline
  if (event === 'SIGNED_OUT') clearOffline();
  if (event === 'PASSWORD_RECOVERY') mode = 'recovery';
  else if (mode !== 'recovery' && session?.user?.id === user?.id) { user = session?.user ?? null; return; } // rinnovo token: niente ridisegno
  user = session?.user ?? null;
  render();
});
render();
setTimeout(() => { if (!user && !navigator.onLine) { const u = readOffline(); if (u) { user = { ...u, offline: true }; render(); } } }, 1200);
addEventListener('online', () => { if (user?.offline) location.reload(); });

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
