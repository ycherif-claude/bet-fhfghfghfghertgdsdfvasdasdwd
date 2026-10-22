// Elo europeo per le coppe [utente, 22/10/2026]: un solo punteggio per tutti i club, dalle partite dei
// campionati con storico (CSV di football-data.co.uk) e da quelle delle coppe europee (ESPN), in ordine di data.
// I campionati restano collegati tra loro solo attraverso le coppe, come nell'Elo dei club (clubelo).
// Dal punteggio: gol attesi con una regressione di Poisson stimata sulle coppe passate, poi la matrice Dixon-Coles.
import { matrice } from '../calcio/modelli/gol.js';

// Punteggio iniziale per campionato (prima stagione 2021/22), più o meno nell'ordine del ranking UEFA;
// le seconde serie partono più in basso. Le squadre viste solo in coppa partono da SOLO_COPPE.
export const PRIOR = {
  E0: 1750, SP1: 1720, I1: 1700, D1: 1700, F1: 1650, P1: 1620, N1: 1620, B1: 1580, T1: 1560,
  G1: 1530, AUT: 1540, SC0: 1520, DNK: 1520, SWZ: 1520, NOR: 1490, POL: 1480, SWE: 1480, ROU: 1450, IRL: 1380, FIN: 1380,
  E1: 1600, SP2: 1560, I2: 1540, D2: 1560, F2: 1500, E2: 1480, E3: 1400, EC: 1330, SC1: 1380, SC2: 1300, SC3: 1250,
  ARG: 1500, BRA: 1550, MEX: 1450, USA: 1450, JPN: 1450, CHN: 1350,
};
export const SOLO_COPPE = 1420;
// Scelti sulle coppe 2023/24-2024/25, verificati su 2025/26-2026/27 (log-loss 1X2 0,943 contro 1,030 delle frequenze).
export const PARAMETRI = { K: 30, H: 50 };

const margine = (gd) => (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);
export const attesa = (delta) => 1 / (1 + 10 ** (-delta / 400));

// partite: [{ data, casa, trasferta, gc, gt, codice?, neutro? }] in ordine di data (casa/trasferta = id).
// `primaDi(p, delta)`: chiamata prima di aggiornare (delta = differenza con il vantaggio casa).
export function calcolaElo(partite, { K = PARAMETRI.K, H = PARAMETRI.H, primaDi } = {}) {
  const r = new Map();
  const voce = (id, codice) => {
    if (!r.has(id)) r.set(id, codice ? PRIOR[codice] ?? SOLO_COPPE : SOLO_COPPE);
    return r.get(id);
  };
  for (const p of partite) {
    const rc = voce(p.casa, p.codice);
    const rt = voce(p.trasferta, p.codice);
    const delta = rc - rt + (p.neutro ? 0 : H);
    if (primaDi) primaDi(p, delta);
    if (p.gc === null || p.gc === undefined) continue;
    const s = p.gc > p.gt ? 1 : p.gc === p.gt ? 0.5 : 0;
    const d = K * margine(Math.abs(p.gc - p.gt)) * (s - attesa(delta));
    r.set(p.casa, rc + d);
    r.set(p.trasferta, rt - d);
  }
  return r;
}

// Regressione di Poisson log λ = a + b·x (x = delta/400), metodo di Newton.
export function poissonLineare(x, y, iterazioni = 30) {
  let a = Math.log(y.reduce((s, v) => s + v, 0) / y.length || 1);
  let b = 0;
  for (let it = 0; it < iterazioni; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (let i = 0; i < x.length; i++) {
      const l = Math.exp(a + b * x[i]);
      ga += y[i] - l; gb += (y[i] - l) * x[i];
      haa += l; hab += l * x[i]; hbb += l * x[i] * x[i];
    }
    const det = haa * hbb - hab * hab;
    if (!det) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  return { a, b };
}

// Gol attesi: { casa: {a, b}, trasferta: {a, b} } stimati sulle coppe; la trasferta usa −x.
export function stimaGol(campioni) {
  const x = campioni.map((c) => c.delta / 400);
  return {
    casa: poissonLineare(x, campioni.map((c) => c.gc)),
    trasferta: poissonLineare(x.map((v) => -v), campioni.map((c) => c.gt)),
  };
}

export function lambdaCoppa(gol, delta) {
  const x = delta / 400;
  return { casa: Math.exp(gol.casa.a + gol.casa.b * x), trasferta: Math.exp(gol.trasferta.a + gol.trasferta.b * -x) };
}

export { matrice };
