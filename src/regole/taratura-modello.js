// Taratura automatica del nostro modello [utente, 29/10/2026]: ogni mattina, per ogni sport, si confronta la
// probabilità del modello delle partite già chiuse (coppie e multiple) con i risultati e se ne ricava una
// correzione p' = σ(a + b·logit p). La correzione è "trattenuta" verso nessuna correzione (a = 0, b = 1) con una
// penalità: con pochi dati cambia poco, con tanti segue i risultati. Sotto `minPartite` partite non si corregge.
// Serve solo allo studio (coppie "modello" e "confermate"): le giocate mostrate non la usano.
import { CONFIG } from '../config.js';
import { gambeDelGiorno } from './mercati-partite.js';

const T = CONFIG.taraturaModello;
const LIM = 1e-4;
const logit = (p) => {
  const q = Math.min(1 - LIM, Math.max(LIM, p));
  return Math.log(q / (1 - q));
};
const sigmoide = (z) => 1 / (1 + Math.exp(-z));
const arrotonda = (x, cifre = 4) => Math.round(x * 10 ** cifre) / 10 ** cifre;

// Coppie (probabilità del modello, risultato 0/1) per sport dalle partite chiuse delle giornate.
export function datiTaratura(giornate) {
  const perSport = {};
  for (const giornata of giornate) {
    for (const g of gambeDelGiorno(giornata)) {
      if (typeof g.probModello !== 'number' || !Number.isFinite(g.probModello)) continue;
      if (g.esito !== 'vinta' && g.esito !== 'persa') continue;
      (perSport[g.sport] ??= []).push([g.probModello, g.esito === 'vinta' ? 1 : 0]);
    }
  }
  return perSport;
}

// a e b con il metodo di Newton; la penalità `forza` tira verso a = 0, b = 1.
export function stimaCorrezione(righe, forza = T.forza) {
  let a = 0;
  let b = 1;
  for (let it = 0; it < 50; it++) {
    let ga = forza * a;
    let gb = forza * (b - 1);
    let haa = forza;
    let hab = 0;
    let hbb = forza;
    for (const [p, y] of righe) {
      const x = logit(p);
      const q = sigmoide(a + b * x);
      const e = q - y;
      const s = q * (1 - q);
      ga += e;
      gb += e * x;
      haa += s;
      hab += s * x;
      hbb += s * x * x;
    }
    const det = haa * hbb - hab * hab;
    if (!(det > 0)) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9) break;
  }
  return { a: arrotonda(a), b: arrotonda(b) };
}

// Correzioni per sport: { calcio: { a, b, partite }, ... } solo per gli sport con almeno minPartite partite.
export function calcolaTaratura(giornate) {
  const out = {};
  for (const [sport, righe] of Object.entries(datiTaratura(giornate))) {
    if (righe.length < T.minPartite) continue;
    out[sport] = { ...stimaCorrezione(righe), partite: righe.length };
  }
  return out;
}

// Probabilità corretta di una partita; null se lo sport non ha (ancora) una correzione o manca il modello.
export function tara(taratura, sport, p) {
  const t = taratura?.[sport];
  if (!t || typeof p !== 'number' || !Number.isFinite(p)) return null;
  return arrotonda(sigmoide(t.a + t.b * logit(p)));
}
