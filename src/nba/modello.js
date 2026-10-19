// Modello NBA: forze di attacco e difesa in punti (Maher con peso temporale), punti attesi,
// deviazioni standard dei residui e probabilità dei mercati con la normale.
import { CONFIG } from '../config.js';
import { pesoTemporale } from '../calcio/modelli/gol.js';

const GIORNO_MS = 86400000;
const ITERAZIONI = 50;
const EPS = 1e-6;
// Peso, in partite, dei valori della stagione precedente (riportati verso 1) per ogni squadra:
// è il prior verso cui si restringono le forze della stagione corrente. Senza stagione precedente il prior è 1.
const PARTITE_FITTIZIE = 10;
// Peso, in partite, del fattore campo e della media punti della stagione precedente.
const PARTITE_FITTIZIE_LEGA = 100;
// Media punti per squadra quando non c'è nessuna partita (solo come segnaposto).
const MEDIA_PUNTI_INIZIALE = 112;
// Partite finite minime per stimare le deviazioni standard dai residui.
const MIN_PARTITE_SD = 100;

const limita = (p) => Math.min(1 - EPS, Math.max(EPS, p));

// Φ(x) = ½·(1 + erf(x/√2)), erf di Abramowitz–Stegun 7.1.26 (errore su erf < 1,5e-7, su Φ < 7,5e-8).
export function phi(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poli = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poli * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

const valida = (x) => x.finita && Number.isFinite(x.puntiCasa) && Number.isFinite(x.puntiTrasferta);
const media = (valori) => {
  let s = 0;
  let n = 0;
  for (const v of valori) { s += v; n++; }
  return n ? s / n : 1;
};

// Maher moltiplicativo sui punti: λ_casa = media·att_c·dif_t·casa, λ_trasf = media·att_t·dif_c;
// att e dif normalizzati a media 1. Righe: { c, t, yc, yt, w }.
function adatta(righe) {
  const squadre = [...new Set(righe.flatMap((r) => [r.c, r.t]))];
  const att = new Map(squadre.map((s) => [s, 1]));
  const dif = new Map(squadre.map((s) => [s, 1]));
  const peso = new Map(squadre.map((s) => [s, 0]));
  for (const r of righe) {
    peso.set(r.c, peso.get(r.c) + r.w);
    peso.set(r.t, peso.get(r.t) + r.w);
  }
  let casa = 1;
  let mediaPunti = MEDIA_PUNTI_INIZIALE;
  const sommaW = righe.reduce((a, r) => a + r.w, 0);
  if (sommaW > 0) mediaPunti = righe.reduce((a, r) => a + r.w * (r.yc + r.yt), 0) / (2 * sommaW) || MEDIA_PUNTI_INIZIALE;

  for (let it = 0; it < ITERAZIONI && righe.length; it++) {
    const num = new Map(squadre.map((s) => [s, 0]));
    const den = new Map(squadre.map((s) => [s, 0]));
    for (const r of righe) {
      num.set(r.c, num.get(r.c) + r.w * r.yc);
      den.set(r.c, den.get(r.c) + r.w * mediaPunti * dif.get(r.t) * casa);
      num.set(r.t, num.get(r.t) + r.w * r.yt);
      den.set(r.t, den.get(r.t) + r.w * mediaPunti * dif.get(r.c));
    }
    for (const s of squadre) if (den.get(s) > 0) att.set(s, num.get(s) / den.get(s));
    const ma = media(att.values()) || 1;
    for (const s of squadre) att.set(s, att.get(s) / ma);

    for (const s of squadre) { num.set(s, 0); den.set(s, 0); }
    for (const r of righe) {
      num.set(r.t, num.get(r.t) + r.w * r.yc);
      den.set(r.t, den.get(r.t) + r.w * mediaPunti * att.get(r.c) * casa);
      num.set(r.c, num.get(r.c) + r.w * r.yt);
      den.set(r.c, den.get(r.c) + r.w * mediaPunti * att.get(r.t));
    }
    for (const s of squadre) if (den.get(s) > 0) dif.set(s, num.get(s) / den.get(s));
    const md = media(dif.values()) || 1;
    for (const s of squadre) dif.set(s, dif.get(s) / md);

    let nc = 0, dc = 0, nm = 0, dm = 0;
    for (const r of righe) {
      nc += r.w * r.yc;
      dc += r.w * mediaPunti * att.get(r.c) * dif.get(r.t);
      nm += r.w * (r.yc + r.yt);
      dm += r.w * (att.get(r.c) * dif.get(r.t) * casa + att.get(r.t) * dif.get(r.c));
    }
    if (dc > 0 && nc > 0) casa = nc / dc;
    if (dm > 0 && nm > 0) mediaPunti = nm / dm;
  }
  return { squadre, att, dif, casa, mediaPunti, peso, sommaW };
}

const righe = (partite, rif, mezzaVita) => partite.map((x) => ({
  c: x.casa, t: x.trasferta, yc: x.puntiCasa, yt: x.puntiTrasferta, w: pesoTemporale(x.dataUsa, rif, mezzaVita),
}));
const ultimaData = (partite) => partite.reduce((a, x) => (x.dataUsa > a ? x.dataUsa : a), '0000-01-01');

function deviazione(valori) {
  const n = valori.length;
  const m = valori.reduce((a, v) => a + v, 0) / n;
  return Math.sqrt(valori.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1));
}

export function stimaForzeNba(partite, { oggi, stagioneCorrente } = {}) {
  const cfg = CONFIG.nba;
  const finite = partite.filter(valida);
  const stagione = stagioneCorrente ?? finite.reduce((a, x) => Math.max(a, x.stagione), -Infinity);
  const correnti = finite.filter((x) => x.stagione === stagione);
  const precedenti = finite.filter((x) => x.stagione === stagione - 1);
  const rif = oggi ?? ultimaData(finite);

  // Stagione precedente: pesi rispetto al suo ultimo giorno, poi valori riportati verso 1.
  const prec = adatta(righe(precedenti, ultimaData(precedenti), cfg.mezzaVitaGiorni));
  const riporta = (v) => 1 + (v - 1) * (1 - cfg.regressioneStagione);
  const corr = adatta(righe(correnti, rif, cfg.mezzaVitaGiorni));

  const squadre = [...new Set([...prec.squadre, ...corr.squadre])];
  const attacco = new Map();
  const difesa = new Map();
  for (const s of squadre) {
    const priorAtt = prec.att.has(s) ? riporta(prec.att.get(s)) : 1;
    const priorDif = prec.dif.has(s) ? riporta(prec.dif.get(s)) : 1;
    const w = corr.peso.get(s) ?? 0;
    attacco.set(s, (w * (corr.att.get(s) ?? 1) + PARTITE_FITTIZIE * priorAtt) / (w + PARTITE_FITTIZIE));
    difesa.set(s, (w * (corr.dif.get(s) ?? 1) + PARTITE_FITTIZIE * priorDif) / (w + PARTITE_FITTIZIE));
  }

  // Fattore campo e media punti: stagione corrente con la precedente come pseudo-partite.
  const lega = (chiave) => {
    if (!correnti.length && !precedenti.length) return chiave === 'casa' ? 1 : MEDIA_PUNTI_INIZIALE;
    if (!precedenti.length) return corr[chiave];
    if (!correnti.length) return prec[chiave];
    return (corr.sommaW * corr[chiave] + PARTITE_FITTIZIE_LEGA * prec[chiave]) / (corr.sommaW + PARTITE_FITTIZIE_LEGA);
  };
  const casa = lega('casa');
  const mediaPunti = lega('mediaPunti');

  const partiteStagione = new Map(squadre.map((s) => [s, 0]));
  for (const x of correnti) {
    partiteStagione.set(x.casa, partiteStagione.get(x.casa) + 1);
    partiteStagione.set(x.trasferta, partiteStagione.get(x.trasferta) + 1);
  }

  // Deviazioni standard dai residui: stagione precedente contro il suo modello, corrente contro le forze finali.
  let sdMargine = cfg.sdMargine;
  let sdTotale = cfg.sdTotale;
  if (correnti.length + precedenti.length >= MIN_PARTITE_SD) {
    const resM = [];
    const resT = [];
    const aggiungi = (x, lc, lt) => {
      resM.push((x.puntiCasa - x.puntiTrasferta) - (lc - lt));
      resT.push((x.puntiCasa + x.puntiTrasferta) - (lc + lt));
    };
    for (const x of precedenti) {
      aggiungi(x, prec.mediaPunti * prec.att.get(x.casa) * prec.dif.get(x.trasferta) * prec.casa,
        prec.mediaPunti * prec.att.get(x.trasferta) * prec.dif.get(x.casa));
    }
    for (const x of correnti) {
      aggiungi(x, mediaPunti * attacco.get(x.casa) * difesa.get(x.trasferta) * casa,
        mediaPunti * attacco.get(x.trasferta) * difesa.get(x.casa));
    }
    sdMargine = deviazione(resM);
    sdTotale = deviazione(resT);
  }

  return { attacco, difesa, casa, mediaPunti, sdMargine, sdTotale, partiteStagione };
}

// Punti attesi; il back-to-back sposta |backToBack|/2 punti dalla squadra stanca all'altra.
export function puntiAttesi(forze, casa, trasferta, { b2bCasa = false, b2bTrasferta = false } = {}) {
  const { attacco, difesa } = forze;
  if (!attacco.has(casa) || !attacco.has(trasferta)) return null;
  let c = forze.mediaPunti * attacco.get(casa) * difesa.get(trasferta) * forze.casa;
  let t = forze.mediaPunti * attacco.get(trasferta) * difesa.get(casa);
  const delta = Math.abs(CONFIG.nba.backToBack) / 2;
  if (b2bCasa) { c -= delta; t += delta; }
  if (b2bTrasferta) { t -= delta; c += delta; }
  return { casa: c, trasferta: t };
}

// Vero se la squadra ha una partita (finita o no) nel giorno americano precedente a dataUsa.
export function backToBack(partite, squadra, dataUsa) {
  const ieri = new Date(Date.parse(`${dataUsa}T00:00:00Z`) - GIORNO_MS).toISOString().slice(0, 10);
  return partite.some((x) => x.dataUsa === ieri && (x.casa === squadra || x.trasferta === squadra));
}

// Linea con il segno: -4.5, +3, 0 (niente zeri finali).
export function formattaLinea(h) {
  if (h === 0) return '0';
  return h > 0 ? `+${h}` : `${h}`;
}

// Variabile intera X ≈ N(μ, σ) con la correzione di continuità.
// P(X > x) = P(X ≥ ⌊x⌋+1) e P(X < x) = P(X ≤ ⌈x⌉−1); se x è intero, X = x è il rimborso.
const sopra = (x, mu, sd) => 1 - phi((Math.floor(x) + 0.5 - mu) / sd);
const sotto = (x, mu, sd) => phi((Math.ceil(x) - 0.5 - mu) / sd);
// Probabilità condizionata al non-rimborso: [P(X > x), P(X < x)] / (1 − P(X = x)).
function coppia(x, mu, sd) {
  const s = sopra(x, mu, sd);
  const u = sotto(x, mu, sd);
  const tot = s + u;
  return tot > 0 ? [s / tot, u / tot] : [0.5, 0.5];
}

// Mercati Vincente, Handicap <linea> (riferita alla casa) e Totale punti <linea>.
// `nomi` = { casa, trasferta } con i nomi completi, per la selezione di "Vincente".
export function mercatiNba(attesi, linee, forze, nomi) {
  if (!nomi?.casa || !nomi?.trasferta) throw new Error('mercatiNba: servono i nomi delle squadre');
  const mu = attesi.casa - attesi.trasferta;
  const totale = attesi.casa + attesi.trasferta;
  const out = [];
  const add = (mercato, selezione, p) => out.push({ mercato, selezione, probModello: limita(p) });

  // Vincente: niente pareggio, si toglie P(margine = 0) e si rinormalizza.
  const [vc, vt] = coppia(0, mu, forze.sdMargine);
  add('Vincente', nomi.casa, vc);
  add('Vincente', nomi.trasferta, vt);

  // Handicap h per la casa: vince se margine + h > 0, cioè margine > −h.
  for (const h of linee.handicap ?? []) {
    const [pc, pt] = coppia(-h, mu, forze.sdMargine);
    const nome = `Handicap ${formattaLinea(h)}`;
    add(nome, 'casa', pc);
    add(nome, 'trasferta', pt);
  }
  for (const l of linee.totale ?? []) {
    const [po, pu] = coppia(l, totale, forze.sdTotale);
    add(`Totale punti ${l}`, `Over ${l}`, po);
    add(`Totale punti ${l}`, `Under ${l}`, pu);
  }
  return out;
}

// Peso del modello nella media con il mercato: ridotto se una delle due ha poche partite in stagione.
export function pesoModelloPartita(forze, casa, trasferta) {
  const cfg = CONFIG.nba;
  const n = (s) => forze.partiteStagione.get(s) ?? 0;
  return n(casa) < cfg.minPartiteStagione || n(trasferta) < cfg.minPartiteStagione ? cfg.pesoModelloInizio : cfg.pesoModello;
}
