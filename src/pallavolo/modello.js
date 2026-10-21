// Modello della pallavolo (Fase 4d §4): Elo per squadra con il margine in set, ricalcolato ogni giorno
// dalle partite salvate; dalla probabilità di vincere la partita (al meglio dei 5 set) a quella del
// singolo set per bisezione, e da lì vincente, handicap set ±1,5 e totale set 3,5.
import { CONFIG } from '../config.js';

const P = CONFIG.pallavolo;
const EPS = 1e-6;
const limita = (p) => Math.min(1 - EPS, Math.max(EPS, p));

// Peso del margine: 3-0 pesa più di 3-1, che pesa più di 3-2.
const MARGINE = { 3: 1.5, 2: 1.25, 1: 1 };

const atteso = (ra, rb) => 1 / (1 + 10 ** (-(ra - rb) / 400));

// Elo da partite { idCasa, idTrasferta, setCasa, setTrasferta, data, stagione }, in ordine di data.
// A ogni cambio di stagione tutti tornano per un terzo verso 1500. Restituisce { elo, partite } per id.
export function calcolaEloPallavolo(partite) {
  const elo = new Map();
  const giocate = new Map();
  const ordinate = [...partite].sort((a, b) => a.data.localeCompare(b.data) || String(a.id).localeCompare(String(b.id)));
  let stagione = null;
  for (const p of ordinate) {
    if (stagione !== null && p.stagione !== stagione) {
      for (const [id, r] of elo) elo.set(id, r + (P.eloIniziale - r) * P.regressioneStagione);
    }
    stagione = p.stagione;
    const rc = elo.get(p.idCasa) ?? P.eloIniziale;
    const rt = elo.get(p.idTrasferta) ?? P.eloIniziale;
    const e = atteso(rc + P.vantaggioCasa, rt);
    const vinta = p.setCasa > p.setTrasferta ? 1 : 0;
    const k = P.k * (MARGINE[Math.abs(p.setCasa - p.setTrasferta)] ?? 1);
    elo.set(p.idCasa, rc + k * (vinta - e));
    elo.set(p.idTrasferta, rt - k * (vinta - e));
    for (const id of [p.idCasa, p.idTrasferta]) giocate.set(id, (giocate.get(id) ?? 0) + 1);
  }
  return { elo, giocate };
}

// Probabilità che vinca la casa, con il vantaggio campo.
export const probPartita = (eloCasa, eloTrasferta) => atteso(eloCasa + P.vantaggioCasa, eloTrasferta);

// P(vittoria al meglio dei 5) con probabilità s di vincere ogni set.
export const vittoriaDaSet = (s) => s ** 3 * (1 + 3 * (1 - s) + 6 * (1 - s) ** 2);

// Probabilità del singolo set dalla probabilità della partita, per bisezione (la funzione è crescente).
export function setDaVittoria(p) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (vittoriaDaSet(m) < p) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// Mercati dalla probabilità della partita. Handicap riferito alla casa; `nomi` = { casa, trasferta }.
export function mercatiPallavolo(pCasa, nomi) {
  const s = setDaVittoria(pCasa);
  const t = 1 - s;
  const tre0 = s ** 3;
  const tre1 = 3 * s ** 3 * t;
  const zero3 = t ** 3;
  const uno3 = 3 * t ** 3 * s;
  const add = (mercato, selezione, p) => ({ mercato, selezione, probModello: limita(p) });
  const meno = tre0 + tre1;
  const piu = 1 - zero3 - uno3;
  const over = 1 - tre0 - zero3;
  return [
    add('Vincente', nomi.casa, pCasa),
    add('Vincente', nomi.trasferta, 1 - pCasa),
    add('Handicap set -1.5', 'casa', meno),
    add('Handicap set -1.5', 'trasferta', 1 - meno),
    add('Handicap set +1.5', 'casa', piu),
    add('Handicap set +1.5', 'trasferta', 1 - piu),
    add('Totale set 3.5', 'Over 3.5', over),
    add('Totale set 3.5', 'Under 3.5', 1 - over),
  ];
}

// Peso del modello nella media con il mercato: ridotto se una delle due ha poche partite salvate.
export function pesoModelloPallavolo(giocate, idCasa, idTrasferta) {
  const n = (id) => giocate.get(id) ?? 0;
  return Math.min(n(idCasa), n(idTrasferta)) < P.minPartitePienoPeso ? P.pesoModelloInizio : P.pesoModello;
}
