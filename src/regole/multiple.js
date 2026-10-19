import { CONFIG } from '../config.js';
import { quotaMinima } from './value.js';
import { puntataConsigliata, quotaEffettiva } from './puntate.js';

const EPS = 1e-9;

function combinazioni(elementi, k, inizio = 0, corrente = [], out = []) {
  if (corrente.length === k) {
    out.push([...corrente]);
    return out;
  }
  for (let i = inizio; i < elementi.length; i++) {
    corrente.push(elementi[i]);
    combinazioni(elementi, k, i + 1, corrente, out);
    corrente.pop();
  }
  return out;
}

function costruisci(gambe, bankroll) {
  const r = CONFIG.quote.multipla;
  if (new Set(gambe.map((g) => g.idPartita)).size !== gambe.length) return null;
  const quote = gambe.map((g) => quotaEffettiva(g, g.tipo));
  if (quote.some((q) => q < r.minGamba - EPS)) return null;
  const quota = Math.round(quote.reduce((a, q) => a * q, 1) * 100) / 100;
  if (quota < r.min - EPS || quota > r.max + EPS) return null;
  const prob = gambe.reduce((a, g) => a * g.prob, 1);
  const value = prob * quota - 1;
  if (value < CONFIG.sogliaValue - EPS) return null;
  const ordinate = [...gambe].sort((a, b) => a.inizio.localeCompare(b.inizio));
  const candidato = { prob };
  return {
    id: 'M-' + gambe.map((g) => g.id).join('+'),
    sport: [...new Set(gambe.map((g) => g.sport))].join(' + '),
    competizione: [...new Set(gambe.map((g) => g.competizione))].join(' + '),
    partita: gambe.map((g) => g.partita).join(' + '),
    idPartita: gambe.map((g) => g.idPartita).join('+'),
    inizio: ordinate[0].inizio,
    tipo: 'multipla',
    mercato: 'Multipla',
    selezione: gambe.map((g) => g.selezione).join(' + '),
    prob,
    quota,
    fonteQuota: null,
    oraQuota: null,
    quotaDaVerificare: gambe.some((g) => g.quota === null),
    ragionamento: [],
    value,
    quotaMinima: quotaMinima(candidato, 'multipla'),
    puntata: puntataConsigliata({ tipo: 'multipla', prob, quota, bankroll }),
    stato: 'in_attesa',
    motivoStato: null,
    oraUltimoControllo: null,
    esito: null,
    gambe,
  };
}

// Fino a 2 multiple con value più alto, senza gambe in comune tra loro.
export function costruisciMultiple(singole, bankroll) {
  const r = CONFIG.quote.multipla;
  const adatte = singole.filter((g) => quotaEffettiva(g, g.tipo) >= r.minGamba - EPS);
  const candidate = [];
  for (let k = r.gambeMin; k <= r.gambeMax; k++) {
    for (const gambe of combinazioni(adatte, k)) {
      const m = costruisci(gambe, bankroll);
      if (m) candidate.push(m);
    }
  }
  candidate.sort((a, b) => b.value - a.value);
  const scelte = [];
  const usate = new Set();
  for (const m of candidate) {
    if (scelte.length >= CONFIG.massimiGiornalieri.multiple) break;
    if (m.gambe.some((g) => usate.has(g.id))) continue;
    scelte.push(m);
    m.gambe.forEach((g) => usate.add(g.id));
  }
  return scelte;
}
