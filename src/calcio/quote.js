import { CONFIG } from '../config.js';

const ESCLUSI = new Set(['betfair_ex_eu', 'matchbook', 'smarkets']);
const CHIAVI_H2H = { 1: 'casa', X: 'pareggio', 2: 'trasferta' };
const CHIAVI_TOTALS = { Over: 'over', Under: 'under' };

function quotaDi(bookmaker, mercato, selezione, linea) {
  const m = bookmaker.mercati?.[mercato];
  if (!m) return null;
  const q = mercato === 'h2h' ? m[CHIAVI_H2H[selezione]] : m[String(linea)]?.[CHIAVI_TOTALS[selezione]];
  return Number.isFinite(q) && q > 1 ? q : null;
}

export function quotaMediana(evento, mercato, selezione, linea) {
  const quote = evento.bookmaker
    .filter((b) => !ESCLUSI.has(b.chiave))
    .map((b) => quotaDi(b, mercato, selezione, linea))
    .filter((q) => q !== null)
    .sort((a, b) => a - b);
  const n = quote.length;
  if (n < CONFIG.calcio.minBookmaker) return null;
  const meta = n >> 1;
  const mediana = n % 2 ? quote[meta] : (quote[meta - 1] + quote[meta]) / 2;
  return { quota: Math.floor(mediana * 100 + 1e-9) / 100, n };
}

export function probPinnacle(evento, mercato, linea) {
  const pin = evento.bookmaker.find((b) => b.chiave === 'pinnacle');
  if (!pin) return null;
  const selezioni = mercato === 'h2h' ? ['1', 'X', '2'] : ['Over', 'Under'];
  const quote = selezioni.map((s) => quotaDi(pin, mercato, s, linea));
  if (quote.some((q) => q === null)) return null;
  const somma = quote.reduce((t, q) => t + 1 / q, 0);
  return Object.fromEntries(selezioni.map((s, i) => [s, 1 / quote[i] / somma]));
}
