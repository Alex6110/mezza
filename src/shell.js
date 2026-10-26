// Guscio dell'app: intestazione, menu laterale, notifiche, barra in basso e Home.
import { supabase } from './supabase.js';
import { loadLedger } from './ledger.js';
import { APP_NAME } from './config.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = c => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(c / 100);
const ic = p => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const I = {
  home: ic('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  users: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6M17 5a3.5 3.5 0 0 1 0 6.5M22 20c0-3-1.5-5-4-5.7"/>'),
  list: ic('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  bell: ic('<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  up: ic('<path d="M7 17L17 7M9 7h8v8"/>'),
  down: ic('<path d="M17 7L7 17M15 17H7V9"/>'),
};
const TABS = [['contacts', 'Contatti', I.users], ['home', 'Home', I.home], ['consult', 'Consultazioni', I.list]];

export function mountShell(app, user, { applyTheme, getTheme, logout }) {
  const name = user.user_metadata?.name || user.email.split('@')[0];
  let tab = 'home', data = null, failed = false;

  app.innerHTML = `<div class="shell" id="shell">
    <header class="top"><button class="badge" data-a="menu" aria-label="Menu">${esc(name[0].toUpperCase())}</button>
      <b class="appname">${APP_NAME}</b><button class="bell" data-a="notif" aria-label="Notifiche">${I.bell}<span class="dot" id="dot" hidden></span></button></header>
    <main id="page"></main>
    <nav class="dock" id="dock"></nav>
    <div class="scrim" data-a="close"></div>
    <aside class="drawer" id="drawer"></aside>
    <section class="sheet" id="sheet"></section></div>`;
  const $ = s => app.querySelector(s), shell = $('#shell');

  const row = x => `<div class="row"><span class="ico">${x.delta > 0 ? I.down : x.delta < 0 ? I.up : I.list}</span>
    <span class="grow"><b>${esc(x.title)}</b><br><span class="sub">${new Date(x.spent_on).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · ${eur(x.amount_cents)}</span></span>
    ${x.delta ? `<b class="${x.delta > 0 ? 'pos' : 'neg'}">${x.delta > 0 ? '+' : '−'}${eur(Math.abs(x.delta))}</b>` : '<span class="sub">Non coinvolto</span>'}</div>`;

  const pages = {
    home: () => failed ? '<p class="empty">Impossibile caricare i dati. Controlla di aver eseguito lo script SQL.</p>'
      : !data ? '<p class="empty">Caricamento…</p>'
      : `<section class="hero"><div><span>Ti devono</span><strong class="pos-l">${eur(data.owed)}</strong></div>
          <div><span>Devi dare</span><strong class="neg-l">${eur(data.owe)}</strong></div>
          <p class="net">Saldo netto <b>${data.owed - data.owe < 0 ? '−' : ''}${eur(Math.abs(data.owed - data.owe))}</b></p></section>
        <h2>Spese recenti</h2>${data.recent.length ? `<div class="card">${data.recent.map(row).join('')}</div>` : '<p class="empty">Ancora nessuna spesa condivisa.</p>'}`,
    contacts: () => '<p class="empty">Contatti, preferiti e nuova spesa arrivano nella prossima fase.</p>',
    consult: () => '<p class="empty">Le consultazioni per persona arrivano nella prossima fase.</p>',
  };

  const drawer = () => { const t = getTheme(); return `<button class="x" data-a="close" aria-label="Chiudi">${I.x}</button>
    <div class="avatar big">${esc(name[0].toUpperCase())}</div><h2>${esc(name)}</h2><p class="sub">${esc(user.email)}</p>
    <h3>Aspetto</h3><div class="seg">${[['system', 'Sistema'], ['light', 'Chiaro'], ['dark', 'Scuro']]
      .map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-theme-set="${k}">${l}</button>`).join('')}</div>
    <button class="btn danger-t" data-a="out">Esci</button><p class="sub ver">${APP_NAME} · fase 2</p>`; };

  const sheet = () => `<div class="grab"></div><div class="sheet-h"><h2>Notifiche</h2>
    ${data?.notifs.some(n => !n.read_at) ? '<button class="link" data-a="readall">Segna come lette</button>' : ''}</div>
    ${data?.notifs.length ? data.notifs.map(n => `<div class="row"><span class="grow"><b>${esc(n.title)}</b>${n.body ? `<br><span class="sub">${esc(n.body)}</span>` : ''}</span>
      ${n.read_at ? '' : '<span class="dot s"></span>'}</div>`).join('') : '<p class="empty">Nessuna notifica.</p>'}`;

  const paint = () => {
    $('#page').innerHTML = pages[tab]();
    $('#dock').innerHTML = TABS.map(([k, l, i]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${i}${l}</button>`).join('');
    $('#drawer').innerHTML = drawer(); $('#sheet').innerHTML = sheet();
    $('#dot').hidden = !data?.notifs.some(n => !n.read_at);
  };

  app.onclick = async e => {
    const t = e.target.closest('[data-a],[data-tab],[data-theme-set]');
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; paint(); scrollTo(0, 0); }
    else if (t.dataset.themeSet) { applyTheme(t.dataset.themeSet); paint(); }
    else {
      const a = t.dataset.a;
      if (a === 'menu') { shell.classList.remove('notif'); shell.classList.add('menu'); }
      else if (a === 'notif') { shell.classList.remove('menu'); shell.classList.add('notif'); }
      else if (a === 'close') shell.classList.remove('menu', 'notif');
      else if (a === 'out') logout();
      else if (a === 'readall') {
        await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
        data.notifs.forEach(n => (n.read_at ||= 'x')); paint();
      }
    }
  };

  paint();
  loadLedger(user.id).then(d => { data = d; paint(); }).catch(() => { failed = true; paint(); });
}
