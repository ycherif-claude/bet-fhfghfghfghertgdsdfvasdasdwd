// Collaudo di odss-api per basket (NBA, Eurolega, NBL), tennis e pallavolo: periodi, mercati, chiavi degli esiti,
// linee degli handicap e nomi delle squadre. Circa 8-10 richieste. Scrive solo dati pubblici in
// data/collaudo/odss-sport.json; la chiave non viene mai stampata né scritta.
import { mkdirSync, writeFileSync } from 'node:fs';

const CHIAVE = process.env.ODSS_API_KEY;
const BASE = 'https://odss-api.com/api/v1';
const FILE = 'data/collaudo/odss-sport.json';
const pulisci = (t) => (CHIAVE ? String(t).replaceAll(CHIAVE, '***') : String(t));
const esito = { eseguitoAlle: new Date().toISOString(), richieste: [], errori: [], sport: {} };

async function chiama(parametri) {
  const r = await fetch(`${BASE}/odds?${new URLSearchParams({ state: 'prematch', limit: '400', ...parametri })}`,
    { headers: { 'x-api-key': CHIAVE, Accept: 'application/json', 'User-Agent': 'analisi-giocate (progetto personale)' }, signal: AbortSignal.timeout(30000) });
  esito.richieste.push({ parametri, status: r.status, rimaste: r.headers.get('x-ratelimit-remaining') });
  const testo = await r.text();
  if (!r.ok) throw new Error(`odds ${JSON.stringify(parametri)}: HTTP ${r.status} ${pulisci(testo.slice(0, 200))}`);
  const j = JSON.parse(testo);
  return { count: j.count, righe: j.odds ?? [] };
}

function riassumi(righe) {
  const perEvento = new Map();
  for (const o of righe) {
    const k = o.event_id ?? o.event;
    if (!perEvento.has(k)) perEvento.set(k, []);
    perEvento.get(k).push(o);
  }
  const esempi = [...perEvento.values()].slice(0, 3).map((rr) => ({
    evento: rr[0].event, lega: rr[0].league, casa: rr[0].home_team, trasferta: rr[0].away_team, inizio: rr[0].commence_time,
    righe: rr.slice(0, 12).map((o) => {
      const pin = (o.bookmakers ?? []).find((b) => b.key === 'pinnacle');
      const mio = (o.bookmakers ?? []).find((b) => ['snai', 'goldbet', 'sportium', 'daznbet', 'bet365'].includes(b.key));
      return { market: o.market, scope: o.scope, period: o.period, line: o.line, pinnacle: pin?.outcomes ?? null, mio: mio ? { key: mio.key, outcomes: mio.outcomes } : null, libri: (o.bookmakers ?? []).length };
    }),
  }));
  return {
    righe: righe.length,
    mercatiPeriodi: [...new Set(righe.map((o) => `${o.market}|${o.scope}|${o.period}`))],
    chiaviEsiti: [...new Set(righe.flatMap((o) => (o.bookmakers ?? []).flatMap((b) => Object.keys(b.outcomes ?? {})).map((x) => `${o.market}:${x}`)))].slice(0, 40),
    leghe: [...new Set(righe.map((o) => o.league))].slice(0, 25),
    esempi,
  };
}

const PROVE = [
  { nome: 'basket NBA', parametri: { sport: 'basket', league: 'NBA' } },
  { nome: 'basket Eurolega', parametri: { sport: 'basket', league: 'Euroleague' } },
  { nome: 'basket NBL', parametri: { sport: 'basket', league: 'NBL' } },
  { nome: 'tennis', parametri: { sport: 'tennis' } },
  { nome: 'volley', parametri: { sport: 'volley' } },
];

async function principale() {
  if (!CHIAVE) { esito.errori.push('manca il secret ODSS_API_KEY'); return; }
  for (const p of PROVE) {
    try {
      const { count, righe } = await chiama(p.parametri);
      esito.sport[p.nome] = { count, ...riassumi(righe) };
    } catch (e) {
      esito.errori.push(pulisci(e?.message ?? e));
    }
  }
}

try {
  await principale();
} finally {
  mkdirSync('data/collaudo', { recursive: true });
  const testo = pulisci(JSON.stringify(esito, null, 2));
  writeFileSync(FILE, `${testo}\n`);
  console.log(testo.slice(0, 4000));
}
