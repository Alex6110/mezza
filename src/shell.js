// Guscio dell'app: intestazione, menu, notifiche, barra, Home, Contatti, Consultazioni e pagina persona.
import { supabase } from './supabase.js';
import { loadLedger } from './ledger.js';
import { APP_NAME, VAPID_PUBLIC_KEY } from './config.js';
import { personPdf, overviewPdf } from './pdf.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = c => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(c / 100);
const cents = v => Math.round(parseFloat(String(v).replace(',', '.')) * 100);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const hue = id => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const dshort = d => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const ic = p => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const I = {
  home: ic('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  users: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6M17 5a3.5 3.5 0 0 1 0 6.5M22 20c0-3-1.5-5-4-5.7"/>'),
  list: ic('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  bell: ic('<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'), back: ic('<path d="M15 5l-7 7 7 7"/>'),
  star: ic('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'), search: ic('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
  send: ic('<path d="M4 12l16-8-6 16-3-7z"/>'), check: ic('<path d="M5 12l5 5 9-10"/>'),
  clip: ic('<path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>'), mail: ic('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 8l9 6 9-6"/>'), repeat: ic('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'), trash: ic('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  edit: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'), pdf: ic('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 14h6M10 17h6"/>'), book: ic('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
};
const TABS = [['contacts', 'Contatti', I.users], ['home', 'Home', I.home], ['consult', 'Consultazioni', I.list]];
const FREQ = { weekly: 'ogni settimana', monthly: 'ogni mese', yearly: 'ogni anno' };
const METHODS = ['Contanti', 'Carta', 'Satispay', 'PayPal', 'Bonifico'];
const av = (id, n) => `<span class="avatar" style="background:hsl(${hue(id)} 45% 42%)">${esc((n || '?')[0].toUpperCase())}</span>`;
const sg = v => !v ? '<span class="sub">In pari</span>' : `<b class="${v > 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : '−'}${eur(Math.abs(v))}</b>`;
const chips = (nm, arr, sel) => `<div class="chips">${arr.map(([v, l]) => `<label class="chip"><input type="radio" name="${nm}" value="${v}" ${v === sel ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>`;
const seg = (attr, cur, arr) => `<div class="seg">${arr.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-${attr}="${k}">${l}</button>`).join('')}</div>`;

// Spese ancora aperte: i pagamenti compensano le voci più vecchie (FIFO).
function openItems(its) {
  const o = [];
  for (const it of [...its].sort((a, b) => (a.date + a.ts).localeCompare(b.date + b.ts))) {
    let v = it.v;
    while (v && o.length && Math.sign(o[0].rem) !== Math.sign(v)) {
      const t = Math.min(Math.abs(v), Math.abs(o[0].rem));
      o[0].rem += Math.sign(v) * t; v -= Math.sign(v) * t;
      if (!o[0].rem) o.shift();
    }
    if (v) o.push({ it, rem: v });
  }
  return o;
}

// Chiusura con gesto: trascina il pannello verso il bordo (dir: 'down' | 'left' | 'right').
let chan = null;   // canale in tempo reale (uno solo, anche se la schermata viene ricostruita)
const urlB64 = s => { const r = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
const swReady = () => !('serviceWorker' in navigator) ? Promise.resolve(null) : Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 2500))]);
async function pushState() {
  if (!VAPID_PUBLIC_KEY) return 'nokey';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone) return 'install';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await swReady(); if (!reg) return 'nosw';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}
// Riduce la foto prima del caricamento (JPEG, lato lungo 1400 px): circa 150-250 KB invece di diversi MB.
async function shrink(file, max = 1400, q = .72) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('img'))), 'image/jpeg', q));
}
const save = (txt, fn, type) => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([txt], { type })), download: fn }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const swipe = (el, dir, close) => {
  let x0, y0, d = 0, on = false;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; d = 0; on = false; }, { passive: true });
  el.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    const v = dir === 'down' ? dy : dir === 'left' ? -dx : dx, side = dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (!on) { if (v > 8 && v > side && (dir !== 'down' || el.scrollTop <= 0)) { on = true; el.style.transition = 'none'; } else return; }
    e.preventDefault(); d = Math.max(0, v);
    el.style.transform = dir === 'down' ? `translateY(${d}px)` : `translateX(${dir === 'left' ? -d : d}px)`;
  }, { passive: false });
  const end = () => { if (!on) return; on = false; el.style.transition = ''; el.style.transform = ''; if (d > 90) close(); };
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
};

export function mountShell(app, user, { applyTheme, getTheme, logout }) {
  let name = user.user_metadata?.name || user.email.split('@')[0];
  let tab = 'home', data = null, failed = false, q = '', flt = 'all', pk = null, psub = 'due', form = null, tt, fx = null, armed = '', busy = false, pref = { split: 'half' }, xstate = null, gk = null, cflt = 'all', ghostAnim = null, pstate = 'check';

  app.innerHTML = `<div class="shell" id="shell">
    <header class="top"><button class="badge" data-a="menu" aria-label="Menu">${esc(name[0].toUpperCase())}</button>
      <b class="appname">${APP_NAME}</b><button class="bell" data-a="notif" aria-label="Notifiche">${I.bell}<span class="dot" id="dot" hidden></span></button></header>
    <main id="page"></main><div class="minibar" id="minibar"></div><div class="ghost" id="ghost"></div><div class="lightbox" id="lightbox" data-a="lbclose"></div><nav class="dock" id="dock"></nav>
    <section class="page" id="person"></section>
    <div class="scrim" data-a="close"></div><aside class="drawer" id="drawer"></aside>
    <section class="sheet" id="sheet"></section><section class="sheet" id="fsheet"></section><div class="toast" id="toast"></div></div>`;
  const $ = s => app.querySelector(s), shell = $('#shell');
  const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 2600); };
  const C = () => data?.contacts || [], bal = id => data?.bal[id] || 0, cname = id => C().find(c => c.id === id)?.name || '?';
  const eff = id => bal(id) + (data?.pend || []).filter(p => p.key === id).reduce((s, p) => s + p.v, 0);   // saldo al netto dei saldi in attesa
  const gone = c => !!c?.account_deleted && !data.reg.has(c.id);   // account Mezza eliminato
  const match = c => norm(c.name).includes(norm(q));

  const contactRow = c => `<div class="row tap" data-person="${c.id}">${av(c.id, c.name)}<span class="grow"><b>${esc(c.name)}</b><br><span class="sub ${gone(c) ? 'neg' : ''}">${gone(c) ? 'Account Mezza eliminato' : esc(c.phone || c.email || 'Nessun recapito')}</span></span>
    <button class="star ${c.favorite ? 'on' : ''}" data-a="fav" data-id="${c.id}" aria-label="Preferito">${I.star}</button></div>`;
  const consRow = c => `<div class="row tap" data-person="${c.id}">${av(c.id, c.name)}<span class="grow"><b>${esc(c.name)}</b><br>
    <span class="sub">${bal(c.id) > 0 ? 'ti deve' : bal(c.id) < 0 ? 'devi dare' : 'tutto saldato'}</span></span>${sg(bal(c.id))}</div>`;
  const group = (h, arr, fn) => arr.length ? `<h2>${h}</h2><div class="card">${arr.map(fn).join('')}</div>` : '';

  const listHTML = () => {
    if (!data) return '<p class="empty">Caricamento…</p>';
    if (tab === 'contacts' && flt === 'groups') {
      const gs = data.groups.filter(g => norm(g.name).includes(norm(q)));
      return gs.length ? `<h2>Gruppi</h2><div class="card">${gs.map(groupRow).join('')}</div>` : '<p class="empty">Nessun gruppo. Creane uno con il pulsante +.</p>';
    }
    if (tab === 'contacts') {
      const l = C().filter(c => match(c) && (flt === 'all' || (flt === 'tel' ? c.phone : c.email)));
      const fav = !q && flt === 'all' ? C().filter(c => c.favorite) : [];
      return (fav.length ? `<h2>Preferiti</h2><div class="favs">${fav.map(c => `<button class="fav" data-person="${c.id}">${av(c.id, c.name)}<span>${esc(c.name.split(' ')[0])}</span></button>`).join('')}</div>` : '')
        + (l.length ? `<h2>Contatti</h2><div class="card">${l.map(contactRow).join('')}</div>` : '<p class="empty">Nessun contatto. Aggiungine uno con il pulsante +.</p>');
    }
    const p = C().filter(c => (data.items[c.id] || []).length && match(c) && (cflt === 'all' || (cflt === 'in' ? bal(c.id) > 0 : cflt === 'out' ? bal(c.id) < 0 : !bal(c.id))));
    return !p.length ? '<p class="empty">Nessuna spesa condivisa. Apri un contatto e tocca Nuova spesa.</p>'
      : group('Da saldare', p.filter(c => bal(c.id)).sort((a, b) => Math.abs(bal(b.id)) - Math.abs(bal(a.id))), consRow) + group('In pari', p.filter(c => !bal(c.id)), consRow);
  };
  const searchBar = extra => `<div class="bar"><label class="search">${I.search}<input id="q" placeholder="Cerca per nome" value="${esc(q)}" autocomplete="off"></label>${extra}</div>`;

  const row = x => `<div class="row"><span class="ico">${I.list}</span><span class="grow"><b>${esc(x.title)}</b><br><span class="sub">${dshort(x.spent_on)} · ${eur(x.amount_cents)}</span></span>
    ${x.delta ? `<b class="${x.delta > 0 ? 'pos' : 'neg'}">${x.delta > 0 ? '+' : '−'}${eur(Math.abs(x.delta))}</b>` : '<span class="sub">Non coinvolto</span>'}</div>`;
  const pages = {
    home: () => failed ? '<p class="empty">Impossibile caricare i dati. Controlla di aver eseguito gli script SQL.</p>' : !data ? '<p class="empty">Caricamento…</p>'
      : `${invitesHTML()}<section class="hero" id="hero"><div><span>Ti devono</span><strong>${eur(data.owed)}</strong></div><div><span>Devi dare</span><strong>${eur(data.owe)}</strong></div>
        <p class="net">Saldo netto <b>${data.owed - data.owe < 0 ? '−' : ''}${eur(Math.abs(data.owed - data.owe))}</b></p></section>
        <div class="acts" id="homeacts"><button class="btn primary" data-a="newx">${I.plus}Nuova spesa</button></div><h2>Spese recenti</h2>${data.recent.length ? `<div class="card">${data.recent.map(row).join('')}</div>` : '<p class="empty">Ancora nessuna spesa condivisa.</p>'}`,
    contacts: () => '<div class="tools">' + searchBar(`${'contacts' in navigator && 'ContactsManager' in window ? `<button class="btn sq" data-a="pick" aria-label="Dalla rubrica">${I.book}</button>` : ''}<button class="btn primary sq" data-a="${flt === 'groups' ? 'addg' : 'addc'}" aria-label="Nuovo">${I.plus}</button>`)
      + seg('flt', flt, [['all', 'Tutti'], ['tel', 'Telefono'], ['mail', 'Email'], ['groups', 'Gruppi']]) + '</div>' + `<div id="list">${listHTML()}</div>`,
    consult: () => '<div class="tools">' + searchBar(`<button class="btn sq" data-a="opdf" aria-label="Riepilogo PDF">${I.pdf}</button>`) + seg('cflt', cflt, [['all', 'Tutte'], ['in', 'Ti devono'], ['out', 'Devi dare'], ['ok', 'In pari']]) + '</div>' + `<div id="list">${listHTML()}</div>`,
  };

  const invitesHTML = () => (data?.invites || []).map(i => `<div class="card inv"><div class="row"><span class="ico">${I.users}</span><span class="grow"><b>${esc(i.from_name || i.from_email)}</b><br><span class="sub">ti invita a condividere i conti</span></span></div>
    <div class="acts pad"><button class="btn primary" data-a="inv-y" data-id="${i.id}">Accetta</button><button class="btn" data-a="inv-n" data-id="${i.id}">Rifiuta</button></div></div>`).join('');
  const linkHTML = c => {
    if (c.linked_user_id) return `<p class="chipinfo">${I.check}Collegato: vedete le stesse spese</p>`;
    if (gone(c)) return `<p class="chipinfo warn">${I.x}Questo account Mezza è stato eliminato: non puoi più collegarlo né invitarlo. Lo storico resta qui.</p>`;
    const reg = data.reg.has(c.id);
    if (data.sent.has(c.id)) return `<p class="chipinfo">${I.send}${reg ? 'Richiesta di collegamento inviata: la vede in Mezza.' : `Invito inviato. Compare quando ${esc(c.name.split(' ')[0])} accede con ${esc(c.email || 'la sua email')}.`}</p>`
      + (!reg && c.email ? '<button class="btn link-b" data-a="resend">Reinvia l’email</button>' : '');
    if (reg) return `<button class="btn link-b" data-a="invite">${I.users}Collega l’account Mezza</button>`;
    return `<button class="btn link-b" data-a="${c.email ? 'invite' : 'editc'}">${I.users}${c.email ? 'Invita su Mezza' : 'Aggiungi l’email per invitare'}</button>`;
  };
  const pendHTML = () => data.pend.filter(p => p.key === pk).map(p => p.own ? `<p class="chipinfo">Saldo di ${eur(p.amount)} in attesa di conferma.</p>`
    : `<div class="card inv"><div class="row"><span class="grow"><b>Saldo da confermare</b><br><span class="sub">${p.dir === 'paid' ? 'Dice di averti dato' : 'Dice di aver ricevuto da te'} ${eur(p.amount)}</span></span></div>
      <div class="acts pad"><button class="btn primary" data-a="set-y" data-id="${p.id}">Conferma</button><button class="btn" data-a="set-n" data-id="${p.id}">Rifiuta</button></div></div>`).join('');
  const gnet = g => data.exps.filter(x => x.groupId === g.id).reduce((s, x) => s + x.delta, 0);
  const groupRow = g => `<div class="row tap" data-group="${g.id}">${av(g.id, g.name)}<span class="grow"><b>${esc(g.name)}</b><br><span class="sub">${g.group_members.length + 1 === 1 ? '1 persona' : (g.group_members.length + 1) + ' persone'}</span></span>${sg(gnet(g))}</div>`;
  const groupHTML = () => {
    const g = data.groups.find(x => x.id === gk); if (!g) return '';
    const mem = g.group_members.map(m => C().find(c => c.id === m.contact_id)).filter(Boolean), net = gnet(g);
    const ex = data.exps.filter(x => x.groupId === gk).sort((a, b) => (b.date + b.ts).localeCompare(a.date + a.ts));
    const quota = id => ex.reduce((s, x) => s + (x.shares.find(h => (h.contact_id ?? 'me') === id)?.amount_cents || 0), 0);
    const who = id => id === 'me' ? 'Io' : cname(id), total = ex.reduce((s, x) => s + x.total, 0);
    return `<div class="ptop"><button class="back" data-a="back" aria-label="Indietro">${I.back}</button>${av(g.id, g.name)}<b class="grow">${esc(g.name)}</b><button class="back" data-a="editg" aria-label="Modifica gruppo">${I.edit}</button></div>
      <section class="hero p"><span>${net > 0 ? 'Nel gruppo ti devono' : net < 0 ? 'Nel gruppo devi dare' : 'Gruppo in pari'}</span><strong>${eur(Math.abs(net))}</strong><p class="net">Spesa totale del gruppo <b>${eur(total)}</b></p></section>
      <div class="acts"><button class="btn primary" data-a="newg">${I.plus}Nuova spesa</button></div>
      <h2>Persone e quote</h2><div class="card"><div class="row">${av('me', name)}<span class="grow"><b>Io</b><br><span class="sub">quota totale ${eur(quota('me'))}</span></span></div>
        ${mem.map(c => `<div class="row tap" data-person="${c.id}">${av(c.id, c.name)}<span class="grow"><b>${esc(c.name)}</b><br><span class="sub">quota totale ${eur(quota(c.id))}</span></span>${sg((data.items[c.id] || []).filter(i => i.kind === 'e' && i.groupId === gk).reduce((s, i) => s + i.v, 0))}</div>`).join('')}</div>
      <h2>Spese del gruppo</h2>${ex.length ? ex.map(x => `<div class="card xc"><div class="row tap" data-item="e:${x.id}"><span class="ico">${I.list}</span><span class="grow"><b>${esc(x.title)}</b><br><span class="sub">${dshort(x.date)} · ${eur(x.total)}</span></span>${x.receipt ? clip(x.receipt) : ''}${I.edit}</div>
        <div class="parts">${x.shares.map(h => { const id = h.contact_id ?? 'me'; return `<div class="part"><span>${esc(who(id))}${id === (x.payerC ?? 'me') ? ' · ha pagato' : ''}</span><b>${eur(h.amount_cents)}</b></div>`; }).join('')}</div></div>`).join('') : '<p class="empty">Ancora nessuna spesa nel gruppo.</p>'}`;
  };
  const clip = p => `<button class="star" data-a="rview" data-path="${esc(p)}" aria-label="Vedi scontrino">${I.clip}</button>`;
  const rbox = x => {
    const has = !!x.rurl || (x.rpath && !x.rdel);
    return `<div class="rbox"><label class="btn rbtn">${I.clip}${has ? 'Cambia scontrino' : 'Aggiungi scontrino'}<input id="rcpt" name="rcpt" type="file" accept="image/*" hidden></label>
      ${x.rurl ? '<button type="button" class="btn danger-t" data-a="rdel">Rimuovi</button>' : x.rpath && !x.rdel ? `<button type="button" class="btn" data-a="rview" data-path="${esc(x.rpath)}">Vedi</button><button type="button" class="btn danger-t" data-a="rdel">Rimuovi</button>` : ''}
      ${x.rurl ? `<img class="rimg" src="${x.rurl}" alt="Anteprima scontrino">` : ''}</div>`;
  };
  const itemRow = ({ it, rem }, cn) => {
    const v = rem ?? it.v, e = it.kind === 'e';
    return `<div class="row ${it.own ? 'tap' : ''}" ${it.own ? `data-item="${it.kind}:${it.id}"` : ''}><span class="ico">${e ? I.list : I.check}</span><span class="grow"><b>${e ? esc(it.title) : v > 0 ? 'Hai dato un saldo' : 'Hai ricevuto un saldo'}</b><br>
      <span class="sub">${e ? `${it.iPaid ? 'Pagato da te' : 'Pagato da ' + esc(cn)} · ${eur(it.total)}` : esc(it.method || 'Saldo')} · ${dshort(it.date)}</span></span>${e && it.receipt ? clip(it.receipt) : ''}${sg(v)}</div>`;
  };
  const personHTML = () => {
    const c = C().find(x => x.id === pk); if (!c) return '';
    const b = bal(pk), its = data.items[pk] || [];
    let body;
    if (psub === 'due') body = b ? `<div class="card">${openItems(its).map(o => itemRow(o, c.name)).join('')}</div>` : '<p class="empty">Tutto in pari.</p>';
    else {
      const s = [...its].sort((a, b) => (b.date + b.ts).localeCompare(a.date + a.ts)); let m = '';
      body = s.length ? s.map(it => {
        const k = new Date(it.date).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        const h = k !== m ? `${m ? '</div>' : ''}<h2>${k}</h2><div class="card">` : ''; m = k; return h + itemRow({ it }, c.name);
      }).join('') + '</div>' : '<p class="empty">Nessuna spesa condivisa.</p>';
    }
    return `<div class="ptop"><button class="back" data-a="back" aria-label="Indietro">${I.back}</button>${av(c.id, c.name)}<b class="grow">${esc(c.name)}</b><button class="back" data-a="pdf" aria-label="PDF">${I.pdf}</button><button class="back" data-a="editc" aria-label="Modifica contatto">${I.edit}</button></div>
      <section class="hero p"><span>${b > 0 ? 'Ti deve' : b < 0 ? 'Devi dare' : 'Siete in pari'}</span><strong>${eur(Math.abs(b))}</strong></section>
      ${linkHTML(c)}${pendHTML()}<div class="acts"><button class="btn primary" data-a="newx">${I.plus}Nuova spesa</button>${eff(pk) ? `<button class="btn" data-a="settle">${I.check}Salda</button>` : ''}${b > 0 ? `<button class="btn" data-a="remind">${I.send}Sollecita</button>` : ''}</div>
      ${seg('psub', psub, [['due', 'Da saldare'], ['hist', 'Storico']])}${body}`;
  };

  const drawer = () => { const t = getTheme(); return `<div class="dhead"><span class="avatar dav">${esc(name[0].toUpperCase())}</span>
      <div class="who"><b>${esc(name)}</b><span class="mail">${I.mail}<i>${esc(user.email)}</i></span></div><button class="dx" data-a="close" aria-label="Chiudi">${I.x}</button></div>
    <div class="dbody"><h3>Aspetto</h3>${seg('theme-set', t, [['system', 'Sistema'], ['light', 'Chiaro'], ['dark', 'Scuro']])}
      <h3>Impostazioni</h3><div class="card">${[['prof', 'Profilo', I.users], ['prefs', 'Preferenze', I.list], ['rec', 'Spese ricorrenti', I.repeat], ['push', 'Notifiche push', I.bell], ['pwd', 'Password', I.edit], ['mail', 'Email', I.send], ['data', 'Dati e account', I.pdf]]
        .map(([k, l, i]) => `<button class="row" data-a="set:${k}">${i}<span class="grow">${l}</span></button>`).join('')}</div>
      <a class="sub plink" href="/privacy.html" target="_blank" rel="noopener">Informativa privacy</a><button class="btn danger-t" data-a="out">Esci</button><p class="sub ver">${APP_NAME} · v0.9</p></div>`; };
  const sheet = () => `<div class="grab"></div><div class="sheet-h"><h2>Notifiche</h2>${data?.notifs.some(n => !n.read_at) ? '<button class="link" data-a="readall">Segna come lette</button>' : ''}</div>
    ${data?.notifs.length ? data.notifs.map(n => `<div class="row tap" data-nid="${n.id}"><span class="grow"><b>${esc(n.title)}</b>${n.body ? `<br><span class="sub">${esc(n.body)}</span>` : ''}</span>${n.read_at ? '' : '<span class="dot s"></span>'}</div>`).join('') : '<p class="empty">Nessuna notifica.</p>'}`;

  // ----- Spesa tra più persone -----
  const newX = ps => ({ title: '', amount: '', date: today(), ps, paid: 'me', mode: pref.split === 'all' ? 'others' : 'equal', custom: {}, rep: 'none' });
  const calcShares = x => {
    const total = cents(x.amount) || 0, ids = ['me', ...x.ps]; let amts;
    if (x.mode === 'custom') amts = ids.map(id => cents(x.custom[id] || '0') || 0);
    else {
      const rec = x.mode === 'others' ? ids.filter(id => id !== x.paid) : ids, base = Math.floor(total / rec.length), rem = total - base * rec.length;
      amts = ids.map(id => rec.includes(id) ? base + (rec.indexOf(id) < rem ? 1 : 0) : 0);
    }
    return ids.map((id, i) => ({ contact_id: id === 'me' ? null : id, amount_cents: amts[i] }));
  };
  const readX = el => {
    const fd = new FormData(el), custom = {};
    for (const [k, v] of fd) if (k.startsWith('c_')) custom[k.slice(2)] = v;
    const ps = fd.getAll('p');
    xstate = { ...xstate, title: fd.get('title') ?? xstate.title, amount: fd.get('amount') ?? xstate.amount, date: fd.get('date') || xstate.date,
      ps, rep: fd.get('rep') || xstate.rep || 'none', paid: fd.get('paid') || 'me', mode: fd.get('mode') || xstate.mode, custom: { ...xstate.custom, ...custom } };
    if (xstate.paid !== 'me' && !ps.includes(xstate.paid)) xstate.paid = 'me';
  };
  const nmX = id => id === 'me' ? 'Io' : cname(id);
  const sumHTML = () => {
    const total = cents(xstate.amount) || 0; if (!total || !xstate.ps.length) return '';
    const sh = calcShares(xstate), sum = sh.reduce((a, b) => a + b.amount_cents, 0);
    return sh.map(a => `${esc(nmX(a.contact_id ?? 'me'))} ${eur(a.amount_cents)}`).join(' · ') + (sum !== total ? ` — assegnato ${eur(sum)} su ${eur(total)}` : '');
  };
  const xFormHTML = () => {
    const x = xstate, ids = ['me', ...x.ps], edit = form === 'editx';
    return `<div class="grab"></div><form data-f="${form}"><h2>${edit ? 'Modifica spesa' : 'Nuova spesa'}</h2>
      <input name="title" placeholder="Descrizione" required maxlength="80" value="${esc(x.title)}">
      <div class="two"><input name="amount" inputmode="decimal" placeholder="Importo" required value="${esc(x.amount)}"><input name="date" type="date" value="${x.date}" required></div>
      <label>Con chi<div class="chips">${C().map(c => `<label class="chip"><input type="checkbox" name="p" value="${c.id}" ${x.ps.includes(c.id) ? 'checked' : ''}>${esc(c.name)}</label>`).join('') || '<span class="sub">Aggiungi prima dei contatti.</span>'}</div></label>
      <label>Pagato da${chips('paid', ids.map(id => [id, nmX(id)]), x.paid)}</label>
      <label>Divisione${chips('mode', [['equal', 'Parti uguali'], ['others', 'Tutto agli altri'], ['custom', 'Personalizzata']], x.mode)}</label>
      ${x.mode === 'custom' ? ids.map(id => `<label>${esc(nmX(id))}<input name="c_${id}" inputmode="decimal" placeholder="0,00" value="${esc(x.custom[id] ?? '')}"></label>`).join('') : ''}
      ${edit ? '' : `<label>Ripeti${chips('rep', [['none', 'Mai'], ['weekly', 'Ogni settimana'], ['monthly', 'Ogni mese'], ['yearly', 'Ogni anno']], x.rep || 'none')}</label>`}
      ${rbox(x)}
      <p class="sub" id="xsum">${sumHTML()}</p><p class="msg" id="fmsg"></p><button class="btn primary">${edit ? 'Salva modifiche' : 'Salva spesa'}</button></form>
      ${edit ? '<button class="btn danger-t del" data-a="delx">Elimina spesa</button>' : ''}`;
  };

  const formHTML = () => {
    const f = (t, body, btn) => `<div class="grab"></div><form data-f="${form}"><h2>${t}</h2>${body}<p class="msg" id="fmsg"></p><button class="btn primary">${btn}</button></form>`, cn = esc(cname(pk));
    if (form === 'contact') return f('Nuovo contatto', '<input name="name" placeholder="Nome" required maxlength="60"><input name="email" type="email" placeholder="Email (facoltativa)"><input name="phone" type="tel" placeholder="Telefono (facoltativo)">', 'Aggiungi');
    if (form === 'prof') return f('Profilo', `<input name="name" value="${esc(name)}" required maxlength="40" placeholder="Nome visualizzato"><p class="sub">È il nome che vedono le persone collegate a te.</p>`, 'Salva');
    if (form === 'prefs') return f('Preferenze', `<label>Divisione predefinita delle nuove spese${chips('split', [['half', 'Parti uguali'], ['all', 'Tutto agli altri']], pref.split)}</label>`, 'Salva');
    if (form === 'pwd') return f('Cambia password', '<input name="password" type="password" minlength="8" placeholder="Nuova password (almeno 8 caratteri)" autocomplete="new-password" required>', 'Aggiorna password');
    if (form === 'mail') return f('Cambia email', '<p class="sub">Ti mandiamo un link di conferma. Finché non lo apri, l’email di accesso resta quella attuale.</p><input name="email" type="email" placeholder="Nuovo indirizzo" required>', 'Invia conferma');
    if (form === 'data') return `<div class="grab"></div><div class="dform"><h2>Dati e account</h2><button class="btn" data-a="exp-json">Esporta tutto (JSON)</button><button class="btn" data-a="exp-csv">Esporta spese (CSV)</button><button class="btn danger-t" data-a="set:del">Elimina account…</button></div>`;
    if (form === 'del') return f('Elimina account', '<p class="sub">Cancella per sempre i tuoi contatti, le tue spese e i tuoi saldi. Le spese create da altri restano a loro. Scrivi ELIMINA per confermare.</p><input name="word" placeholder="ELIMINA" required autocomplete="off">', 'Elimina definitivamente');
    if (form === 'group') {
      const g = gk ? data.groups.find(x => x.id === gk) : null, sel = new Set((g?.group_members || []).map(m => m.contact_id));
      return f(g ? 'Modifica gruppo' : 'Nuovo gruppo', `<input name="name" placeholder="Nome del gruppo" required maxlength="40" value="${esc(g?.name || '')}">
        <label>Persone nel gruppo<div class="chips">${C().map(c => `<label class="chip"><input type="checkbox" name="m" value="${c.id}" ${sel.has(c.id) ? 'checked' : ''}>${esc(c.name)}</label>`).join('') || '<span class="sub">Aggiungi prima dei contatti.</span>'}</div></label>`, g ? 'Salva gruppo' : 'Crea gruppo')
        + (g ? '<button class="btn danger-t del" data-a="delg">Elimina gruppo</button>' : '');
    }
    if (form === 'push') {
      const M = { check: 'Controllo…', nokey: 'Le notifiche push non sono ancora configurate su questo sito.', unsupported: 'Questo browser non supporta le notifiche push.',
        install: 'Su iPhone le notifiche funzionano solo con l’app installata: tocca Condividi, poi “Aggiungi alla schermata Home” e riaprila da lì.',
        denied: 'Le notifiche sono bloccate per questo sito: riattivale dalle impostazioni del telefono o del browser.', nosw: 'Disponibile solo nell’app pubblicata, non in modalità sviluppo.',
        on: 'Le notifiche push sono attive su questo dispositivo.', off: 'Ricevi un avviso quando ti condividono una spesa, ti chiedono un saldo o accettano un tuo invito.' };
      return `<div class="grab"></div><div class="dform"><h2>Notifiche push</h2><p class="sub">${M[pstate] || ''}</p>${pstate === 'off' ? '<button class="btn primary" data-a="push-on">Attiva su questo dispositivo</button>' : pstate === 'on' ? '<button class="btn danger-t" data-a="push-off">Disattiva su questo dispositivo</button>' : ''}</div>`;
    }
    if (form === 'rec') return `<div class="grab"></div><div class="dform"><h2>Spese ricorrenti</h2>${data.rec.length ? data.rec.map(r => `<div class="card"><div class="row"><span class="ico">${I.repeat}</span><span class="grow"><b>${esc(r.title)}</b><br><span class="sub">${eur(r.amount_cents)} · ${FREQ[r.frequency]} · ${r.active ? 'prossima il ' + dshort(r.next_due) : 'sospesa: controlla i partecipanti'}</span></span><button class="star" data-a="delrec" data-id="${r.id}" aria-label="Elimina ricorrenza">${I.trash}</button></div></div>`).join('') : '<p class="sub">Nessuna spesa ricorrente. Creane una da Nuova spesa, scegliendo Ripeti.</p>'}</div>`;
    if (form === 'editc') { const c = C().find(x => x.id === pk);
      return f('Modifica contatto', `<input name="name" value="${esc(c.name)}" required maxlength="60"><input name="email" type="email" placeholder="Email" value="${esc(c.email || '')}"><input name="phone" type="tel" placeholder="Telefono" value="${esc(c.phone || '')}">`, 'Salva')
        + '<button class="btn danger-t del" data-a="delc">Elimina contatto</button>'; }
    if (form === 'dels') return `<div class="grab"></div><div class="dform"><h2>Saldo del ${dshort(fx.date)}</h2><p class="sub">${esc(fx.method || 'Saldo')} · ${eur(Math.abs(fx.v))}</p><button class="btn danger-t" data-a="delx">Elimina saldo</button></div>`;
    if (form === 'expense' || form === 'editx') return xFormHTML();
    const b = eff(pk);
    return f(`Salda con ${cn}`, `<p class="sub">${b > 0 ? `Ti deve ${eur(b)}` : `Devi dare ${eur(-b)}`}</p><input name="amount" inputmode="decimal" value="${(Math.abs(b) / 100).toFixed(2).replace('.', ',')}" required>
      <label>Metodo${chips('method', METHODS.map(m => [m, m]), 'Contanti')}</label>`, 'Segna come saldato');
  };
  const openForm = t => { form = t; armed = ''; $('#fsheet').innerHTML = formHTML(); shell.classList.remove('menu', 'notif'); shell.classList.add('form'); };

  const closePerson = () => { if (pk && gk) { pk = null; paint(); return; } $('#person').classList.remove('open'); pk = null; gk = null; setTimeout(paint, 320); };
  // Riepilogo Home: quello grande scorre via; quando esce dalla vista ne compare uno compatto, fisso, con il + per la nuova spesa.
  const miniHTML = () => !data ? '' : `<div class="msum"><span>Ti devono <b>${eur(data.owed)}</b></span><span>Devi dare <b>${eur(data.owe)}</b></span></div><button class="plus" data-a="newx" aria-label="Nuova spesa">${I.plus}</button>`;
  const morph = (a, b, r0, r1) => {   // forma di sfondo che "vola" dalla scheda grande alla barra (e ritorno)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const g = $('#ghost'), f = r => ({ top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
    ghostAnim?.cancel();
    ghostAnim = g.animate([{ ...f(a), borderRadius: r0, opacity: 1 }, { ...f(b), borderRadius: r1, opacity: 1, offset: .78 }, { ...f(b), borderRadius: r1, opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.22,.8,.2,1)' });
  };
  const dockSummary = () => {   // soglia fissa in pixel: stesso comportamento su ogni schermo, nessuna modifica di layout durante lo scorrimento
    const mb = $('#minibar'), pg = $('#page'); if (!mb) return;
    if (tab !== 'home' || !data) { mb.classList.remove('show'); pg.classList.remove('docked'); return; }
    const on = mb.classList.contains('show'), h = $('#hero'), ms = mb.querySelector('.msum');
    if (!on && scrollY > 48) { if (h && ms) morph(h.getBoundingClientRect(), ms.getBoundingClientRect(), '28px', '18px'); mb.classList.add('show'); pg.classList.add('docked'); }
    else if (on && scrollY < 20) { if (h && ms) morph(ms.getBoundingClientRect(), h.getBoundingClientRect(), '18px', '28px'); mb.classList.remove('show'); pg.classList.remove('docked'); }
  };
  let raf = 0; window.onscroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(dockSummary); };
  const paint = () => {
    $('#page').innerHTML = pages[tab]();
    $('#dock').innerHTML = TABS.map(([k, l, i]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${i}${l}</button>`).join('');
    $('#drawer').innerHTML = drawer(); $('#drawer').classList.remove('small'); $('#minibar').innerHTML = miniHTML(); $('#sheet').innerHTML = sheet();
    $('#person').innerHTML = pk && data ? personHTML() : gk && data ? groupHTML() : ''; $('#person').classList.toggle('open', !!(pk || gk));
    $('#dot').hidden = !data?.notifs.some(n => !n.read_at); dockSummary();
  };
  const reload = async (proc) => { if (proc) { try { await supabase.rpc('process_recurring'); } catch { /* ignora */ } } try { data = await loadLedger(user.id); failed = false; } catch { failed = !data; } paint(); };

  app.onclick = async e => {
    const t = e.target.closest('[data-a],[data-tab],[data-theme-set],[data-person],[data-flt],[data-cflt],[data-psub],[data-item],[data-nid],[data-group]'), d = t?.dataset;
    if (!t) return;
    if (d.tab) { tab = d.tab; q = ''; flt = 'all'; cflt = 'all'; paint(); scrollTo(0, 0); const p = $('#page'); p.classList.remove('rise'); void p.offsetWidth; p.classList.add('rise'); }
    else if (d.themeSet) { applyTheme(d.themeSet); paint(); }
    else if (d.person) { pk = d.person; psub = 'due'; paint(); }
    else if (d.flt) { flt = d.flt; paint(); }
    else if (d.cflt) { cflt = d.cflt; paint(); }
    else if (d.psub) { psub = d.psub; paint(); }
    else if (d.nid) {
      const n = data.notifs.find(x => x.id === d.nid); n.read_at ||= 'x';
      supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id).then(() => {});
      const k = n.type === 'expense_shared' ? data.expKey[n.data?.expense_id] : n.type === 'settlement_pending' ? data.pend.find(p => !p.own)?.key : null;
      shell.classList.remove('notif');
      if (k && C().some(c => c.id === k)) { pk = k; psub = 'due'; } else tab = ['link_accepted', 'account_deleted'].includes(n.type) ? 'contacts' : 'home';
      paint();
    }
    else if (d.group) { gk = d.group; paint(); }
    else if (d.item) {
      const [k, id] = d.item.split(':'); fx = (data.items[pk] || []).find(i => i.kind === k && i.id === id) || data.exps.find(i => i.id === id);
      if (k === 's') return openForm('dels');
      const { data: r } = await supabase.from('expenses').select('id,title,amount_cents,spent_on,payer_contact_id,group_id,receipt_path,expense_shares(contact_id,amount_cents)').eq('id', id).single();
      if (!r) return toast('Impossibile aprire la spesa.');
      const ps = r.expense_shares.filter(x => x.contact_id).map(x => x.contact_id), ids = ['me', ...ps];
      const am = Object.fromEntries(r.expense_shares.map(x => [x.contact_id || 'me', x.amount_cents])), fm = v => (v / 100).toFixed(2).replace('.', ',');
      xstate = { gid: r.group_id, rpath: r.receipt_path, title: r.title, amount: fm(r.amount_cents), date: r.spent_on, ps, paid: r.payer_contact_id || 'me', mode: 'custom', custom: Object.fromEntries(ids.map(i => [i, fm(am[i] || 0)])) };
      for (const mo of ['equal', 'others']) if (calcShares({ ...xstate, mode: mo }).every(a => (am[a.contact_id || 'me'] || 0) === a.amount_cents)) { xstate.mode = mo; break; }
      openForm('editx');
    }
    else if (d.a === 'menu') { shell.classList.remove('notif'); shell.classList.add('menu'); }
    else if (d.a === 'notif') { shell.classList.remove('menu'); shell.classList.add('notif'); }
    else if (d.a === 'close') shell.classList.remove('menu', 'notif', 'form');
    else if (d.a === 'back') closePerson();
    else if (d.a === 'out') {
      try { const reg = await swReady(), sub = await reg?.pushManager.getSubscription(); if (sub) await supabase.rpc('remove_push_subscription', { p_endpoint: sub.endpoint }); } catch { /* ignora */ }
      logout();
    }
    else if (d.a === 'set:push') { pstate = 'check'; openForm('push'); pstate = await pushState(); $('#fsheet').innerHTML = formHTML(); }
    else if (d.a === 'push-on') {
      try {
        if (await Notification.requestPermission() !== 'granted') pstate = 'denied';
        else {
          const reg = await swReady(); if (!reg) throw new Error('sw');
          const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(VAPID_PUBLIC_KEY) }), j = sub.toJSON();
          const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) });
          if (error) throw error; pstate = 'on'; toast('Notifiche attivate');
        }
      } catch { toast('Impossibile attivare le notifiche.'); pstate = await pushState(); }
      $('#fsheet').innerHTML = formHTML();
    }
    else if (d.a === 'push-off') {
      try { const reg = await swReady(), sub = await reg?.pushManager.getSubscription(); if (sub) { await supabase.rpc('remove_push_subscription', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); } pstate = 'off'; toast('Notifiche disattivate'); }
      catch { toast('Impossibile disattivare.'); }
      $('#fsheet').innerHTML = formHTML();
    }
    else if (d.a?.startsWith('set:')) openForm(d.a.slice(4));
    else if (d.a === 'exp-json') {
      const [c, e, s] = await Promise.all([supabase.from('contacts').select('*'), supabase.from('expenses').select('*,expense_shares(*)'), supabase.from('settlements').select('*')]);
      save(JSON.stringify({ exported: new Date().toISOString(), contacts: c.data, expenses: e.data, settlements: s.data }, null, 2), 'mezza-dati.json', 'application/json');
    } else if (d.a === 'exp-csv') {
      const rows = [['data', 'persona', 'descrizione', 'tipo', 'importo']];
      for (const c of C()) for (const it of data.items[c.id] || []) rows.push([it.date, c.name, it.kind === 'e' ? it.title : 'Saldo', it.kind === 'e' ? 'spesa' : 'saldo', (it.v / 100).toFixed(2).replace('.', ',')]);
      save('\ufeff' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n'), 'mezza-spese.csv', 'text/csv');
    }
    else if (d.a === 'addc') openForm('contact');
    else if (d.a === 'editc') openForm('editc');
    else if (d.a === 'pdf') personPdf(C().find(x => x.id === pk), data.items[pk] || [], bal(pk)).catch(() => toast('PDF non disponibile.'));
    else if (d.a === 'opdf') overviewPdf(C().filter(c => (data.items[c.id] || []).length).map(c => ({ name: c.name, bal: bal(c.id) }))).catch(() => toast('PDF non disponibile.'));
    else if (d.a === 'inv-y' || d.a === 'inv-n') {
      const { error } = await supabase.rpc('respond_link', { req: d.id, accept: d.a === 'inv-y' });
      error ? toast('Invito non valido.') : (toast(d.a === 'inv-y' ? 'Ora condividete i conti' : 'Invito rifiutato'), reload());
    } else if (d.a === 'set-y' || d.a === 'set-n') {
      const { error } = await supabase.rpc('confirm_settlement', { sid: d.id, accept: d.a === 'set-y' });
      error ? toast('Impossibile aggiornare il saldo.') : (toast(d.a === 'set-y' ? 'Saldo confermato' : 'Saldo rifiutato'), reload());
    } else if (d.a === 'invite') {
      const c = C().find(x => x.id === pk);
      if (norm(c.email) === norm(user.email)) return toast('Questa è la tua stessa email.');
      const { data: rq, error } = await supabase.from('link_requests').insert({ contact_id: pk, to_email: c.email.trim().toLowerCase() }).select('id').single();
      if (error) return toast(error.code === '23505' ? 'Invito già inviato.' : /eliminato/.test(error.message) ? 'Questo account è stato eliminato: impossibile invitarlo.' : 'Impossibile inviare l’invito.');
      if (data.reg.has(pk)) { toast('Richiesta di collegamento inviata'); return reload(); }
      const { data: r } = await supabase.functions.invoke('send-invite', { body: { request_id: rq.id, app_url: location.origin } });
      if (r?.sent) toast(`Invito inviato a ${c.email}`);
      else if (r?.reason === 'has_account') toast('Ha già un account: riceve una notifica.');
      else {
        console.warn('send-invite', r); toast(r?.error ? 'Email non inviata: ' + r.error.slice(0, 70) : 'Email non inviata.');
        const text = `${name} ti invita su Mezza per dividere le spese: ${location.origin}\nRegistrati o accedi con ${c.email} e accetta l’invito.`;
        if (navigator.share) navigator.share({ text }).catch(() => {}); else { await navigator.clipboard.writeText(text); toast('Invito creato: messaggio copiato'); }
      }
      reload();
    } else if (d.a === 'resend') {
      if (gone(C().find(x => x.id === pk))) return toast('Account eliminato: impossibile inviare email.');
      const { data: r } = await supabase.functions.invoke('send-invite', { body: { request_id: data.sent.get(pk), app_url: location.origin } });
      console.warn('send-invite', r);
      toast(r?.sent ? 'Email inviata' : r?.reason === 'already' ? 'Email già inviata.' : r?.reason === 'has_account' ? 'Ha già un account: riceve una notifica.' : 'Email non inviata: ' + (r?.error?.slice(0, 70) || 'errore'));
    } else if (d.a === 'delx' || d.a === 'delc' || d.a === 'delg') {
      if (armed !== d.a) { armed = d.a; t.textContent = 'Tocca ancora per confermare'; return; }
      const { error } = d.a === 'delg' ? await supabase.from('groups').delete().eq('id', gk) : d.a === 'delc' ? await supabase.from('contacts').delete().eq('id', pk)
        : await supabase.from(fx.kind === 's' ? 'settlements' : 'expenses').delete().eq('id', fx.id);
      if (error) return toast(d.a === 'delc' ? 'Il contatto ha spese collegate: eliminale prima.' : 'Impossibile eliminare.');
      if (d.a === 'delx' && fx?.receipt) supabase.storage.from('receipts').remove([fx.receipt]);
      shell.classList.remove('form'); if (d.a === 'delc') pk = null; if (d.a === 'delg') gk = null; await reload(); toast('Eliminato');
    }
    else if (d.a === 'newx') { xstate = newX(pk ? [pk] : []); openForm('expense'); }
    else if (d.a === 'lbclose') $('#lightbox').classList.remove('show');
    else if (d.a === 'rview') {
      const { data: s, error } = await supabase.storage.from('receipts').createSignedUrl(d.path, 300);
      if (error) return toast('Scontrino non disponibile.');
      $('#lightbox').innerHTML = `<img src="${esc(s.signedUrl)}" alt="Scontrino">`; $('#lightbox').classList.add('show');
    }
    else if (d.a === 'rdel') {
      if (xstate.rurl) URL.revokeObjectURL(xstate.rurl); xstate = { ...xstate, rblob: null, rurl: '', rdel: true };
      const sc = $('#fsheet').scrollTop; $('#fsheet').innerHTML = formHTML(); $('#fsheet').scrollTop = sc;
    }
    else if (d.a === 'delrec') {
      if (armed !== 'rec' + d.id) { armed = 'rec' + d.id; t.classList.add('neg'); return toast('Tocca ancora per eliminare la ricorrenza'); }
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', d.id);
      if (error) return toast('Impossibile eliminare.');
      await reload(); openForm('rec'); toast('Ricorrenza eliminata');
    }
    else if (d.a === 'addg') { gk = null; openForm('group'); }
    else if (d.a === 'editg') openForm('group');
    else if (d.a === 'newg') { const g = data.groups.find(x => x.id === gk); xstate = { ...newX(g.group_members.map(m => m.contact_id)), gid: gk }; openForm('expense'); }
    else if (d.a === 'settle') openForm('settle');
    else if (d.a === 'readall') {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      data.notifs.forEach(n => (n.read_at ||= 'x')); paint();
    } else if (d.a === 'fav') {
      const c = C().find(x => x.id === d.id);
      const { error } = await supabase.from('contacts').update({ favorite: !c.favorite }).eq('id', d.id);
      error ? toast(error.message.includes('5') ? 'Puoi fissare al massimo 5 preferiti.' : 'Errore, riprova.') : reload();
    } else if (d.a === 'remind') {
      const text = `Ciao ${cname(pk)}, ti ricordo la quota delle spese in sospeso: ${eur(bal(pk))}. Grazie!`;
      if (navigator.share) navigator.share({ text }).catch(() => {}); else { await navigator.clipboard.writeText(text); toast('Messaggio copiato'); }
    } else if (d.a === 'pick') {
      try {
        const r = (await navigator.contacts.select(['name', 'email', 'tel'], { multiple: true })).filter(p => p.name?.[0])
          .map(p => ({ name: p.name[0], email: p.email?.[0] || null, phone: p.tel?.[0] || null }));
        if (r.length) { const { error } = await supabase.from('contacts').insert(r); if (error) throw error; toast(`${r.length} contatti aggiunti`); reload(); }
      } catch { /* selezione annullata */ }
    }
  };
  const inX = el => { const fm = el.closest?.('form[data-f]'); return fm && ['expense', 'editx'].includes(fm.dataset.f) ? fm : null; };
  app.oninput = e => {
    if (e.target.id === 'q') { q = e.target.value; $('#list').innerHTML = listHTML(); return; }
    const fm = inX(e.target); if (fm) { readX(fm); $('#xsum').textContent = sumHTML(); }
  };
  app.onchange = async e => {
    const fm = inX(e.target); if (!fm) return; readX(fm);
    if (e.target.id === 'rcpt') {
      const f = e.target.files?.[0]; if (!f) return;
      try { const b = await shrink(f); if (xstate.rurl) URL.revokeObjectURL(xstate.rurl); xstate = { ...xstate, rblob: b, rurl: URL.createObjectURL(b), rdel: false }; }
      catch { return toast('Immagine non leggibile.'); }
      const sc = $('#fsheet').scrollTop; $('#fsheet').innerHTML = formHTML(); $('#fsheet').scrollTop = sc; return;
    }
    if (['p', 'paid', 'mode'].includes(e.target.name)) { const sc = $('#fsheet').scrollTop; $('#fsheet').innerHTML = formHTML(); $('#fsheet').scrollTop = sc; }
  };
  app.onsubmit = async e => {
    e.preventDefault();
    const k = e.target.dataset.f, f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('.primary'); if (busy) return; busy = true; btn.disabled = true; let ok = 'Salvato';
    try {
      if (k === 'contact') {
        const { error } = await supabase.from('contacts').insert({ name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null }); if (error) throw error;
      } else if (k === 'prof') {
        const nm = f.name.trim(), a = await supabase.auth.updateUser({ data: { name: nm } }); if (a.error) throw a.error;
        const b = await supabase.from('profiles').update({ display_name: nm }).eq('id', user.id); if (b.error) throw b.error;
        name = nm; $('.badge').textContent = nm[0].toUpperCase();
      } else if (k === 'prefs') {
        pref = { ...pref, split: f.split };
        const { error } = await supabase.from('profiles').update({ settings: pref }).eq('id', user.id); if (error) throw error;
      } else if (k === 'pwd') {
        const { error } = await supabase.auth.updateUser({ password: f.password }); if (error) throw error; ok = 'Password aggiornata';
      } else if (k === 'mail') {
        const { error } = await supabase.auth.updateUser({ email: f.email.trim() }, { emailRedirectTo: location.origin }); if (error) throw error; ok = 'Controlla la posta per confermare';
      } else if (k === 'del') {
        if (f.word.trim() !== 'ELIMINA') throw new Error('Scrivi ELIMINA per confermare.');
        const fl = (await supabase.storage.from('receipts').list(user.id, { limit: 1000 })).data;
        if (fl?.length) await supabase.storage.from('receipts').remove(fl.map(f => `${user.id}/${f.name}`));
        const { error } = await supabase.rpc('delete_my_account'); if (error) throw error; logout(); return;
      } else if (k === 'group') {
        const ids = new FormData(e.target).getAll('m'), nm = f.name.trim(); let gid = gk;
        if (gid) {
          const u = await supabase.from('groups').update({ name: nm }).eq('id', gid); if (u.error) throw u.error;
          const d2 = await supabase.from('group_members').delete().eq('group_id', gid); if (d2.error) throw d2.error;
        } else { const { data: g, error } = await supabase.from('groups').insert({ name: nm }).select('id').single(); if (error) throw error; gid = g.id; }
        if (ids.length) { const { error } = await supabase.from('group_members').insert(ids.map(c => ({ group_id: gid, contact_id: c }))); if (error) throw error; }
      } else if (k === 'editc') {
        const { error } = await supabase.from('contacts').update({ name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null }).eq('id', pk); if (error) throw error;
      } else if (k === 'expense' || k === 'editx') {
        readX(e.target); const x = xstate, total = cents(x.amount);
        if (!(total > 0)) throw new Error('Importo non valido.');
        if (!x.ps.length) throw new Error('Scegli almeno una persona.');
        const sh = calcShares(x);
        if (sh.reduce((a, b) => a + b.amount_cents, 0) !== total || sh.some(a => !(a.amount_cents >= 0))) throw new Error('Le quote non sommano al totale.');
        let gid = x.gid ?? null;   // gruppo automatico: nuova spesa con più di una persona, senza gruppo
        if (!gid && k !== 'editx') {
          const people = [...new Set(sh.map(s => s.contact_id).concat(x.paid === 'me' ? [] : [x.paid]).filter(Boolean))];
          if (people.length > 1) {
            const key = [...people].sort().join(','), same = data.groups.find(g => g.group_members.map(m => m.contact_id).sort().join(',') === key);
            if (same) gid = same.id;
            else {
              const fn = people.map(id => cname(id).split(' ')[0]), label = fn.length <= 3 ? fn.join(', ') : `${fn.slice(0, 2).join(', ')} +${fn.length - 2}`;
              const { data: g, error: ge } = await supabase.from('groups').insert({ name: label }).select('id').single(); if (ge) throw ge;
              const { error: me } = await supabase.from('group_members').insert(people.map(c => ({ group_id: g.id, contact_id: c }))); if (me) throw me;
              gid = g.id; ok = `Gruppo creato: ${label}`;
            }
          }
        }
        const { data: newId, error } = await supabase.rpc('save_expense', { p_id: k === 'editx' ? fx.id : null, p_title: x.title.trim(), p_amount: total, p_date: x.date, p_payer: x.paid === 'me' ? null : x.paid, p_shares: sh, p_group: gid });
        if (error) throw error;
        if (k !== 'editx' && x.rep && x.rep !== 'none') {
          const r2 = await supabase.rpc('add_recurring', { p_expense: newId, p_title: x.title.trim(), p_amount: total, p_start: x.date, p_payer: x.paid === 'me' ? null : x.paid, p_shares: sh, p_group: gid, p_freq: x.rep });
          if (r2.error) throw r2.error;
          ok = ok === 'Salvato' ? 'Spesa salvata e ripetuta' : ok + ' · ripetuta';
        }
        if (x.rblob || (x.rdel && x.rpath)) {   // scontrino: carica il nuovo e ripulisci il vecchio
          try {
            const eid = k === 'editx' ? fx.id : newId;
            if (x.rblob) {
              const path = `${user.id}/${crypto.randomUUID()}.jpg`, up = await supabase.storage.from('receipts').upload(path, x.rblob, { contentType: 'image/jpeg' });
              if (up.error) throw up.error;
              const u2 = await supabase.from('expenses').update({ receipt_path: path }).eq('id', eid); if (u2.error) throw u2.error;
            } else { const u3 = await supabase.from('expenses').update({ receipt_path: null }).eq('id', eid); if (u3.error) throw u3.error; }
            if (x.rpath) supabase.storage.from('receipts').remove([x.rpath]);
          } catch { ok = 'Spesa salvata, ma lo scontrino non è stato caricato'; }
        }
        if (error) throw error;
      } else {
        const amt = cents(f.amount); if (!(amt > 0)) throw new Error('Importo non valido.');
        if (amt > Math.abs(eff(pk))) throw new Error('L’importo supera il saldo da pareggiare.');
        const { error } = await supabase.from('settlements').insert({ contact_id: pk, direction: eff(pk) > 0 ? 'received' : 'paid', amount_cents: amt, method: f.method }); if (error) throw error;
      }
      shell.classList.remove('form'); await reload(); toast(ok);
    } catch (err) { const m = $('#fmsg'); m.textContent = err.message?.length < 80 ? err.message : 'Qualcosa è andato storto. Riprova.'; m.className = 'msg err'; }
    finally { btn.disabled = false; busy = false; }
  };

  document.onvisibilitychange = () => { if (document.visibilityState === 'visible') reload(true); };
  swipe($('#drawer'), 'left', () => shell.classList.remove('menu'));
  swipe($('#sheet'), 'down', () => shell.classList.remove('notif'));
  swipe($('#fsheet'), 'down', () => shell.classList.remove('form'));
  swipe($('#person'), 'right', closePerson);
  $('#drawer').addEventListener('scroll', e => { if (e.target.classList?.contains('dbody')) $('#drawer').classList.toggle('small', e.target.scrollTop > 14); }, true);
  document.onkeydown = e => { if (e.key === 'Escape') { shell.classList.remove('menu', 'notif', 'form'); $('#lightbox').classList.remove('show'); } };
  window.ononline = () => reload(true);
  supabase.from('profiles').select('settings').eq('id', user.id).single().then(({ data: p }) => { if (p?.settings) pref = { ...pref, ...p.settings }; });
  if (chan) supabase.removeChannel(chan);
  chan = supabase.channel('mezza-notifiche').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => { reload(); toast('Nuova notifica'); }).subscribe();
  paint(); reload(true);
}
