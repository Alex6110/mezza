// Colore principale dell'app, scelto dall'utente. Il verde acqua è quello di base (definito nel CSS).
export const ACCENTS = {
  teal: ['Verde acqua', '#0b7f73', '#2bb5a4', '#06201c'],
  indigo: ['Indaco', '#4a55d6', '#7b86f5', '#0d1033'],
  blue: ['Blu', '#1f6feb', '#4f94f7', '#04152e'],
  violet: ['Viola', '#7541e0', '#9b79f0', '#180c3d'],
  slate: ['Grafite', '#3d4b5c', '#9fb3c8', '#0f1720'],
};
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const deep = h => rgb(h).map((v, i) => Math.round(v * .55 + [10, 31, 61][i] * .45));
export const getAccent = () => localStorage.getItem('mezza-accent') || 'teal';
export function applyAccent(id = getAccent()) {
  const a = ACCENTS[id] || ACCENTS.teal, th = localStorage.getItem('mezza-theme') || 'system';
  const dark = th === 'dark' || (th === 'system' && matchMedia('(prefers-color-scheme: dark)').matches), r = document.documentElement.style;
  if (id === 'teal' || !ACCENTS[id]) { ['--primary', '--on-primary', '--primary-rgb', '--primary-deep'].forEach(p => r.removeProperty(p)); }
  else { const c = dark ? a[2] : a[1]; r.setProperty('--primary', c); r.setProperty('--on-primary', dark ? a[3] : '#fff'); r.setProperty('--primary-rgb', rgb(c).join(',')); r.setProperty('--primary-deep', `rgb(${deep(c).join(',')})`); }
  localStorage.setItem('mezza-accent', id);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyAccent());
