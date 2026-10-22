// Metodo appreso (calcio): per ogni esito (1, X, 2, Over 2.5, Under 2.5) una regressione logistica impara
// dalle ultime 2 stagioni quanto vale davvero la probabilità di Pinnacle, il modello Dixon-Coles, la forma
// (tiri in porta) e la quota migliore dei bookmaker ADM (bet365, bwin). Poi si gioca dove
// probabilità appresa × quota ADM − 1 supera una soglia.
// Scelte (penalità, soglia) solo sulla stagione 2023/24; verifica una volta sola su 2024/25 e 2025/26,
// ognuna con il modello addestrato sulle 2 stagioni precedenti.
// Uso: node src/taratura/appreso.js <cartellaCsv> [cartellaUscita]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMPETIZIONI } from '../calcio/competizioni.js';
import { caricaLega, lambdaStagione } from './calcio.js';
import { matrice } from '../calcio/modelli/gol.js';
import { addestra } from './regressione.js';
import { media, perdita } from './metriche.js';

const STAGIONI = ['2122', '2223', '2324', '2425', '2526'];
const VALIDAZIONE = '2324';
const VERIFICA = ['2425', '2526'];
const ESITI = ['1', 'X', '2', 'Over', 'Under'];
const ALFA_FORMA = 0.15;
const logit = (p) => Math.log(Math.max(1e-6, Math.min(1 - 1e-6, p)) / (1 - Math.max(1e-6, Math.min(1 - 1e-6, p))));
const precedente = (s) => {
  const a = Number(s.slice(0, 2)) - 1;
  return `${String(a).padStart(2, '0')}${String(a + 1).padStart(2, '0')}`;
};
const equa = (q) => {
  const inv = q.map((x) => 1 / x);
  const t = inv.reduce((a, x) => a + x, 0);
  return inv.map((x) => x / t);
};

// Forma: media mobile esponenziale di tiri in porta fatti e subiti e di gol, aggiornata dopo ogni partita.
function conForma(partite) {
  const st = new Map();
  const voce = (s) => {
    if (!st.has(s)) st.set(s, { tpF: 4, tpS: 4, gF: 1.3, gS: 1.3 });
    return st.get(s);
  };
  const ordinate = [...partite].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const out = new Map();
  for (const x of ordinate) {
    const c = voce(x.casa);
    const t = voce(x.trasferta);
    out.set(x, { casa: { ...c }, trasferta: { ...t } });
    const agg = (v, f, s, gf, gs) => {
      if (f !== null && s !== null) { v.tpF += ALFA_FORMA * (f - v.tpF); v.tpS += ALFA_FORMA * (s - v.tpS); }
      v.gF += ALFA_FORMA * (gf - v.gF); v.gS += ALFA_FORMA * (gs - v.gS);
    };
    agg(c, x.tiriPortaC, x.tiriPortaT, x.gc, x.gt);
    agg(t, x.tiriPortaT, x.tiriPortaC, x.gt, x.gc);
  }
  return out;
}

function probDC(lam) {
  const m = matrice(lam.casa, lam.trasferta);
  let p1 = 0, px = 0, p2 = 0, over = 0;
  for (let c = 0; c < m.length; c++) {
    for (let t = 0; t < m[c].length; t++) {
      if (c > t) p1 += m[c][t]; else if (c === t) px += m[c][t]; else p2 += m[c][t];
      if (c + t > 2.5) over += m[c][t];
    }
  }
  return [p1, px, p2, over, 1 - over];
}

// Righe (una per esito di ogni partita) con caratteristiche note la mattina della partita.
export function righeLega(stagioni, nome, priorita, mezzaVita = 365) {
  const tutte = [...stagioni.values()].flat();
  const forma = conForma(tutte);
  const out = [];
  for (const s of STAGIONI) {
    if (!stagioni.has(s)) continue;
    for (const { x, lam } of lambdaStagione(stagioni, s, mezzaVita)) {
      const q = x.quote;
      if (!q.pinnacle1x2 || !q.pinnacleOU) continue;
      const pin = [...equa(q.pinnacle1x2), ...equa(q.pinnacleOU)];
      const chiusura = [...(q.pinnacleChiusura1x2 ? equa(q.pinnacleChiusura1x2) : [null, null, null]), ...(q.pinnacleChiusuraOU ? equa(q.pinnacleChiusuraOU) : [null, null])];
      const margine1x2 = q.pinnacle1x2.reduce((a, v) => a + 1 / v, 0) - 1;
      const margineOU = q.pinnacleOU.reduce((a, v) => a + 1 / v, 0) - 1;
      const adm = [0, 1, 2].map((i) => Math.max(q.bet3651x2?.[i] ?? 0, q.bwin1x2?.[i] ?? 0));
      adm.push(q.bet365OU?.[0] ?? 0, q.bet365OU?.[1] ?? 0);
      const dc = probDC(lam);
      const f = forma.get(x);
      const diffTiri = (f.casa.tpF - f.casa.tpS) - (f.trasferta.tpF - f.trasferta.tpS);
      const sommaGol = f.casa.gF + f.casa.gS + f.trasferta.gF + f.trasferta.gS;
      const sommaTiri = f.casa.tpF + f.casa.tpS + f.trasferta.tpF + f.trasferta.tpS;
      const veri = [x.gc > x.gt, x.gc === x.gt, x.gc < x.gt, x.gc + x.gt > 2.5, x.gc + x.gt < 2.5].map(Number);
      for (let i = 0; i < 5; i++) {
        if (!(adm[i] > 1)) continue;
        const segno = i === 2 ? -1 : i === 1 ? 0 : 1;
        const segnoOU = i === 3 ? 1 : i === 4 ? -1 : 0;
        out.push({
          lega: nome, stagione: s, data: x.data, partita: `${x.casa} - ${x.trasferta}`, esito: ESITI[i], y: veri[i],
          pin: pin[i], chiusura: chiusura[i], quota: adm[i],
          caratteristiche: [
            logit(pin[i]),
            logit(dc[i]) - logit(pin[i]),
            Math.log(adm[i] * pin[i]),
            i < 3 ? margine1x2 : margineOU,
            i < 3 ? segno * diffTiri : 0,
            i >= 3 ? segnoOU * (sommaGol - 5.2) : 0,
            i >= 3 ? segnoOU * (sommaTiri - 16) : 0,
            priorita,
          ],
        });
      }
    }
  }
  return out;
}

function addestraPerEsito(righe, l2) {
  const modelli = new Map();
  for (const e of ESITI) {
    const r = righe.filter((x) => x.esito === e);
    if (r.length > 100) modelli.set(e, addestra(r.map((x) => x.caratteristiche), r.map((x) => x.y), { l2 }));
  }
  return modelli;
}

// Previsioni della stagione `s` con il modello addestrato sulle 2 stagioni precedenti.
export function prevediStagione(righe, s, l2) {
  const s1 = precedente(s);
  const s2 = precedente(s1);
  const modelli = addestraPerEsito(righe.filter((x) => x.stagione === s1 || x.stagione === s2), l2);
  return righe.filter((x) => x.stagione === s && modelli.has(x.esito)).map((x) => ({ ...x, p: modelli.get(x.esito).prevedi(x.caratteristiche) }));
}

// Giocate: al massimo una per mercato (1X2 e Under/Over) di ogni partita, quella con il value più alto.
export function giocate(prev, soglia, campo = 'p') {
  const migliori = new Map();
  for (const x of prev) {
    const v = x[campo] * x.quota - 1;
    if (v < soglia) continue;
    const chiave = `${x.lega}|${x.data}|${x.partita}|${x.esito === 'Over' || x.esito === 'Under' ? 'ou' : '1x2'}`;
    const cur = migliori.get(chiave);
    if (!cur || v > cur.v) migliori.set(chiave, { ...x, v });
  }
  return [...migliori.values()];
}

export function bilancio(g) {
  const n = g.length;
  if (!n) return { giocate: 0 };
  const utili = g.map((x) => (x.y ? x.quota - 1 : -1));
  const r = media(utili);
  const sd = Math.sqrt(utili.reduce((a, u) => a + (u - r) ** 2, 0) / Math.max(1, n - 1));
  const conC = g.filter((x) => x.chiusura);
  return {
    giocate: n,
    vinte: g.filter((x) => x.y).length / n,
    quotaMedia: media(g.map((x) => x.quota)),
    rendimento: r,
    errore: sd / Math.sqrt(n),
    clv: conC.length ? media(conC.map((x) => x.quota * x.chiusura - 1)) : null,
  };
}

export function provaAppreso(cartella) {
  const righe = [];
  for (const c of COMPETIZIONI.filter((k) => k.csv)) {
    const stagioni = caricaLega(cartella, c.csv, ['1920', '2021', ...STAGIONI]);
    righe.push(...righeLega(stagioni, c.nome, c.priorita));
  }
  // Scelta di penalità e soglia sulla sola stagione di validazione.
  const scelte = [];
  for (const l2 of [0.1, 1, 10, 100, 1000]) {
    const prev = prevediStagione(righe, VALIDAZIONE, l2);
    const ll = media(prev.map((x) => perdita(x.y ? x.p : 1 - x.p)));
    for (const soglia of [0.02, 0.05, 0.08, 0.12]) scelte.push({ l2, soglia, perdita: ll, ...bilancio(giocate(prev, soglia)) });
  }
  const valide = scelte.filter((x) => x.giocate >= 100);
  const scelta = valide.reduce((a, x) => (x.rendimento > a.rendimento ? x : a), valide[0]);
  const verifica = VERIFICA.flatMap((s) => prevediStagione(righe, s, scelta.l2));
  const perdite = {
    appreso: media(verifica.map((x) => perdita(x.y ? x.p : 1 - x.p))),
    pinnacle: media(verifica.map((x) => perdita(x.y ? x.pin : 1 - x.pin))),
  };
  const perStagione = Object.fromEntries(VERIFICA.map((s) => [s, bilancio(giocate(verifica.filter((x) => x.stagione === s), scelta.soglia))]));
  const perEsito = Object.fromEntries(ESITI.map((e) => [e, bilancio(giocate(verifica.filter((x) => x.esito === e), scelta.soglia))]));
  return {
    righe: righe.length,
    scelteValidazione: scelte,
    scelta: { l2: scelta.l2, soglia: scelta.soglia, rendimentoValidazione: scelta.rendimento, giocateValidazione: scelta.giocate },
    perditaVerifica: perdite,
    verifica: bilancio(giocate(verifica, scelta.soglia)),
    perStagione,
    perEsito,
    // Confronto: senza modello, solo quota ADM contro la probabilità equa di Pinnacle.
    soloPinnacle: Object.fromEntries([0.02, 0.05, 0.08].map((s) => [s, bilancio(giocate(verifica, s, 'pin'))])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cartella, uscita = 'data/taratura'] = process.argv.slice(2);
  if (!cartella) { console.error('Uso: node src/taratura/appreso.js <cartellaCsv> [cartellaUscita]'); process.exit(1); }
  const r = provaAppreso(cartella);
  mkdirSync(uscita, { recursive: true });
  writeFileSync(join(uscita, 'appreso.json'), `${JSON.stringify(r, null, 2)}\n`);
  console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v), 1));
}
