// Mercati dei gol: probabilità dalla matrice Dixon-Coles e frequenze storiche del campionato.
import { matrice, pesoTemporale } from './gol.js';

const EPS = 1e-6;
const limita = (p) => Math.min(1 - EPS, Math.max(EPS, p));

// Ogni mercato: esito(c, t) → 1 vinta, 0 persa, null rimborso. `pt` = si valuta sul primo tempo.
function definizioni() {
  const d = [];
  const add = (mercato, selezione, esito, pt = false) => d.push({ mercato, selezione, esito, pt });
  add('1X2', '1', (c, t) => +(c > t));
  add('1X2', 'X', (c, t) => +(c === t));
  add('1X2', '2', (c, t) => +(c < t));
  add('Doppia chance', '1X', (c, t) => +(c >= t));
  add('Doppia chance', '12', (c, t) => +(c !== t));
  add('Doppia chance', 'X2', (c, t) => +(c <= t));
  for (const l of [1.5, 2.5, 3.5]) {
    add(`Under/Over ${l}`, `Over ${l}`, (c, t) => +(c + t > l));
    add(`Under/Over ${l}`, `Under ${l}`, (c, t) => +(c + t < l));
  }
  for (const l of [0.5, 1.5, 2.5]) {
    add(`Under/Over casa ${l}`, `Over ${l}`, (c) => +(c > l));
    add(`Under/Over casa ${l}`, `Under ${l}`, (c) => +(c < l));
  }
  for (const l of [0.5, 1.5, 2.5]) {
    add(`Under/Over trasferta ${l}`, `Over ${l}`, (c, t) => +(t > l));
    add(`Under/Over trasferta ${l}`, `Under ${l}`, (c, t) => +(t < l));
  }
  for (const l of [0.5, 1.5]) {
    add(`Under/Over 1° tempo ${l}`, `Over ${l}`, (c, t) => +(c + t > l), true);
    add(`Under/Over 1° tempo ${l}`, `Under ${l}`, (c, t) => +(c + t < l), true);
  }
  add('Gol/No gol', 'Gol', (c, t) => +(c > 0 && t > 0));
  add('Gol/No gol', 'No gol', (c, t) => +(c === 0 || t === 0));
  for (let a = 0; a <= 4; a++) {
    for (let b = 0; b <= 4; b++) add('Risultato esatto', `${a}-${b}`, (c, t) => +(c === a && t === b));
  }
  // Handicap asiatico riferito alla squadra di casa: linea h, differenza d = c − t.
  for (const h of [-1.5, -1, -0.5, 0.5, 1, 1.5]) {
    const nome = `Handicap asiatico ${h > 0 ? '+' : ''}${h}`;
    add(nome, 'casa', (c, t) => { const v = c - t + h; return v === 0 ? null : +(v > 0); });
    add(nome, 'trasferta', (c, t) => { const v = c - t + h; return v === 0 ? null : +(v < 0); });
  }
  return d;
}
const DEFINIZIONI = definizioni();

// prob = P(vinta) / (1 − P(rimborso)); senza rimborso è la semplice P(vinta).
function probabilita(m, esito) {
  let vinta = 0;
  let rimborso = 0;
  for (let c = 0; c < m.length; c++) {
    for (let t = 0; t < m[c].length; t++) {
      const e = esito(c, t);
      if (e === null) rimborso += m[c][t];
      else if (e === 1) vinta += m[c][t];
    }
  }
  return 1 - rimborso > 0 ? vinta / (1 - rimborso) : 0.5;
}

export function mercatiGol(lambdaCasa, lambdaTrasferta, quotaPT) {
  const intera = matrice(lambdaCasa, lambdaTrasferta);
  const primoTempo = matrice(lambdaCasa * quotaPT, lambdaTrasferta * quotaPT, 0);
  return DEFINIZIONI.map(({ mercato, selezione, esito, pt }) => ({
    mercato,
    selezione,
    prob: limita(probabilita(pt ? primoTempo : intera, esito)),
  }));
}

const haPT = (x) => x.gcPT !== null && x.gcPT !== undefined && x.gtPT !== null && x.gtPT !== undefined;

// Frequenza storica pesata nel tempo: Σw·vinta / Σw·(non rimborso). Chiave 'mercato|selezione'.
export function frequenzeGol(partite, { oggi } = {}) {
  const rif = oggi ?? partite.reduce((a, x) => (x.data > a ? x.data : a), '0000-01-01');
  const pesi = partite.map((x) => pesoTemporale(x.data, rif));
  const out = new Map();
  for (const { mercato, selezione, esito, pt } of DEFINIZIONI) {
    let num = 0;
    let den = 0;
    partite.forEach((x, i) => {
      if (pt && !haPT(x)) return;
      const e = pt ? esito(x.gcPT, x.gtPT) : esito(x.gc, x.gt);
      if (e === null) return;
      den += pesi[i];
      num += pesi[i] * e;
    });
    if (den > 0) out.set(`${mercato}|${selezione}`, limita(num / den));
  }
  return out;
}
