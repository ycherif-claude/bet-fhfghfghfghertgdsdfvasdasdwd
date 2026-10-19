// Modello di angoli e cartellini: attesa per squadra (attacco · difesa avversaria / media di campionato),
// poi Poisson o binomiale negativa sul totale della partita.
import { CONFIG } from '../../config.js';
import { pesoTemporale, poisson } from './gol.js';

const MIN_PARTITE_SQUADRA = 3;
const SOGLIA_SOVRADISPERSIONE = 1.2;
const CAP = 40;
const EPS = 1e-6;

const LINEE = {
  Angoli: { campi: ['angoliC', 'angoliT'], linee: [8.5, 9.5, 10.5, 11.5], arbitro: false },
  Cartellini: { campi: ['cartC', 'cartT'], linee: [3.5, 4.5, 5.5], arbitro: true },
};

const limita = (p) => Math.min(1 - EPS, Math.max(EPS, Number.isFinite(p) ? p : 0.5));
const valido = (v) => typeof v === 'number' && Number.isFinite(v);

// Media pesata; `ripiego` se non c'è peso.
function mediaPesata(coppie, ripiego) {
  let s = 0;
  let w = 0;
  for (const [v, p] of coppie) { s += v * p; w += p; }
  return w > 0 ? s / w : ripiego;
}

// P(totale <= k) con totale ~ Poisson(m) oppure binomiale negativa (media m, rapporto varianza/media r).
export function cdf(k, m, r) {
  let somma = 0;
  if (r > SOGLIA_SOVRADISPERSIONE) {
    const dim = m / (r - 1);
    const p = 1 / r;
    let pmf = p ** dim;
    for (let i = 0; i <= Math.min(k, CAP); i++) {
      somma += pmf;
      pmf *= ((i + dim) / (i + 1)) * (1 - p);
    }
  } else {
    for (let i = 0; i <= Math.min(k, CAP); i++) somma += poisson(i, m);
  }
  return Math.min(1, somma);
}

function statistica(partite, casa, trasferta, oggi, [fc, ft], linee, arbitro, usaArbitro) {
  const righe = [];
  for (const x of partite) {
    if (!valido(x[fc]) || !valido(x[ft])) continue;
    righe.push({ x, c: x[fc], t: x[ft], w: pesoTemporale(x.data, oggi) });
  }
  const n = (s) => righe.filter((r) => r.x.casa === s || r.x.trasferta === s).length;
  if (n(casa) < MIN_PARTITE_SQUADRA || n(trasferta) < MIN_PARTITE_SQUADRA) return null;

  const mC = mediaPesata(righe.map((r) => [r.c, r.w]), 0);
  const mT = mediaPesata(righe.map((r) => [r.t, r.w]), 0);
  if (!(mC > 0) || !(mT > 0)) return null;
  const sel = (f, g) => righe.filter(f).map(g);
  const fattiCasa = mediaPesata(sel((r) => r.x.casa === casa, (r) => [r.c, r.w]), mC);
  const subitiCasa = mediaPesata(sel((r) => r.x.casa === casa, (r) => [r.t, r.w]), mT);
  const fattiTrasf = mediaPesata(sel((r) => r.x.trasferta === trasferta, (r) => [r.t, r.w]), mT);
  const subitiTrasf = mediaPesata(sel((r) => r.x.trasferta === trasferta, (r) => [r.c, r.w]), mC);
  let attesa = (fattiCasa * subitiTrasf) / mC + (fattiTrasf * subitiCasa) / mT;

  const tot = righe.map((r) => [r.c + r.t, r.w]);
  const mediaTot = mediaPesata(tot, 0);
  if (usaArbitro && arbitro) {
    const sue = righe.filter((r) => r.x.arbitro === arbitro);
    if (sue.length >= CONFIG.calcio.minPartiteArbitro && mediaTot > 0) {
      attesa *= mediaPesata(sue.map((r) => [r.c + r.t, r.w]), mediaTot) / mediaTot;
    }
  }
  if (!(attesa > 0)) return null;

  const varianza = mediaPesata(righe.map((r) => [(r.c + r.t - mediaTot) ** 2, r.w]), 0);
  const rapporto = mediaTot > 0 ? varianza / mediaTot : 1;

  const risultato = [];
  for (const linea of linee) {
    const k = Math.floor(linea);
    const under = cdf(k, attesa, rapporto);
    const freqOver = mediaPesata(righe.map((r) => [r.c + r.t > linea ? 1 : 0, r.w]), 0.5);
    risultato.push({ linea, pOver: limita(1 - under), pUnder: limita(under), fOver: limita(freqOver), fUnder: limita(1 - freqOver) });
  }
  return risultato;
}

export function mercatiConteggi(partite, casa, trasferta, { oggi, arbitro = null } = {}) {
  if (!oggi) throw new Error('oggi mancante');
  const out = [];
  for (const [nome, def] of Object.entries(LINEE)) {
    const r = statistica(partite, casa, trasferta, oggi, def.campi, def.linee, arbitro, def.arbitro);
    if (!r) continue;
    for (const l of r) {
      const mercato = `${nome} Under/Over ${l.linea}`;
      out.push({ mercato, selezione: `Over ${l.linea}`, prob: l.pOver, frequenzaCampionato: l.fOver });
      out.push({ mercato, selezione: `Under ${l.linea}`, prob: l.pUnder, frequenzaCampionato: l.fUnder });
    }
  }
  return out;
}
