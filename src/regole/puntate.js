import { CONFIG } from '../config.js';
import { quotaMinima } from './value.js';

const EPS = 1e-9;
const tra = (q, { min, max }) => q >= min - EPS && q <= max + EPS;

// Quota usata per valutare un candidato: la quota reale, oppure la quota
// minima del tipo se la quota è da verificare (null).
export function quotaEffettiva(candidato, tipo) {
  return candidato.quota ?? quotaMinima(candidato, tipo);
}

// "singola" | "speciale" | "builder" | null (quota fuori range).
// 3.00 esatto è una singola; la speciale è oltre 3.00 fino a 4.50.
export function classificaTipo(candidato) {
  const r = CONFIG.quote;
  if (candidato.tipo === 'builder') {
    return tra(quotaEffettiva(candidato, 'builder'), r.builder) ? 'builder' : null;
  }
  if (tra(quotaEffettiva(candidato, 'singola'), r.singola)) return 'singola';
  const q = quotaEffettiva(candidato, 'speciale');
  if (q > r.singola.max + EPS && q <= r.speciale.max + EPS) return 'speciale';
  return null;
}

// Kelly frazionario limitato al range del tipo; euro arrotondati a 0.50 per difetto.
export function puntataConsigliata({ tipo, prob, quota, bankroll }) {
  const { min, max } = CONFIG.puntate[tipo];
  let percentuale;
  if (min === max) {
    percentuale = min;
  } else {
    const f = (prob * quota - 1) / (quota - 1);
    const grezza = CONFIG.kelly * f * 100;
    percentuale = Math.round(Math.min(max, Math.max(min, grezza)) * 100) / 100;
  }
  const passo = CONFIG.arrotondamentoEuro;
  const euro = Math.floor((bankroll * percentuale) / 100 / passo + EPS) * passo;
  return { euro, percentuale };
}
