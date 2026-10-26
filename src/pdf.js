// Riepiloghi in PDF. jsPDF viene caricato solo quando serve, così l'app resta leggera.
const m = c => (c < 0 ? '-' : '') + new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Math.abs(c) / 100).replace(/\s/g, ' ');
const d = s => new Date(s).toLocaleDateString('it-IT');
const GREEN = [11, 127, 115];

async function make(title) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF();
  doc.setFontSize(20); doc.setTextColor(...GREEN); doc.text('Mezza', 14, 18);
  doc.setFontSize(13); doc.setTextColor(20); doc.text(title, 14, 28);
  doc.setFontSize(9); doc.setTextColor(110); doc.text(`Generato il ${d(new Date())}`, 14, 34);
  return { doc, autoTable };
}
const legend = doc => { doc.setFontSize(9); doc.setTextColor(110); doc.text('Importi positivi: ti devono. Importi negativi: devi dare.', 14, doc.lastAutoTable.finalY + 8); };

export async function personPdf(c, items, bal) {
  const { doc, autoTable } = await make(`Riepilogo con ${c.name}`);
  let run = 0;
  const body = [...items].sort((a, b) => (a.date + a.ts).localeCompare(b.date + b.ts)).map(it => {
    run += it.v;
    return [d(it.date), it.kind === 'e' ? it.title : 'Saldo',
      it.kind === 'e' ? `${it.iPaid ? 'Pagato da te' : 'Pagato da ' + c.name} (totale ${m(it.total)})` : it.method || '', m(it.v), m(run)];
  });
  autoTable(doc, { startY: 40, head: [['Data', 'Descrizione', 'Dettaglio', 'Importo', 'Saldo progressivo']], body,
    foot: [['', '', 'Saldo attuale', '', m(bal)]], headStyles: { fillColor: GREEN }, footStyles: { fillColor: [232, 240, 238], textColor: 20 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }, styles: { fontSize: 9 } });
  legend(doc);
  doc.save(`Mezza - ${c.name}.pdf`);
}

export async function overviewPdf(rows) {
  const { doc, autoTable } = await make('Riepilogo generale');
  const sorted = [...rows].sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal)).sort((a, b) => !!b.bal - !!a.bal);
  const owed = sorted.filter(r => r.bal > 0).reduce((s, r) => s + r.bal, 0), owe = sorted.filter(r => r.bal < 0).reduce((s, r) => s - r.bal, 0);
  autoTable(doc, { startY: 40, head: [['Persona', 'Stato', 'Saldo']],
    body: sorted.map(r => [r.name, r.bal > 0 ? 'Ti deve' : r.bal < 0 ? 'Devi dare' : 'In pari', m(r.bal)]),
    foot: [[`Ti devono ${m(owed)}`, `Devi dare ${m(owe)}`, `Netto ${m(owed - owe)}`]],
    headStyles: { fillColor: GREEN }, footStyles: { fillColor: [232, 240, 238], textColor: 20 }, columnStyles: { 2: { halign: 'right' } } });
  legend(doc);
  doc.save('Mezza - Riepilogo generale.pdf');
}
