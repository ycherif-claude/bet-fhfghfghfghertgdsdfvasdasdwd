// Collaudo di odss-api.com (bookmaker italiani): elenco dei bookmaker e quote di prova di Serie A.
// Usa circa 4 richieste delle 500 mensili. Scrive solo dati pubblici in data/collaudo/odss.json:
// la chiave non viene mai stampata né scritta (repository e log sono pubblici).
import { mkdirSync, writeFileSync } from 'node:fs';

const CHIAVE = process.env.ODSS_API_KEY;
const BASE = 'https://odss-api.com/api/v1';
const FILE = 'data/collaudo/odss.json';
// I bookmaker su cui l'utente ha un conto (nomi da cercare nelle chiavi di odss-api).
const MIEI = ['bet365', 'sportium', 'betfair', 'snai', 'goldbet', 'dazn'];

const pulisci = (t) => (CHIAVE ? String(t).replaceAll(CHIAVE, '***') : String(t));
const esito = { eseguitoAlle: new Date().toISOString(), richieste: [], errori: [] };
const mio = (chiave) => MIEI.find((m) => String(chiave).toLowerCase().includes(m)) ?? null;

async function chiama(percorso, parametri = {}) {
  const url = `${BASE}/${percorso}${Object.keys(parametri).length ? `?${new URLSearchParams(parametri)}` : ''}`;
  const r = await fetch(url, { headers: { 'x-api-key': CHIAVE, Accept: 'application/json', 'User-Agent': 'analisi-giocate (progetto personale)' }, signal: AbortSignal.timeout(30000) });
  esito.richieste.push({ percorso, parametri, status: r.status, rimaste: r.headers.get('x-ratelimit-remaining'), limite: r.headers.get('x-ratelimit-limit') });
  const testo = await r.text();
  if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status} ${pulisci(testo.slice(0, 300))}`);
  return JSON.parse(testo);
}

async function principale() {
  if (!CHIAVE) { esito.errori.push('manca il secret ODSS_API_KEY'); return; }
  const b = await chiama('bookmakers');
  const lista = Array.isArray(b) ? b : b.bookmakers ?? b.data ?? [];
  esito.bookmakerTotali = lista.length;
  esito.bookmakerItaliani = lista.filter((x) => x.playable_it || x.country === 'IT').map((x) => x.key ?? x.name);
  esito.mieiTrovati = lista.filter((x) => mio(x.key ?? x.name)).map((x) => ({ key: x.key ?? x.name, nome: x.name ?? null, italiano: x.playable_it ?? null, exchange: x.is_exchange ?? null }));

  esito.quote = {};
  for (const market of ['1x2', 'dc', 'ou']) {
    const j = await chiama('odds', { sport: 'calcio', league: 'Serie A', market, state: 'prematch', playable_it: 'true', limit: '60' });
    const righe = Array.isArray(j) ? j : j.odds ?? [];
    esito.quote[market] = {
      righe: righe.length,
      esempi: righe.slice(0, market === 'ou' ? 6 : 3).map((o) => ({
        partita: o.event ?? `${o.home_team} - ${o.away_team}`,
        lega: o.league, inizio: o.commence_time, linea: o.line ?? null, scope: o.scope ?? null,
        miei: (o.bookmakers ?? []).filter((x) => mio(x.key)).map((x) => ({ key: x.key, quote: x.outcomes, aggiornato: x.last_update })),
        altriBookmaker: (o.bookmakers ?? []).length,
      })),
    };
  }
}

try {
  await principale();
} catch (e) {
  esito.errori.push(pulisci(e?.message ?? e));
} finally {
  mkdirSync('data/collaudo', { recursive: true });
  const testo = pulisci(JSON.stringify(esito, null, 2));
  writeFileSync(FILE, `${testo}\n`);
  console.log(testo.slice(0, 6000));
}
