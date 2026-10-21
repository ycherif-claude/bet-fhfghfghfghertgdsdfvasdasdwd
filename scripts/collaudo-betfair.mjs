// Collaudo dell'API di Betfair Exchange (conto italiano, chiave ritardata): login, copertura e quote di prova.
// Scrive solo dati pubblici (partite, quote, soldi abbinati, conteggi) in data/collaudo/betfair.json.
// Non stampa e non scrive mai chiave, utente, password o token di sessione: repository e log sono pubblici.
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.BETFAIR_APP_KEY;
const UTENTE = process.env.BETFAIR_USERNAME;
const PASSWORD = process.env.BETFAIR_PASSWORD;
const LOGIN = 'https://identitysso.betfair.it/api/login';
const LOGOUT = 'https://identitysso.betfair.it/api/logout';
const API = 'https://api.betfair.com/exchange/betting/json-rpc/v1';
const FILE = 'data/collaudo/betfair.json';

const segreti = [APP, UTENTE, PASSWORD].filter(Boolean);
let token = null;
const pulisci = (t) => [...segreti, token].filter(Boolean).reduce((s, x) => s.replaceAll(x, '***'), String(t));
const esito = { eseguitoAlle: new Date().toISOString(), login: null, errori: [] };

function salva() {
  mkdirSync('data/collaudo', { recursive: true });
  writeFileSync(FILE, `${pulisci(JSON.stringify(esito, null, 2))}\n`);
  console.log(pulisci(JSON.stringify(esito, null, 2)).slice(0, 6000));
}

async function chiama(metodo, params) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'X-Application': APP, 'X-Authentication': token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: `SportsAPING/v1.0/${metodo}`, params, id: 1 }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.error) throw new Error(`${metodo}: HTTP ${r.status} ${pulisci(JSON.stringify(j?.error ?? j ?? '')).slice(0, 300)}`);
  return j.result;
}

async function principale() {
  if (!APP || !UTENTE || !PASSWORD) {
    esito.login = 'mancano i secrets BETFAIR_APP_KEY, BETFAIR_USERNAME o BETFAIR_PASSWORD';
    return;
  }
  const r = await fetch(LOGIN, {
    method: 'POST',
    headers: { 'X-Application': APP, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: UTENTE, password: PASSWORD }),
    signal: AbortSignal.timeout(30000),
  });
  const testo = await r.text();
  let j = null;
  try { j = JSON.parse(testo); } catch { /* risposta non JSON */ }
  if (j?.status !== 'SUCCESS' || !j?.token) {
    esito.login = `fallito: HTTP ${r.status} ${pulisci(j?.error ?? j?.status ?? testo.slice(0, 200))}`;
    return;
  }
  token = j.token;
  esito.login = 'riuscito';

  const ora = new Date();
  const fra48 = new Date(ora.getTime() + 48 * 3600 * 1000);
  const finestra = { from: ora.toISOString(), to: fra48.toISOString() };

  // Copertura: partite per sport e competizioni di calcio nelle prossime 48 ore.
  const sport = await chiama('listEventTypes', { filter: { marketStartTime: finestra } });
  esito.sport48ore = sport.map((s) => ({ sport: s.eventType.name, mercati: s.marketCount })).sort((a, b) => b.mercati - a.mercati).slice(0, 15);
  const comp = await chiama('listCompetitions', { filter: { eventTypeIds: ['1'], marketStartTime: finestra } });
  esito.competizioniCalcio48ore = comp.length;
  esito.esempiCompetizioni = comp.sort((a, b) => b.marketCount - a.marketCount).slice(0, 40).map((c) => `${c.competition.name} (${c.competitionRegion ?? '-'})`);

  // Quote di prova: esito finale (1X2) delle prime partite di calcio in partenza.
  const catalogo = await chiama('listMarketCatalogue', {
    filter: { eventTypeIds: ['1'], marketTypeCodes: ['MATCH_ODDS'], marketStartTime: finestra },
    maxResults: '200', sort: 'FIRST_TO_START', marketProjection: ['EVENT', 'COMPETITION', 'RUNNER_DESCRIPTION', 'MARKET_START_TIME'],
  });
  esito.partiteCalcio1X2_48ore = catalogo.length;
  const prova = catalogo.slice(0, 10);
  const libro = prova.length
    ? await chiama('listMarketBook', { marketIds: prova.map((m) => m.marketId), priceProjection: { priceData: ['EX_BEST_OFFERS'] } })
    : [];
  esito.quoteDiProva = prova.map((m) => {
    const b = libro.find((x) => x.marketId === m.marketId);
    return {
      partita: m.event.name,
      competizione: m.competition?.name ?? null,
      inizio: m.marketStartTime,
      soldiAbbinati: b?.totalMatched ?? null,
      esiti: m.runners.map((r) => {
        const x = b?.runners.find((y) => y.selectionId === r.selectionId)?.ex;
        return { nome: r.runnerName, punta: x?.availableToBack?.[0]?.price ?? null, banca: x?.availableToLay?.[0]?.price ?? null, disponibili: x?.availableToBack?.[0]?.size ?? null };
      }),
    };
  });

  // Altri mercati utili: quanti Under/Over 2.5 e quante partite NBA e tennis.
  const uo = await chiama('listMarketCatalogue', { filter: { eventTypeIds: ['1'], marketTypeCodes: ['OVER_UNDER_25'], marketStartTime: finestra }, maxResults: '200' });
  esito.partiteCalcioUnderOver25_48ore = uo.length;
  const nba = await chiama('listMarketCatalogue', { filter: { eventTypeIds: ['7522'], textQuery: 'NBA', marketTypeCodes: ['MATCH_ODDS'], marketStartTime: finestra }, maxResults: '100' });
  esito.partiteNBA_48ore = nba.length;
  const tennis = await chiama('listMarketCatalogue', { filter: { eventTypeIds: ['2'], marketTypeCodes: ['MATCH_ODDS'], marketStartTime: finestra }, maxResults: '200' });
  esito.partiteTennis_48ore = tennis.length;
}

try {
  await principale();
} catch (e) {
  esito.errori.push(pulisci(e?.message ?? e));
} finally {
  if (token) {
    await fetch(LOGOUT, { method: 'POST', headers: { 'X-Application': APP, 'X-Authentication': token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }).catch(() => {});
  }
  salva();
}
