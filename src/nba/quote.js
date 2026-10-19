import { CONFIG } from '../config.js';

const SELEZIONI = { vincente: ['casa', 'trasferta'], handicap: ['casa', 'trasferta'], totale: ['over', 'under'] };

const valida = (q) => (Number.isFinite(q) && q > 1 ? q : null);

function coppia(bookmaker, mercato, linea) {
  const m = bookmaker.mercati?.[mercato];
  if (!m) return null;
  return mercato === 'vincente' ? m : m[String(linea)] ?? null;
}

function quotaDi(bookmaker, mercato, selezione, linea) {
  const c = coppia(bookmaker, mercato, linea);
  return c ? valida(c[selezione]) : null;
}

function mediana(ordinati) {
  const n = ordinati.length;
  const meta = n >> 1;
  return n % 2 ? ordinati[meta] : (ordinati[meta - 1] + ordinati[meta]) / 2;
}

const lineaValida = (x) => Number.isFinite(x) && Number.isInteger(x * 2);

export function lineaComune(evento, mercato) {
  const conteggio = new Map();
  const tutte = [];
  for (const b of evento.bookmaker) {
    const m = b.mercati?.[mercato];
    if (!m) continue;
    for (const chiave of Object.keys(m)) {
      const linea = Number(chiave);
      if (!lineaValida(linea)) continue;
      conteggio.set(linea, (conteggio.get(linea) ?? 0) + 1);
      tutte.push(linea);
    }
  }
  if (!conteggio.size) return null;
  const med = mediana(tutte.sort((a, b) => a - b));
  const max = Math.max(...conteggio.values());
  const candidate = [...conteggio].filter(([, n]) => n === max).map(([l]) => l);
  candidate.sort((a, b) => Math.abs(a - med) - Math.abs(b - med) || Math.abs(a) - Math.abs(b));
  return candidate[0];
}

export function quotaMedianaNba(evento, mercato, selezione, linea) {
  const quote = evento.bookmaker
    .map((b) => quotaDi(b, mercato, selezione, linea))
    .filter((q) => q !== null)
    .sort((a, b) => a - b);
  const n = quote.length;
  if (n < CONFIG.nba.minBookmaker) return null;
  return { quota: Math.floor(mediana(quote) * 100 + 1e-9) / 100, n };
}

export function consensoNba(evento, mercato, linea) {
  const selezioni = SELEZIONI[mercato];
  const prob = [];
  for (const b of evento.bookmaker) {
    const quote = selezioni.map((s) => quotaDi(b, mercato, s, linea));
    if (quote.some((q) => q === null)) continue;
    const somma = quote.reduce((t, q) => t + 1 / q, 0);
    prob.push(quote.map((q) => 1 / q / somma));
  }
  if (prob.length < CONFIG.nba.minBookmaker) return null;
  return Object.fromEntries(selezioni.map((s, i) => [s, prob.reduce((t, p) => t + p[i], 0) / prob.length]));
}
