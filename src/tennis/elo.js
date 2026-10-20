// Fase 4b (tennis): Elo complessivo e per superficie, probabilità di vittoria
// (con la conversione al meglio dei 5 set) e peso del modello rispetto al mercato.
import { CONFIG } from '../config.js';

const SUPERFICI = ['cemento', 'terra', 'erba'];
const P_MIN = 1e-6;
const P_MAX = 1 - 1e-6;
const GIORNO_MS = 86400000;

export function eloDefault(cfg = CONFIG.tennis) {
  const r = cfg.eloIniziale;
  return { tot: r, cemento: r, terra: r, erba: r, partite: [] };
}

export const probElo = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));

export const kFattore = (n, cfg = CONFIG.tennis) => cfg.kBase / (n + cfg.kOffset) ** cfg.kEsponente;

const superficieDi = (s) => (SUPERFICI.includes(s) ? s : 'cemento');

function walkover(p) {
  if (/walkover/i.test(p.commento ?? '')) return true;
  return (p.setW?.length ?? 0) === 0 && (p.setL?.length ?? 0) === 0;
}

export function calcolaElo(partite, cfg = CONFIG.tennis) {
  const elo = new Map();
  const conteggi = new Map(); // nome -> { tot, cemento, terra, erba }
  const voce = (nome) => {
    if (!elo.has(nome)) {
      elo.set(nome, eloDefault(cfg));
      conteggi.set(nome, { tot: 0, cemento: 0, terra: 0, erba: 0 });
    }
    return elo.get(nome);
  };
  const ordinate = partite
    .map((p, i) => ({ p, i }))
    .sort((x, y) => (x.p.data < y.p.data ? -1 : x.p.data > y.p.data ? 1 : x.i - y.i))
    .map((x) => x.p);

  for (const p of ordinate) {
    if (walkover(p)) continue;
    const w = voce(p.vincitore);
    const l = voce(p.perdente);
    const cw = conteggi.get(p.vincitore);
    const cl = conteggi.get(p.perdente);
    for (const chiave of ['tot', superficieDi(p.superficie)]) {
      const atteso = probElo(w[chiave], l[chiave]);
      const kw = kFattore(cw[chiave], cfg);
      const kl = kFattore(cl[chiave], cfg);
      w[chiave] += kw * (1 - atteso);
      l[chiave] -= kl * (1 - atteso);
      cw[chiave] += 1;
      cl[chiave] += 1;
    }
    w.partite.push(p.data);
    l.partite.push(p.data);
  }
  return elo;
}

// Probabilità del singolo set s tale che s²(3−2s) = p3 (funzione crescente in [0,1]).
function probSet(p3) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const m = (lo + hi) / 2;
    if (m * m * (3 - 2 * m) < p3) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export function probVittoria(eloA, eloB, superficie, bestOf, cfg = CONFIG.tennis) {
  const s = superficieDi(superficie);
  const w = cfg.pesoSuperficie;
  let p = (1 - w) * probElo(eloA.tot, eloB.tot) + w * probElo(eloA[s], eloB[s]);
  if (bestOf === 5) {
    const x = probSet(p);
    p = x ** 3 * (10 - 15 * x + 6 * x * x);
  }
  return Math.min(P_MAX, Math.max(P_MIN, p));
}

function partiteUltimoAnno(voce, oggi) {
  if (!voce) return 0;
  const fine = typeof oggi === 'string' ? Date.parse(`${oggi}T00:00:00Z`) : Date.parse(`${oggi.toISOString().slice(0, 10)}T00:00:00Z`);
  const inizio = fine - 365 * GIORNO_MS;
  return voce.partite.filter((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return t > inizio && t <= fine;
  }).length;
}

export function pesoModelloPartita(elo, a, b, oggi, cfg = CONFIG.tennis) {
  const pochi = [a, b].some((nome) => partiteUltimoAnno(elo.get(nome), oggi) < cfg.minPartite12Mesi);
  return pochi ? cfg.pesoModelloPocheDati : cfg.pesoModello;
}
