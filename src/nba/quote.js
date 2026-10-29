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

// Quote dei bookmaker italiani (CONFIG.odss.italiani) per una selezione: [[bookmaker, quota], …] dalla più alta, o null.
export function bookmakerItaliani(evento, mercato, selezione, linea) {
  const lista = (evento?.bookmaker ?? [])
    .filter((b) => CONFIG.odss.italiani.includes(String(b.chiave ?? '').toLowerCase()))
    .map((b) => [String(b.chiave).toLowerCase(), quotaDi(b, mercato, selezione, linea)])
    .filter(([, q]) => q !== null)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, CONFIG.odss.bookmakerPerEsito);
  return lista.length ? lista : null;
}

export function quotaMedianaNba(evento, mercato, selezione, linea, minBookmaker = CONFIG.nba.minBookmaker) {
  const quote = evento.bookmaker
    .map((b) => quotaDi(b, mercato, selezione, linea))
    .filter((q) => q !== null)
    .sort((a, b) => a - b);
  const n = quote.length;
  if (n < minBookmaker) return null;
  return { quota: Math.floor(mediana(quote) * 100 + 1e-9) / 100, n };
}

// Probabilità di riferimento di un mercato: Pinnacle senza margine sulla stessa linea, altrimenti il consenso
// senza margine dei bookmaker (exchange esclusi) su quella linea; null senza nessuno dei due.
const EXCHANGE = new Set(['betfair_ex_eu', 'matchbook', 'smarkets']);
export function riferimentoMercato(evento, tipo, linea, minBookmaker = CONFIG.nba.minBookmaker) {
  const pin = evento.bookmaker.find((b) => b.chiave === 'pinnacle');
  if (pin) {
    const p = consensoNba({ bookmaker: [pin] }, tipo, linea, 1);
    if (p) return { prob: p, etichetta: 'Pinnacle' };
  }
  const c = consensoNba({ bookmaker: evento.bookmaker.filter((b) => !EXCHANGE.has(b.chiave)) }, tipo, linea, minBookmaker);
  return c ? { prob: c, etichetta: 'Consenso bookmaker' } : null;
}

export function consensoNba(evento, mercato, linea, minBookmaker = CONFIG.nba.minBookmaker) {
  const selezioni = SELEZIONI[mercato];
  const prob = [];
  for (const b of evento.bookmaker) {
    const quote = selezioni.map((s) => quotaDi(b, mercato, s, linea));
    if (quote.some((q) => q === null)) continue;
    const somma = quote.reduce((t, q) => t + 1 / q, 0);
    prob.push(quote.map((q) => 1 / q / somma));
  }
  if (prob.length < minBookmaker) return null;
  return Object.fromEntries(selezioni.map((s, i) => [s, prob.reduce((t, p) => t + p[i], 0) / prob.length]));
}
