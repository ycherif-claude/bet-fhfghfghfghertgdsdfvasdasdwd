// Modello dei gol: forze di attacco e difesa (Maher con peso temporale) e matrice Dixon-Coles.
import { CONFIG } from '../../config.js';

const GIORNO_MS = 86400000;
const PARTITE_FITTIZIE = 5;
const ITERAZIONI = 50;
const PRIOR = { att: 1, dif: 1 };
const PRIOR_NEOPROMOSSA = { att: 0.85, dif: 1.15 };

// Peso w = 0.5^(giorni/mezzaVita); le partite future (o di oggi) pesano 1.
export function pesoTemporale(data, oggi, mezzaVita = CONFIG.calcio.mezzaVitaGiorni) {
  const giorni = Math.max(0, (Date.parse(`${oggi}T00:00:00Z`) - Date.parse(`${data}T00:00:00Z`)) / GIORNO_MS);
  return 0.5 ** (giorni / mezzaVita);
}

// Misura dei gol: y = pesoXg·xG + (1 − pesoXg)·gol; senza xG, i soli gol.
function misura(gol, xg, k = CONFIG.calcio.pesoXg) {
  return xg === null || xg === undefined || !Number.isFinite(xg) ? gol : k * xg + (1 - k) * gol;
}

const media = (valori) => {
  let s = 0;
  let n = 0;
  for (const v of valori) { s += v; n++; }
  return n ? s / n : 1;
};

// `mezzaVita` e `pesoXg` si possono cambiare per la prova sul passato (src/taratura); di norma vengono da CONFIG.
export function stimaForze(partite, { oggi, squadreUltimaStagione, mezzaVita = CONFIG.calcio.mezzaVitaGiorni, pesoXg = CONFIG.calcio.pesoXg } = {}) {
  const righe = partite.map((x) => ({
    c: x.casa,
    t: x.trasferta,
    yc: misura(x.gc, x.xgC, pesoXg),
    yt: misura(x.gt, x.xgT, pesoXg),
    w: pesoTemporale(x.data, oggi, mezzaVita),
  }));
  const squadre = [...new Set(righe.flatMap((r) => [r.c, r.t]))];
  const att = new Map(squadre.map((s) => [s, 1]));
  const dif = new Map(squadre.map((s) => [s, 1]));
  const pesoSquadra = new Map(squadre.map((s) => [s, 0]));
  const partiteSquadra = new Map(squadre.map((s) => [s, 0]));
  for (const r of righe) {
    pesoSquadra.set(r.c, pesoSquadra.get(r.c) + r.w);
    pesoSquadra.set(r.t, pesoSquadra.get(r.t) + r.w);
    partiteSquadra.set(r.c, partiteSquadra.get(r.c) + 1);
    partiteSquadra.set(r.t, partiteSquadra.get(r.t) + 1);
  }

  // λ_casa = mediaGol·att_c·dif_t·casa, λ_trasf = mediaGol·att_t·dif_c; att e dif hanno media 1.
  let casa = 1;
  let mediaGol = 1;
  const sommaW = righe.reduce((a, r) => a + r.w, 0);
  if (sommaW > 0) mediaGol = righe.reduce((a, r) => a + r.w * (r.yc + r.yt), 0) / (2 * sommaW) || 1;

  for (let it = 0; it < ITERAZIONI && righe.length; it++) {
    // attacchi
    const num = new Map(squadre.map((s) => [s, 0]));
    const den = new Map(squadre.map((s) => [s, 0]));
    for (const r of righe) {
      num.set(r.c, num.get(r.c) + r.w * r.yc);
      den.set(r.c, den.get(r.c) + r.w * mediaGol * dif.get(r.t) * casa);
      num.set(r.t, num.get(r.t) + r.w * r.yt);
      den.set(r.t, den.get(r.t) + r.w * mediaGol * dif.get(r.c));
    }
    for (const s of squadre) if (den.get(s) > 0) att.set(s, num.get(s) / den.get(s));
    const ma = media(att.values()) || 1;
    for (const s of squadre) att.set(s, att.get(s) / ma);

    // difese (simmetrico)
    for (const s of squadre) { num.set(s, 0); den.set(s, 0); }
    for (const r of righe) {
      num.set(r.t, num.get(r.t) + r.w * r.yc);
      den.set(r.t, den.get(r.t) + r.w * mediaGol * att.get(r.c) * casa);
      num.set(r.c, num.get(r.c) + r.w * r.yt);
      den.set(r.c, den.get(r.c) + r.w * mediaGol * att.get(r.t));
    }
    for (const s of squadre) if (den.get(s) > 0) dif.set(s, num.get(s) / den.get(s));
    const md = media(dif.values()) || 1;
    for (const s of squadre) dif.set(s, dif.get(s) / md);

    // vantaggio casa e livello medio dei gol
    let nc = 0, dc = 0, nm = 0, dm = 0;
    for (const r of righe) {
      nc += r.w * r.yc;
      dc += r.w * mediaGol * att.get(r.c) * dif.get(r.t);
      nm += r.w * (r.yc + r.yt);
      dm += r.w * (att.get(r.c) * dif.get(r.t) * casa + att.get(r.t) * dif.get(r.c));
    }
    if (dc > 0 && nc > 0) casa = nc / dc;
    if (dm > 0 && nm > 0) mediaGol = nm / dm;
  }

  // Restringimento verso il prior con 5 partite fittizie.
  const ultima = squadreUltimaStagione instanceof Set ? squadreUltimaStagione : null;
  const attacco = new Map();
  const difesa = new Map();
  for (const s of squadre) {
    const prior = ultima && !ultima.has(s) ? PRIOR_NEOPROMOSSA : PRIOR;
    const w = pesoSquadra.get(s);
    attacco.set(s, (w * att.get(s) + PARTITE_FITTIZIE * prior.att) / (w + PARTITE_FITTIZIE));
    difesa.set(s, (w * dif.get(s) + PARTITE_FITTIZIE * prior.dif) / (w + PARTITE_FITTIZIE));
  }

  // Quota dei gol nel primo tempo (pesata), solo dalle righe con il parziale.
  let golPT = 0, golTot = 0;
  for (const x of partite) {
    if (x.gcPT === null || x.gcPT === undefined || x.gtPT === null || x.gtPT === undefined) continue;
    const w = pesoTemporale(x.data, oggi, mezzaVita);
    golPT += w * (x.gcPT + x.gtPT);
    golTot += w * (x.gc + x.gt);
  }
  const quotaPT = golTot > 0 ? Math.min(0.9, Math.max(0.1, golPT / golTot)) : 0.45;

  return { attacco, difesa, casa, mediaGol, quotaPT, partiteSquadra };
}

export function lambda(forze, casa, trasferta) {
  const { attacco, difesa } = forze;
  if (!attacco.has(casa) || !attacco.has(trasferta)) return null;
  return {
    casa: forze.mediaGol * attacco.get(casa) * difesa.get(trasferta) * forze.casa,
    trasferta: forze.mediaGol * attacco.get(trasferta) * difesa.get(casa),
  };
}

export function poisson(k, l) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return Math.exp(-l) * l ** k / f;
}

// Matrice dei risultati [gol casa][gol trasferta] da 0 a golMaxMatrice, con τ di Dixon-Coles.
export function matrice(lambdaCasa, lambdaTrasferta, rho = CONFIG.calcio.rho) {
  const n = CONFIG.calcio.golMaxMatrice;
  const m = [];
  let somma = 0;
  for (let c = 0; c <= n; c++) {
    const riga = [];
    for (let t = 0; t <= n; t++) {
      let tau = 1;
      if (c === 0 && t === 0) tau = 1 - lambdaCasa * lambdaTrasferta * rho;
      else if (c === 0 && t === 1) tau = 1 + lambdaCasa * rho;
      else if (c === 1 && t === 0) tau = 1 + lambdaTrasferta * rho;
      else if (c === 1 && t === 1) tau = 1 - rho;
      const v = Math.max(0, tau) * poisson(c, lambdaCasa) * poisson(t, lambdaTrasferta);
      riga.push(v);
      somma += v;
    }
    m.push(riga);
  }
  return m.map((r) => r.map((v) => v / somma));
}
