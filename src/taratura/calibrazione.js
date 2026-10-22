// Calibrazione dei pronostici sì/no: per ogni mercato e fascia di probabilità del modello (5 punti),
// quante volte l'esito è uscito davvero nelle stagioni passate. Calcio: 2022/23-2025/26 dai CSV di
// football-data.co.uk (forze stimate ogni settimana con i soli dati precedenti, come la raccolta), una
// tabella per gruppo [correzione B2]: campionati principali, seconde serie, campionati extra (le coppe sono
// in data/storico/elo-europeo.json). Ogni fascia ha anche la stima isotonica e il limite di Wilson (B1),
// ricalcolati comunque dai pronostici a partire da n e vera.
// Nota: il modello live usa anche gli xG (CONFIG.calcio.pesoXg), questa calibrazione no: i CSV hanno gli xG
// solo dalla stagione 2026/27. TODO (fine prova, 18/11/2026): ricalibrare sulle partite della prova,
// con gli xG, dal registro (data/registro).
// Tennis: 2025-2026 dall'Elo (data/storico-tennis, 2024 come rodaggio).
// File CSV nella cartella: <codice>_<stagione>.csv (es. I1_2425.csv, da football-data.co.uk/mmz4281/2425/I1.csv)
// e, per i campionati extra in un solo file, <codice>.csv (da football-data.co.uk/new/<codice>.csv).
// Uso: node src/taratura/calibrazione.js <cartellaCsv> [file]   (default data/taratura/calibrazione.json)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMPETIZIONI } from '../calcio/competizioni.js';
import { CONFIG } from '../config.js';
import { mercatiGol } from '../calcio/modelli/mercati-gol.js';
import { caricaLega, lambdaStagione } from './calcio.js';
import { leggiCsv } from '../calcio/csv.js';
import { partitaExtra } from '../calcio/fonti/football-data-uk.js';
import { fasceIsotoniche } from './isotonica.js';
import { carica as caricaTennis, previsioni as previsioniTennis } from './tennis.js';

const STAGIONI = ['2223', '2324', '2425', '2526'];
// Esito vero di ogni selezione con i gol finali.
export const ESITI_CALCIO = {
  '1X2|1': (c, t) => c > t,
  '1X2|X': (c, t) => c === t,
  '1X2|2': (c, t) => c < t,
  'Doppia chance|1X': (c, t) => c >= t,
  'Doppia chance|12': (c, t) => c !== t,
  'Doppia chance|X2': (c, t) => c <= t,
  'Under/Over 1.5|Over 1.5': (c, t) => c + t > 1.5,
  'Under/Over 1.5|Under 1.5': (c, t) => c + t < 1.5,
  'Under/Over 2.5|Over 2.5': (c, t) => c + t > 2.5,
  'Under/Over 2.5|Under 2.5': (c, t) => c + t < 2.5,
  'Under/Over 3.5|Over 3.5': (c, t) => c + t > 3.5,
  'Under/Over 3.5|Under 3.5': (c, t) => c + t < 3.5,
  'Gol/No gol|Gol': (c, t) => c > 0 && t > 0,
  'Gol/No gol|No gol': (c, t) => c === 0 || t === 0,
  'Under/Over casa 0.5|Over 0.5': (c) => c > 0,
  'Under/Over trasferta 0.5|Over 0.5': (c, t) => t > 0,
};

const fascia = (p) => Math.min(95, Math.floor(p * 20 + 1e-9) * 5);

function aggiungi(tabella, chiave, p, y) {
  if (p < 0.5) return;
  const t = (tabella[chiave] ??= {});
  const f = (t[fascia(p)] ??= { n: 0, veri: 0, prevista: 0 });
  f.n++;
  f.veri += y;
  f.prevista += p;
}

// Fasce di un mercato, con stima isotonica e limite di Wilson (null sotto minCampioniFascia).
function chiudiFasce(fasce) {
  const lista = Object.entries(fasce).map(([da, f]) => ({ da: Number(da) / 100, n: f.n, prevista: f.prevista / f.n, vera: f.veri / f.n }))
    .sort((a, b) => a.da - b.da);
  const iso = new Map(fasceIsotoniche(lista, CONFIG.pronostici.minCampioniFascia).map((f) => [f.da, f]));
  return lista.map((f) => ({ ...f, isotonica: iso.get(f.da)?.isotonica ?? null, limite: iso.get(f.da)?.limite ?? null }));
}
const chiudi = (tabella) => Object.fromEntries(Object.entries(tabella).map(([k, fasce]) => [k, chiudiFasce(fasce)]));

// Stagioni di un campionato (codice stagione → partite): CSV per stagione o, per gli extra, il file unico.
export function storicoLega(cartella, c) {
  if (c.formato !== 'extra') return caricaLega(cartella, c.csv, ['2021', '2122', ...STAGIONI]);
  const out = new Map();
  const f = join(cartella, `${c.csv}.csv`);
  if (!existsSync(f)) return out;
  for (const r of leggiCsv(readFileSync(f, 'utf8'))) {
    const p = partitaExtra(r);
    if (!p) continue;
    if (!out.has(p.stagione)) out.set(p.stagione, []);
    out.get(p.stagione).push(p);
  }
  return out;
}

// { principali, secondeSerie, extra }: per gruppo, mercato → fasce. I gruppi senza partite non compaiono.
export function calibrazioneCalcio(cartella) {
  const perGruppo = {};
  for (const c of COMPETIZIONI.filter((k) => k.csv && k.gruppo)) {
    const t = (perGruppo[c.gruppo] ??= {});
    const st = storicoLega(cartella, c);
    for (const s of STAGIONI) {
      for (const { x, lam } of lambdaStagione(st, s, CONFIG.calcio.mezzaVitaGiorni)) {
        for (const g of mercatiGol(lam.casa, lam.trasferta, 0.45)) {
          const k = `${g.mercato}|${g.selezione}`;
          if (ESITI_CALCIO[k]) aggiungi(t, k, g.prob, +ESITI_CALCIO[k](x.gc, x.gt));
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(perGruppo).filter(([, t]) => Object.keys(t).length).map(([g, t]) => [g, chiudi(t)]));
}

// Campionati (codici CSV) di ogni gruppo, scritti nel file per chiarezza.
export const campionatiPerGruppo = () => Object.fromEntries(['principali', 'secondeSerie', 'extra']
  .map((g) => [g, COMPETIZIONI.filter((c) => c.csv && c.gruppo === g).map((c) => c.csv)]));

// Tennis: la probabilità del giocatore indicato (sopra il 50%) contro la vittoria vera.
export function calibrazioneTennis() {
  const t = {};
  for (const partite of Object.values(caricaTennis())) {
    for (const x of previsioniTennis(partite)) {
      if (x.pm >= 0.5) aggiungi(t, 'Vincente incontro|*', x.pm, x.y);
      else aggiungi(t, 'Vincente incontro|*', 1 - x.pm, 1 - x.y);
    }
  }
  return chiudi(t);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cartella, file = 'data/taratura/calibrazione.json'] = process.argv.slice(2);
  if (!cartella) { console.error('Uso: node src/taratura/calibrazione.js <cartellaCsv> [file]'); process.exit(1); }
  const r = {
    calcolataIl: new Date().toISOString().slice(0, 10),
    metodo: 'fasce di 5 punti; isotonica (pool adjacent violators) e limite inferiore di Wilson 95% per fascia con almeno minCampioniFascia partite',
    nota: 'Il modello live usa anche gli xG (CONFIG.calcio.pesoXg), questa calibrazione no. TODO: ricalibrare a fine prova (18/11/2026).',
    gruppi: campionatiPerGruppo(),
    calcio: calibrazioneCalcio(cartella),
    tennis: calibrazioneTennis(),
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v), 1)}\n`);
  for (const [g, t] of Object.entries(r.calcio)) {
    const n = Object.values(t)[0]?.reduce((a, f) => a + f.n, 0) ?? 0;
    console.log(`calcio ${g}: ${Object.keys(t).length} mercati, ${n} partite (fasce dal 50%)`);
  }
  for (const [k, f] of Object.entries(r.tennis)) console.log(k, f.map((x) => `${x.da * 100}%: n ${x.n} vera ${(x.vera * 100).toFixed(0)}`).join(' | '));
}
