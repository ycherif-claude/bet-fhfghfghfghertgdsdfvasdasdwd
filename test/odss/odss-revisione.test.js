// Revisione di odss-api [23/10/2026]: budget per giornata (stessa chiave per raccolte e controlli, contatori per tipo
// mai azzerati dall'altro), 429 che ferma tutti gli step dopo, pagine più piccole e richieste separate se l'API non
// accetta più valori, Pinnacle vecchio ignorato, orari dei bookmaker nel calcio, linea principale .5 con più bookmaker,
// copertura parziale riempita dalle fonti di prima, NBA confrontata con il calendario di balldontlie, pallavolo con il
// palinsesto e la riserva per campionato, controlli sulla linea della giocata e senza righe ripetute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { creaBudgetOdss, leggiStatoOdss, scriviStatoOdss } from '../../src/odss/budget.js';
import { scaricaOdss } from '../../src/odss/scarica.js';
import { eventiDaRighe, inFormatoNba } from '../../src/odss/eventi.js';
import { riassuntoMercato, eventiOdss } from '../../src/calcio/odss.js';
import { eseguiRaccolta } from '../../src/calcio/raccolta.js';
import { eseguiRaccoltaNba } from '../../src/nba/raccolta.js';
import { quoteFresche } from '../../src/controlli/quote.js';
import { fetchOdss, rigaOdss, bkOdss, AGG } from './aiuti.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'odss-rev-')); mkdirSync(join(d, 'raccolta'), { recursive: true }); return d; };
const FIN = { da: new Date('2026-10-23T06:00:00Z'), a: new Date('2026-10-24T06:00:00Z') };

// ---- 1. Budget per giornata ----

test('budget: 07:35-08:00 la raccolta (giornata che raccoglie) e i controlli (giornata in corso) non si azzerano a vicenda', () => {
  const d = temp();
  // 07:35 di Roma del 23: la raccolta del 23 spende 4 richieste.
  let b = creaBudgetOdss({ stato: leggiStatoOdss(d), data: '2026-10-23', adesso: new Date('2026-10-23T05:35:00Z'), sport: 'calcio' });
  for (let i = 0; i < 4; i++) b.conta();
  scriviStatoOdss(d, b.stato());
  // 07:50: controlli delle partite della giornata del 22 (fino alle 08:00).
  b = creaBudgetOdss({ stato: leggiStatoOdss(d), data: '2026-10-22', adesso: new Date('2026-10-23T05:50:00Z'), tipo: 'controlli' });
  b.conta();
  scriviStatoOdss(d, b.stato());
  // 07:55: il tennis della raccolta del 23 vede ancora le 4 del calcio.
  b = creaBudgetOdss({ stato: leggiStatoOdss(d), data: '2026-10-23', adesso: new Date('2026-10-23T05:55:00Z'), sport: 'tennis' });
  const s = b.stato();
  assert.equal(s.giornate['2026-10-23'].usate, 4);
  assert.deepEqual(s.giornate['2026-10-23'].perSport, { calcio: 4 });
  assert.equal(s.giornate['2026-10-22'].controlli, 1);
  // 09:00: i controlli della giornata del 23 hanno il loro contatore, a zero; le 4 del mattino restano.
  b = creaBudgetOdss({ stato: leggiStatoOdss(d), data: '2026-10-23', adesso: new Date('2026-10-23T07:00:00Z'), tipo: 'controlli' });
  b.conta();
  assert.deepEqual([b.stato().giornate['2026-10-23'].controlli, b.stato().giornate['2026-10-23'].usate], [1, 4]);
});

test('budget: un 429 ferma tutti gli step dopo (anche in un altro processo) fino al reset', async () => {
  const d = temp();
  const f = fetchOdss({}, { status: 429 });
  let b = creaBudgetOdss({ stato: null, data: '2026-10-23', adesso: new Date('2026-10-23T05:36:00Z'), sport: 'calcio' });
  await scaricaOdss({ chiave: CHIAVE, budget: b, sport: 'calcio', gruppi: ['1x2'], finestra: FIN, fetch: f, attesaMs: 0 });
  scriviStatoOdss(d, b.stato());
  b = creaBudgetOdss({ stato: leggiStatoOdss(d), data: '2026-10-23', adesso: new Date('2026-10-23T05:40:00Z'), sport: 'tennis' });
  assert.equal(b.puo(0), false);
  assert.match(b.motivo(), /429/);
  // Dopo il reset si riparte.
  b = creaBudgetOdss({ stato: leggiStatoOdss(d), data: '2026-11-30', adesso: new Date('2026-11-30T05:40:00Z'), sport: 'tennis' });
  assert.equal(b.puo(0), true);
});

// ---- Pagine e richieste separate ----

test('download: pagine da 1000 righe; HTTP 400 con più valori → una richiesta per mercato e sport, nel budget', async () => {
  assert.equal(CONFIG.odss.limite, 1000);
  const pagine = { 'basket|moneyline': [[rigaOdss({ sport: 'basket', market: 'moneyline' })]], 'basket|ou': [[rigaOdss({ sport: 'basket', market: 'ou', line: 210.5 })]] };
  const f = fetchOdss(pagine, { status: (u) => (u.searchParams.get('market').includes(',') ? 400 : 200) });
  const b = creaBudgetOdss({ stato: null, data: '2026-10-23', adesso: new Date('2026-10-23T05:36:00Z'), sport: 'calcio' });
  const r = await scaricaOdss({ chiave: CHIAVE, budget: b, sport: 'basket', gruppi: ['moneyline,ou'], finestra: FIN, fetch: f, attesaMs: 0 });
  assert.deepEqual(f.chiamate.map((c) => new URL(c.url).searchParams.get('market')), ['moneyline,ou', 'moneyline', 'ou']);
  assert.equal(new URL(f.chiamate[0].url).searchParams.get('limit'), '1000');
  assert.equal(r.righe.length, 2);
  assert.equal(r.ok, true);
});

// ---- Pinnacle vecchio, orari dei bookmaker nel calcio, linea principale ----

test('Pinnacle aggiornato da più di 24 ore: ignorato, vale il consenso (calcio e altri sport)', () => {
  const adesso = new Date('2026-10-23T06:00:00Z');
  const vecchio = { last_update: '2026-10-22T05:00:00Z' };
  const x = (h, d, a, extra = {}) => bkOdss('k', { HOME: h, DRAW: d, AWAY: a }, extra);
  const r = riassuntoMercato(rigaOdss({ bookmakers: [{ ...x(1.5, 4, 6, vecchio), key: 'pinnacle' }, { ...x(2, 3.4, 3.9), key: 'bwin' }, { ...x(2, 3.4, 3.9), key: 'unibet' }, { ...x(2, 3.4, 3.9), key: 'william' }] }), { adesso });
  assert.equal(r.fonteProb, 'mediana di 3 bookmaker');
  const [ev] = eventiDaRighe([rigaOdss({ sport: 'basket', market: 'moneyline', bookmakers: [bkOdss('pinnacle', { HOME: 1.5, AWAY: 2.8 }, vecchio), bkOdss('bwin', { HOME: 1.6, AWAY: 2.4 })] })], { adesso });
  assert.deepEqual(ev.libri.map((l) => l.chiave), ['bwin']);
});

test('calcio: un bookmaker con un orario d\'inizio diverso di più di un\'ora non entra nel riassunto', () => {
  const r = riassuntoMercato(rigaOdss({ bookmakers: [
    bkOdss('bwin', { HOME: 2, DRAW: 3.4, AWAY: 3.9 }), bkOdss('unibet', { HOME: 2, DRAW: 3.4, AWAY: 3.9 }),
    bkOdss('william', { HOME: 9, DRAW: 9, AWAY: 1.1 }, { start_time: '2026-10-25T18:45:00Z' }),
    bkOdss('snai', { HOME: 2.1, DRAW: 3.3, AWAY: 3.8 }, { start_time: '2026-10-23T19:00:00Z' }),
  ] }));
  assert.deepEqual(r.mediana.AWAY, { quota: 3.9, n: 3 });
  assert.deepEqual(r.mediana.HOME, { quota: 2, n: 3 });
  assert.deepEqual(Object.keys(r.miei), ['snai']);
});

test('linea principale: prima le linee .5, poi quella con più bookmaker, poi i prezzi più vicini; o la linea della giocata', () => {
  const libro = (k, linee) => ({ chiave: k, exchange: false, aggiornato: AGG, mercati: Object.fromEntries(linee.map(([l, o, u]) => [`ou|${l}`, { OVER: o, UNDER: u }])) });
  const ev = { id: 'x', casa: 'A', trasferta: 'B', inizio: AGG, libri: [
    libro('a', [[220, 1.9, 1.9], [220.5, 1.85, 1.95], [221.5, 1.95, 1.85]]),
    libro('b', [[220, 1.9, 1.9], [220.5, 1.84, 1.96], [221.5, 1.97, 1.83]]),
    libro('c', [[220.5, 1.86, 1.94]]),
    libro('d', [[220.5, 1.85, 1.95], [221.5, 1.9, 1.9]]),
  ] };
  // 220 (intera) ha i prezzi uguali ma è scartata; 220.5 ha 4 bookmaker, 221.5 solo 3.
  assert.deepEqual(inFormatoNba(ev).bookmaker.map((b) => Object.keys(b.mercati.totale)[0]), ['220.5', '220.5', '220.5', '220.5']);
  // Controlli: la linea della giocata, anche se non è la principale.
  const g = inFormatoNba(ev, { linee: { totale: 221.5 } }).bookmaker.filter((b) => b.mercati.totale).map((b) => b.chiave);
  assert.deepEqual(g, ['a', 'b', 'd']);
});

// ---- 4. Copertura parziale del calcio ----

test('calcio: competizione coperta solo in parte da odss → The Odds API per le partite che mancano, mai sopra odss', async () => {
  const DENTRO = '2026-10-20T18:45:00Z';
  const SQ = ['Inter', 'Lecce', 'Milan', 'Roma'];
  const righe = (st) => { const base = { 2627: '2026-09', 2526: '2026-03', 2425: '2025-03' }[st]; const o = []; let k = 0; SQ.forEach((a, i) => SQ.forEach((b, j) => { if (a === b) return; k++; o.push({ data: `${base}-${String(1 + (k % 27)).padStart(2, '0')}`, casa: a, trasferta: b, gc: (i + 2 * j + k) % 4, gt: (j + k) % 3, gcPT: 0, gtPT: 0, xgC: null, xgT: null, angoliC: 4, angoliT: 3, cartC: 1, cartT: 2, arbitro: null }); })); return o; };
  const eventi = [{ id: '1', casa: 'Inter Milan', trasferta: 'Lecce', inizio: DENTRO }, { id: '2', casa: 'Milan', trasferta: 'Roma', inizio: DENTRO }];
  const odssEv = eventiOdss([rigaOdss({ home_team: 'Inter', away_team: 'Lecce', commence_time: DENTRO, bookmakers: ['pinnacle', 'bwin', 'unibet'].map((k) => bkOdss(k, { HOME: 1.5, DRAW: 4.2, AWAY: 6.5 })) })]);
  const quote = [];
  const b = (k) => ({ chiave: k, aggiornato: 'T', mercati: { h2h: { casa: 2.5, pareggio: 3.2, trasferta: 2.9 }, totals: {} } });
  const fonti = {
    odss: { eventi: odssEv, errori: [] },
    oddsApi: { eventi: async (s) => ({ eventi: s === 'soccer_italy_serie_a' ? eventi : [], rimasti: 412 }), quote: async (s) => { quote.push(s); return { eventi: eventi.map((e) => ({ ...e, bookmaker: [b('pinnacle'), b('a'), b('c')] })), rimasti: 410 }; } },
    footballDataUk: { partite: async (c, st) => st.flatMap(righe) },
  };
  const r = await eseguiRaccolta({ data: '2026-10-20', adesso: new Date('2026-10-20T05:35:40Z'), fonti, chiavi: { oddsApi: 'K' } });
  assert.deepEqual(quote, ['soccer_italy_serie_a']);
  const q = (partita) => r.partite.find((p) => p.partita === partita).mercati.find((m) => m.mercato === '1X2' && m.selezione === '1');
  assert.equal(q('Inter Milan - Lecce').fonteQuota, 'mediana di 3 bookmaker (odss-api)');
  assert.equal(q('Inter Milan - Lecce').quota, 1.5);
  assert.equal(q('Milan - Roma').fonteQuota, 'mediana di 3 bookmaker (The Odds API)');
  assert.ok(r.erroriGiro.some((e) => /Serie A: 1 partite su 2 non trovate su odss-api, quote da The Odds API/.test(e)), r.erroriGiro.join(' | '));
});

// ---- 2. NBA con il calendario di balldontlie ----

const SQ_NBA = ['Boston Celtics', 'New York Knicks', 'Miami Heat', 'Chicago Bulls'];
function storicoNba(oggi = []) {
  const out = [];
  let k = 0;
  for (const s of [2025, 2026]) {
    SQ_NBA.forEach((a, i) => SQ_NBA.forEach((b2, j) => {
      if (a === b2) return;
      k++;
      out.push({ id: k, dataUsa: s === 2026 ? `2026-10-${String(1 + (k % 15)).padStart(2, '0')}` : `2026-03-${String(1 + (k % 27)).padStart(2, '0')}`, inizio: null, casa: a, trasferta: b2, puntiCasa: 105 + ((i + k) % 12), puntiTrasferta: 100 + ((j + 2 * k) % 12), finita: true, stagione: s, postseason: false });
    }));
  }
  return [...out, ...oggi.map((g, i) => ({ id: 900 + i, dataUsa: '2026-10-20', inizio: g.inizio, casa: g.casa, trasferta: g.trasferta, puntiCasa: null, puntiTrasferta: null, finita: false, stagione: 2026, postseason: false }))];
}
const meta = (arr) => { Object.defineProperty(arr, 'nonRiconosciute', { value: [], enumerable: false }); Object.defineProperty(arr, 'diagnostica', { value: { lineaMancante: { handicap: 0, totale: 0 }, quoteNonConvertibili: 0, handicapAsimmetrico: 0 }, enumerable: false }); return arr; };
function fontiNba({ fetch, oggi }) {
  const c = { sgo: 0 };
  const bk = (k) => ({ chiave: k, mercati: { vincente: { casa: 1.55, trasferta: 2.5 } } });
  return {
    c, fetchOdss: fetch,
    sportsgameodds: { eventi: async () => { c.sgo++; return meta(oggi.map((g, i) => ({ id: `s${i}`, casa: g.casa, trasferta: g.trasferta, inizio: g.inizio, bookmaker: [bk('a'), bk('b'), bk('c')] }))); } },
    balldontlie: { partite: async (x) => meta(storicoNba(oggi).filter((p) => p.stagione === x.stagioni[0])) },
  };
}
const ml = (casa, trasferta, inizio, id) => rigaOdss({ event_id: id, sport: 'basket', league: 'NBA', home_team: casa, away_team: trasferta, commence_time: inizio, market: 'moneyline', bookmakers: ['pinnacle', 'snai', 'bwin'].map((k) => bkOdss(k, { HOME: 1.55, AWAY: 2.5 })) });
const ADESSO_NBA = new Date('2026-10-20T05:07:00Z');

test('NBA: senza partite nel calendario di balldontlie nessuna richiesta; con una partita che odss non ha → SportsGameOdds per la giornata', async () => {
  let f = fetchOdss({});
  let fo = fontiNba({ fetch: f, oggi: [] });
  await eseguiRaccoltaNba({ data: '2026-10-20', adesso: ADESSO_NBA, fonti: fo, chiavi: { balldontlie: 'B', sportsgameodds: 'S', odss: CHIAVE }, dirData: temp() });
  assert.equal(f.chiamate.length, 0);
  const oggi = [{ casa: 'Boston Celtics', trasferta: 'New York Knicks', inizio: '2026-10-20T23:30:00Z' }, { casa: 'Miami Heat', trasferta: 'Chicago Bulls', inizio: '2026-10-21T00:00:00Z' }];
  f = fetchOdss({ 'basket|moneyline,ah,ou': [[ml('Boston Celtics', 'New York Knicks', '2026-10-20T23:30:00Z', 'n1')]] });
  fo = fontiNba({ fetch: f, oggi });
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso: ADESSO_NBA, fonti: fo, chiavi: { balldontlie: 'B', sportsgameodds: 'S', odss: CHIAVE }, dirData: temp() });
  assert.equal(f.chiamate.length, 1);
  assert.equal(fo.c.sgo, 1);
  assert.ok(r.erroriGiro.some((e) => /NBA: 1 partite su 2 non coperte da odss-api, quote da SportsGameOdds/.test(e)), r.erroriGiro.join(' | '));
  // Tutte coperte: niente SportsGameOdds.
  f = fetchOdss({ 'basket|moneyline,ah,ou': [[ml('Boston Celtics', 'New York Knicks', '2026-10-20T23:30:00Z', 'n1'), ml('Miami Heat', 'Chicago Bulls', '2026-10-21T00:00:00Z', 'n2')]] });
  fo = fontiNba({ fetch: f, oggi });
  await eseguiRaccoltaNba({ data: '2026-10-20', adesso: ADESSO_NBA, fonti: fo, chiavi: { balldontlie: 'B', sportsgameodds: 'S', odss: CHIAVE }, dirData: temp() });
  assert.equal(fo.c.sgo, 0);
});

// ---- Controlli ----

test('controlli: la linea della giocata, una riga per motivo per giornata (non a ogni passaggio)', async () => {
  const d = temp();
  // Niente bookmaker dell'utente: alle 00:30 le loro quote delle 07:40 sarebbero vecchie.
  const libri = ['pinnacle', 'bwin', 'unibet'];
  const base = { sport: 'basket', league: 'NBA', home_team: 'Boston Celtics', away_team: 'New York Knicks', commence_time: '2026-10-23T23:30:00Z', event_id: 'n1' };
  const righe = [
    rigaOdss({ ...base, market: 'moneyline', bookmakers: libri.map((k) => bkOdss(k, { HOME: 1.55, AWAY: 2.5 })) }),
    rigaOdss({ ...base, market: 'ah', line: -4.5, bookmakers: libri.map((k) => bkOdss(k, { HOME: 1.91, AWAY: 1.91 })) }),
    rigaOdss({ ...base, market: 'ah', line: -5.5, bookmakers: libri.map((k) => bkOdss(k, { HOME: 2.05, AWAY: 1.78 })) }),
  ];
  const voce = { id: 'v', sport: 'nba', competizione: 'NBA', partita: 'Boston Celtics - New York Knicks', inizio: '2026-10-24T01:30:00+02:00', mercato: 'Handicap -5.5', selezione: 'casa' };
  const fonti = (fetch) => ({ fetchOdss: fetch, sportsgameodds: { eventi: async () => [] } });
  const adesso = new Date('2026-10-23T22:30:00Z');
  const out = await quoteFresche([voce], { fonti: fonti(fetchOdss({ 'basket|moneyline,ah,ou': [righe] })), chiavi: { sportsgameodds: 'S', odss: CHIAVE }, finestra: FIN, errore: () => {}, dirData: d, data: '2026-10-23', adesso });
  assert.equal(out.get('v').quota, 2.05);
  // Tetto raggiunto: la riga esce una volta sola nella giornata.
  const errori = [];
  for (let i = 0; i < 4; i++) {
    await quoteFresche([voce], { fonti: fonti(fetchOdss({ 'basket|moneyline,ah,ou': [righe] })), chiavi: { sportsgameodds: 'S', odss: CHIAVE }, finestra: FIN, errore: (a, b) => errori.push(`${a}: ${b?.message ?? b}`), dirData: d, data: '2026-10-23', adesso });
  }
  assert.equal(errori.filter((e) => /odss-api.*tetto/.test(e)).length, 1, errori.join(' | '));
});
