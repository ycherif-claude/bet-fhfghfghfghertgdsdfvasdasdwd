import { partiRoma } from '../bankroll/settimana.js';

export function slug(testo) {
  return String(testo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const PREFISSI = new Set(['fc', 'cf', 'ac', 'afc', 'sc', 'ssc', 'as', 'us', 'calcio', 'club', 'de', '1']);

export function normalizzaNome(nome) {
  return slug(nome).split('-').filter((t) => t && !PREFISSI.has(t)).join('-');
}

const due = (n) => String(n).padStart(2, '0');

export function dataRoma(istante) {
  const r = partiRoma(istante);
  return `${r.anno}-${due(r.mese)}-${due(r.giorno)}`;
}

// Istante UTC corrispondente alle 08:00 di Roma della data AAAA-MM-GG.
function ottoRoma(data) {
  const [y, m, g] = data.split('-').map(Number);
  for (const offset of [1, 2]) {
    const d = new Date(Date.UTC(y, m - 1, g, 8 - offset));
    const r = partiRoma(d);
    if (r.ora === 8 && r.giorno === g && r.mese === m) return d;
  }
  throw new Error(`Data non valida: ${data}`);
}

// Dalle 08:00 di Roma di `data` alle 08:00 di Roma del giorno dopo.
export function finestraGiornata(data) {
  const [y, m, g] = data.split('-').map(Number);
  const dopo = new Date(Date.UTC(y, m - 1, g + 1)).toISOString().slice(0, 10);
  return { da: ottoRoma(data), a: ottoRoma(dopo) };
}

const formatoIso = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
});

// Istante in ora di Roma, ISO con offset (es. 2026-10-20T07:35:40+02:00).
export function isoRoma(istante) {
  const p = Object.fromEntries(formatoIso.formatToParts(istante).map((x) => [x.type, x.value]));
  const offset = p.timeZoneName.replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

// Ora di Roma HH:MM.
export function oraRoma(istante) {
  return isoRoma(istante).slice(11, 16);
}
