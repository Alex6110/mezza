// Guscio dell'app: intestazione, menu, notifiche, barra, Home, Contatti, Consultazioni e pagina persona.
import { supabase } from './supabase.js';
import { loadLedger } from './ledger.js';
import { APP_NAME } from './config.js';
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
  edit: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'), pdf: ic('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 14h6M10 17h6"/>'), book: ic('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
};
const TABS = [['contacts', 'Contatti', I.users], ['home', 'Home', I.home], ['consult', 'Consultazioni', I.list]];
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

export function mountShell(app, user, { applyTheme, getTheme, logout }) {
  const name = user.user_metadata?.name || user.email.split('@')[0];
  let tab = 'home', data = null, failed = false, q = '', flt = 'all', pk = null, psub = 'due', form = null, tt, fx = null, armed = '';

  app.innerHTML = `<div class="shell" id="shell">
    <header class="top"><button class="badge" data-a="menu" aria-label="Menu">${esc(name[0].toUpperCase())}</button>
      <b class="appname">${APP_NAME}</b><button class="bell" data-a="notif" aria-label="Notifiche">${I.bell}<span class="dot" id="dot" hidden></span></button></header>
    <main id="page"></main><nav class="dock" id="dock"></nav>
    <section class="page" id="person"></section>
    <div class="scrim" data-a="close"></div><aside class="drawer" id="drawer"></aside>
    <section class="sheet" id="sheet"></section><section class="sheet" id="fsheet"></section><div class="toast" id="toast"></div></div>`;
  const $ = s => app.querySelector(s), shell = $('#shell');
  const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 2600); };
  const C = () => data?.contacts || [], bal = id => data?.bal[id] || 0, cname = id => C().find(c => c.id === id)?.name || '?';
  const match = c => norm(c.name).includes(norm(q));

  const contactRow = c => `<div class="row tap" data-person="${c.id}">${av(c.id, c.name)}<span class="grow"><b>${esc(c.name)}</b><br><span class="sub">${esc(c.phone || c.email || 'Nessun recapito')}</span></span>
    <button class="star ${c.favorite ? 'on' : ''}" data-a="fav" data-id="${c.id}" aria-label="Preferito">${I.star}</button></div>`;
  const consRow = c => `<div class="row tap" data-person="${c.id}">${av(c.id, c.name)}<span class="grow"><b>${esc(c.name)}</b><br>
    <span class="sub">${bal(c.id) > 0 ? 'ti deve' : bal(c.id) < 0 ? 'devi dare' : 'tutto saldato'}</span></span>${sg(bal(c.id))}</div>`;
  const group = (h, arr, fn) => arr.length ? `<h2>${h}</h2><div class="card">${arr.map(fn).join('')}</div>` : '';

  const listHTML = () => {
    if (!data) return '<p class="empty">Caricamento…</p>';
    if (tab === 'contacts') {
      const l = C().filter(c => match(c) && (flt === 'all' || (flt === 'tel' ? c.phone : c.email)));
      const fav = !q && flt === 'all' ? C().filter(c => c.favorite) : [];
      return (fav.length ? `<h2>Preferiti</h2><div class="favs">${fav.map(c => `<button class="fav" data-person="${c.id}">${av(c.id, c.name)}<span>${esc(c.name.split(' ')[0])}</span></button>`).join('')}</div>` : '')
        + (l.length ? `<h2>Contatti</h2><div class="card">${l.map(contactRow).join('')}</div>` : '<p class="empty">Nessun contatto. Aggiungine uno con il pulsante +.</p>');
    }
    const p = C().filter(c => (data.items[c.id] || []).length && match(c));
    return !p.length ? '<p class="empty">Nessuna spesa condivisa. Apri un contatto e tocca Nuova spesa.</p>'
      : group('Da saldare', p.filter(c => bal(c.id)).sort((a, b) => Math.abs(bal(b.id)) - Math.abs(bal(a.id))), consRow) + group('In pari', p.filter(c => !bal(c.id)), consRow);
  };
  const searchBar = extra => `<div class="bar"><label class="search">${I.search}<input id="q" placeholder="Cerca per nome" value="${esc(q)}" autocomplete="off"></label>${extra}</div>`;

  const row = x => `<div class="row"><span class="ico">${I.list}</span><span class="grow"><b>${esc(x.title)}</b><br><span class="sub">${dshort(x.spent_on)} · ${eur(x.amount_cents)}</span></span>
    ${x.delta ? `<b class="${x.delta > 0 ? 'pos' : 'neg'}">${x.delta > 0 ? '+' : '−'}${eur(Math.abs(x.delta))}</b>` : '<span class="sub">Non coinvolto</span>'}</div>`;
  const pages = {
    home: () => failed ? '<p class="empty">Impossibile caricare i dati. Controlla di aver eseguito gli script SQL.</p>' : !data ? '<p class="empty">Caricamento…</p>'
      : `${invitesHTML()}<section class="hero"><div><span>Ti devono</span><strong>${eur(data.owed)}</strong></div><div><span>Devi dare</span><strong>${eur(data.owe)}</strong></div>
        <p class="net">Saldo netto <b>${data.owed - data.owe < 0 ? '−' : ''}${eur(Math.abs(data.owed - data.owe))}</b></p></section>
        <h2>Spese recenti</h2>${data.recent.length ? `<div class="card">${data.recent.map(row).join('')}</div>` : '<p class="empty">Ancora nessuna spesa condivisa.</p>'}`,
    contacts: () => searchBar(`${'contacts' in navigator && 'ContactsManager' in window ? `<button class="btn sq" data-a="pick" aria-label="Dalla rubrica">${I.book}</button>` : ''}<button class="btn primary sq" data-a="addc" aria-label="Nuovo contatto">${I.plus}</button>`)
      + seg('flt', flt, [['all', 'Tutti'], ['tel', 'Telefono'], ['mail', 'Email']]) + `<div id="list">${listHTML()}</div>`,
    consult: () => searchBar(`<button class="btn sq" data-a="opdf" aria-label="Riepilogo PDF">${I.pdf}</button>`) + `<div id="list">${listHTML()}</div>`,
  };

  const invitesHTML = () => (data?.invites || []).map(i => `<div class="card inv"><div class="row"><span class="ico">${I.users}</span><span class="grow"><b>${esc(i.from_name || i.from_email)}</b><br><span class="sub">ti invita a condividere i conti</span></span></div>
    <div class="acts pad"><button class="btn primary" data-a="inv-y" data-id="${i.id}">Accetta</button><button class="btn" data-a="inv-n" data-id="${i.id}">Rifiuta</button></div></div>`).join('');
  const linkHTML = c => c.linked_user_id ? `<p class="chipinfo">${I.check}Collegato: vedete le stesse spese</p>`
    : data.sent.has(c.id) ? `<p class="chipinfo">${I.send}Invito inviato. Compare quando ${esc(c.name.split(' ')[0])} accede con ${esc(c.email || 'la sua email')}.</p>`
    : `<button class="btn link-b" data-a="${c.email ? 'invite' : 'editc'}">${I.users}${c.email ? 'Invita su Mezza' : 'Aggiungi l’email per invitare'}</button>`;
  const pendHTML = () => data.pend.filter(p => p.key === pk).map(p => p.own ? `<p class="chipinfo">Saldo di ${eur(p.amount)} in attesa di conferma.</p>`
    : `<div class="card inv"><div class="row"><span class="grow"><b>Saldo da confermare</b><br><span class="sub">${p.dir === 'paid' ? 'Dice di averti dato' : 'Dice di aver ricevuto da te'} ${eur(p.amount)}</span></span></div>
      <div class="acts pad"><button class="btn primary" data-a="set-y" data-id="${p.id}">Conferma</button><button class="btn" data-a="set-n" data-id="${p.id}">Rifiuta</button></div></div>`).join('');
  const itemRow = ({ it, rem }, cn) => {
    const v = rem ?? it.v, e = it.kind === 'e';
    return `<div class="row ${it.own ? 'tap' : ''}" ${it.own ? `data-item="${it.kind}:${it.id}"` : ''}><span class="ico">${e ? I.list : I.check}</span><span class="grow"><b>${e ? esc(it.title) : v > 0 ? 'Hai dato un saldo' : 'Hai ricevuto un saldo'}</b><br>
      <span class="sub">${e ? `${it.iPaid ? 'Pagato da te' : 'Pagato da ' + esc(cn)} · ${eur(it.total)}` : esc(it.method || 'Saldo')} · ${dshort(it.date)}</span></span>${sg(v)}</div>`;
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
      ${linkHTML(c)}${pendHTML()}<div class="acts"><button class="btn primary" data-a="newx">${I.plus}Nuova spesa</button>${b ? `<button class="btn" data-a="settle">${I.check}Salda</button>` : ''}${b > 0 ? `<button class="btn" data-a="remind">${I.send}Sollecita</button>` : ''}</div>
      ${seg('psub', psub, [['due', 'Da saldare'], ['hist', 'Storico']])}${body}`;
  };

  const drawer = () => { const t = getTheme(); return `<button class="x" data-a="close" aria-label="Chiudi">${I.x}</button>
    <div class="avatar big">${esc(name[0].toUpperCase())}</div><h2 class="nm">${esc(name)}</h2><p class="sub">${esc(user.email)}</p>
    <h3>Aspetto</h3>${seg('theme-set', t, [['system', 'Sistema'], ['light', 'Chiaro'], ['dark', 'Scuro']])}
    <button class="btn danger-t" data-a="out">Esci</button><p class="sub ver">${APP_NAME} · fase 5</p>`; };
  const sheet = () => `<div class="grab"></div><div class="sheet-h"><h2>Notifiche</h2>${data?.notifs.some(n => !n.read_at) ? '<button class="link" data-a="readall">Segna come lette</button>' : ''}</div>
    ${data?.notifs.length ? data.notifs.map(n => `<div class="row"><span class="grow"><b>${esc(n.title)}</b>${n.body ? `<br><span class="sub">${esc(n.body)}</span>` : ''}</span>${n.read_at ? '' : '<span class="dot s"></span>'}</div>`).join('') : '<p class="empty">Nessuna notifica.</p>'}`;

  const formHTML = () => {
    const f = (t, body, btn) => `<div class="grab"></div><form data-f="${form}"><h2>${t}</h2>${body}<p class="msg" id="fmsg"></p><button class="btn primary">${btn}</button></form>`, cn = esc(cname(pk));
    if (form === 'contact') return f('Nuovo contatto', '<input name="name" placeholder="Nome" required maxlength="60"><input name="email" type="email" placeholder="Email (facoltativa)"><input name="phone" type="tel" placeholder="Telefono (facoltativo)">', 'Aggiungi');
    if (form === 'editc') { const c = C().find(x => x.id === pk);
      return f('Modifica contatto', `<input name="name" value="${esc(c.name)}" required maxlength="60"><input name="email" type="email" placeholder="Email" value="${esc(c.email || '')}"><input name="phone" type="tel" placeholder="Telefono" value="${esc(c.phone || '')}">`, 'Salva')
        + '<button class="btn danger-t del" data-a="delc">Elimina contatto</button>'; }
    if (form === 'dels') return `<div class="grab"></div><div class="dform"><h2>Saldo del ${dshort(fx.date)}</h2><p class="sub">${esc(fx.method || 'Saldo')} · ${eur(Math.abs(fx.v))}</p><button class="btn danger-t" data-a="delx">Elimina saldo</button></div>`;
    if (form === 'expense' || form === 'editx') {
      const x = form === 'editx' ? fx : null, back = x ? Math.abs(x.v) : 0, sp = !x ? 'half' : back === Math.round(x.total / 2) ? 'half' : back === x.total ? 'all' : 'custom';
      return f(x ? 'Modifica spesa' : 'Nuova spesa', `<input name="title" placeholder="Descrizione" required maxlength="80" value="${esc(x?.title || '')}">
      <div class="two"><input name="amount" inputmode="decimal" placeholder="Importo" required value="${x ? (x.total / 100).toFixed(2).replace('.', ',') : ''}"><input name="date" type="date" value="${x?.date || today()}" required></div>
      <label>Pagato da${chips('paid', [['me', 'Io'], ['them', cname(pk)]], x && !x.iPaid ? 'them' : 'me')}</label>
      <label>Da restituire${chips('split', [['half', 'Metà'], ['all', 'Tutto'], ['custom', 'Altro importo']], sp)}</label>
      <label id="cust" ${sp === 'custom' ? '' : 'hidden'}>Importo da restituire<input name="custom" inputmode="decimal" placeholder="0,00" value="${sp === 'custom' ? (back / 100).toFixed(2).replace('.', ',') : ''}"></label>`, x ? 'Salva modifiche' : 'Salva spesa')
        + (x ? '<button class="btn danger-t del" data-a="delx">Elimina spesa</button>' : '');
    }
    const b = bal(pk);
    return f(`Salda con ${cn}`, `<p class="sub">${b > 0 ? `Ti deve ${eur(b)}` : `Devi dare ${eur(-b)}`}</p><input name="amount" inputmode="decimal" value="${(Math.abs(b) / 100).toFixed(2).replace('.', ',')}" required>
      <label>Metodo${chips('method', METHODS.map(m => [m, m]), 'Contanti')}</label>`, 'Segna come saldato');
  };
  const openForm = t => { form = t; armed = ''; $('#fsheet').innerHTML = formHTML(); shell.classList.remove('menu', 'notif'); shell.classList.add('form'); };

  const paint = () => {
    $('#page').innerHTML = pages[tab]();
    $('#dock').innerHTML = TABS.map(([k, l, i]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${i}${l}</button>`).join('');
    $('#drawer').innerHTML = drawer(); $('#sheet').innerHTML = sheet();
    $('#person').innerHTML = pk && data ? personHTML() : ''; $('#person').classList.toggle('open', !!pk);
    $('#dot').hidden = !data?.notifs.some(n => !n.read_at);
  };
  const reload = async () => { try { data = await loadLedger(user.id); failed = false; } catch { failed = true; } paint(); };

  app.onclick = async e => {
    const t = e.target.closest('[data-a],[data-tab],[data-theme-set],[data-person],[data-flt],[data-psub],[data-item]'), d = t?.dataset;
    if (!t) return;
    if (d.tab) { tab = d.tab; q = ''; flt = 'all'; paint(); scrollTo(0, 0); }
    else if (d.themeSet) { applyTheme(d.themeSet); paint(); }
    else if (d.person) { pk = d.person; psub = 'due'; paint(); }
    else if (d.flt) { flt = d.flt; paint(); }
    else if (d.psub) { psub = d.psub; paint(); }
    else if (d.item) { const [k, id] = d.item.split(':'); fx = (data.items[pk] || []).find(i => i.kind === k && i.id === id); openForm(k === 'e' ? 'editx' : 'dels'); }
    else if (d.a === 'menu') { shell.classList.remove('notif'); shell.classList.add('menu'); }
    else if (d.a === 'notif') { shell.classList.remove('menu'); shell.classList.add('notif'); }
    else if (d.a === 'close') shell.classList.remove('menu', 'notif', 'form');
    else if (d.a === 'back') { pk = null; paint(); }
    else if (d.a === 'out') logout();
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
      const { error } = await supabase.from('link_requests').insert({ contact_id: pk, to_email: c.email.trim().toLowerCase() });
      if (error) return toast(error.code === '23505' ? 'Invito già inviato.' : 'Impossibile inviare l’invito.');
      const text = `${name} ti invita su Mezza per dividere le spese: ${location.origin}\nRegistrati o accedi con ${c.email} e accetta l’invito.`;
      if (navigator.share) navigator.share({ text }).catch(() => {}); else { await navigator.clipboard.writeText(text); toast('Invito creato: messaggio copiato'); }
      reload();
    } else if (d.a === 'delx' || d.a === 'delc') {
      if (armed !== d.a) { armed = d.a; t.textContent = 'Tocca ancora per confermare'; return; }
      const { error } = d.a === 'delc' ? await supabase.from('contacts').delete().eq('id', pk)
        : await supabase.from(fx.kind === 'e' ? 'expenses' : 'settlements').delete().eq('id', fx.id);
      if (error) return toast(d.a === 'delc' ? 'Il contatto ha spese collegate: eliminale prima.' : 'Impossibile eliminare.');
      shell.classList.remove('form'); if (d.a === 'delc') pk = null; await reload(); toast('Eliminato');
    }
    else if (d.a === 'newx') openForm('expense');
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
  app.oninput = e => { if (e.target.id === 'q') { q = e.target.value; $('#list').innerHTML = listHTML(); } };
  app.onchange = e => { if (e.target.name === 'split') $('#cust').hidden = e.target.value !== 'custom'; };
  app.onsubmit = async e => {
    e.preventDefault();
    const k = e.target.dataset.f, f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('.primary'); btn.disabled = true;
    try {
      if (k === 'contact') {
        const { error } = await supabase.from('contacts').insert({ name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null }); if (error) throw error;
      } else if (k === 'editc') {
        const { error } = await supabase.from('contacts').update({ name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null }).eq('id', pk); if (error) throw error;
      } else if (k === 'expense' || k === 'editx') {
        const amt = cents(f.amount), mine = f.paid === 'me', back = f.split === 'half' ? Math.round(amt / 2) : f.split === 'all' ? amt : cents(f.custom);
        if (!(amt > 0)) throw new Error('Importo non valido.');
        if (!(back >= 0 && back <= amt)) throw new Error('L’importo da restituire non può superare il totale.');
        const sh = mine ? [{ contact_id: pk, amount_cents: back }, { contact_id: null, amount_cents: amt - back }] : [{ contact_id: null, amount_cents: back }, { contact_id: pk, amount_cents: amt - back }];
        const { error } = await supabase.rpc('save_expense', { p_id: k === 'editx' ? fx.id : null, p_title: f.title.trim(), p_amount: amt, p_date: f.date, p_payer: mine ? null : pk, p_shares: sh });
        if (error) throw error;
      } else {
        const amt = cents(f.amount); if (!(amt > 0)) throw new Error('Importo non valido.');
        const { error } = await supabase.from('settlements').insert({ contact_id: pk, direction: bal(pk) > 0 ? 'received' : 'paid', amount_cents: amt, method: f.method }); if (error) throw error;
      }
      shell.classList.remove('form'); await reload(); toast('Salvato');
    } catch (err) { const m = $('#fmsg'); m.textContent = err.message?.length < 80 ? err.message : 'Qualcosa è andato storto. Riprova.'; m.className = 'msg err'; }
    finally { btn.disabled = false; }
  };

  document.onvisibilitychange = () => { if (document.visibilityState === 'visible') reload(); };
  paint(); reload();
}
