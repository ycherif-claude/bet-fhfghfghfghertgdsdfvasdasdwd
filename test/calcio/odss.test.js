// Idea 1 [utente, 22/10/2026]: quote dei bookmaker italiani dell'utente da odss-api.com.
// Fonte con budget (richieste al giorno e riserva mensile), solo la riga della partita intera, probabilità di
// consenso senza margine (Pinnacle se c'è), abbinamento sicuro alle partite, quota migliore nei pronostici,
// nelle doppie/triple, su Telegram e nel workflow (la chiave solo allo step che la usa). Niente rete: fetch finto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { odss } from '../../src/calcio/fonti/odss.js';
import {
  scegliPartitaIntera, riassuntoMercato, scaricaQuoteOdss, abbinaEventiOdss, quoteOdssPronostico, eseguiRaccoltaOdss,
} from '../../src/calcio/odss.js';
import { pronosticiPartita } from '../../src/regole/pronostici.js';
import { costruisciSchedinePronostici } from '../../src/regole/schedine-pronostici.js';
import { eseguiGiro } from '../../src/giro/giro.js';
import { testoPronostici, testoSchedinePronostici } from '../../src/notifiche/telegram.js';
import { CONFIG } from '../../src/config.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const UA = 'analisi-giocate (progetto personale)';
const RESET = 1795000000;
const RESET_ISO = new Date(RESET * 1000).toISOString();

function risposta(status, corpo, headers = {}) {
  const testo = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), text: async () => testo };
}
// Risponde secondo `market` e `after` della richiesta; registra le chiamate.
function fetchFinto(pagine, { rimaste = 480, status = 200, corpo = null } = {}) {
  const chiamate = [];
  let r = rimaste;
  const f = async (url, init) => {
    chiamate.push({ url: String(url), init });
    const u = new URL(String(url));
    r--;
    const h = { 'x-ratelimit-remaining': String(r), 'x-ratelimit-limit': '500', 'x-ratelimit-reset': String(RESET) };
    if (status !== 200) return risposta(status, corpo ?? '', h);
    const lista = pagine[u.searchParams.get('market')] ?? [[]];
    const i = u.searchParams.get('after') ? Number(u.searchParams.get('after').slice(1)) : 0;
    const next = i + 1 < lista.length ? `p${i + 1}` : null;
    return risposta(200, { odds: lista[i] ?? [], next_after: next }, h);
  };
  f.chiamate = chiamate;
  return f;
}

const AGG = '2026-10-23T05:40:00+00:00';
const bk = (key, outcomes, extra = {}) => ({ key, outcomes, last_update: AGG, ...extra });
const riga = (o = {}) => ({
  event_id: 'e1', event: 'Torino - Monza', league: 'Serie A', home_team: 'Torino', away_team: 'Monza',
  commence_time: '2026-10-23T18:45:00.000Z', market: '1x2', line: null, scope: 'match', period: 'ft', bookmakers: [], ...o,
});
const x12 = (h, d, a) => ({ HOME: h, DRAW: d, AWAY: a });
const DATA = '2026-10-23';
const ADESSO = new Date('2026-10-23T05:36:00Z');

// ---- Fonte ----

test('fonte: parametri della richiesta, chiave nell\'intestazione, User-Agent onesto, paginazione e limiti', async () => {
  const f = fetchFinto({ '1x2': [[riga()], [riga({ event_id: 'e2' })]] });
  const finestra = { da: new Date('2026-10-23T06:00:00Z'), a: new Date('2026-10-24T06:00:00Z') };
  const p1 = await odss.quote({ chiave: CHIAVE, market: '1x2', finestra, fetch: f });
  assert.equal(p1.righe.length, 1);
  assert.equal(p1.nextAfter, 'p1');
  assert.deepEqual(p1.limiti, { rimaste: 479, limite: 500, reset: RESET_ISO });
  const u = new URL(f.chiamate[0].url);
  assert.equal(`${u.origin}${u.pathname}`, 'https://odss-api.com/api/v1/odds');
  assert.equal(u.searchParams.get('sport'), 'calcio');
  assert.equal(u.searchParams.get('market'), '1x2');
  assert.equal(u.searchParams.get('state'), 'prematch');
  assert.equal(u.searchParams.get('commence_from'), '2026-10-23T06:00:00Z');
  assert.equal(u.searchParams.get('commence_to'), '2026-10-24T06:00:00Z');
  assert.equal(u.searchParams.get('limit'), '5000');
  // Senza filtro bookmakers (serve il consenso di tutti) e senza la chiave nell'indirizzo.
  assert.equal(u.searchParams.has('bookmakers'), false);
  assert.ok(!f.chiamate[0].url.includes(CHIAVE));
  assert.equal(f.chiamate[0].init.headers['x-api-key'], CHIAVE);
  assert.equal(f.chiamate[0].init.headers['User-Agent'], UA);
  const p2 = await odss.quote({ chiave: CHIAVE, market: '1x2', finestra, after: p1.nextAfter, fetch: f });
  assert.equal(new URL(f.chiamate[1].url).searchParams.get('after'), 'p1');
  assert.equal(p2.nextAfter, null);
});

test('fonte: errore HTTP con lo status e senza la chiave, anche se la risposta la contiene', async () => {
  const f = fetchFinto({}, { status: 401, corpo: `chiave ${CHIAVE} non valida` });
  await assert.rejects(odss.quote({ chiave: CHIAVE, market: 'dc', finestra: { da: new Date(), a: new Date() }, fetch: f }),
    (e) => e.status === 401 && /HTTP 401/.test(e.message) && !e.message.includes(CHIAVE));
});

// ---- Solo la riga della partita intera ----

test('partita intera: la riga con periodo intero; per eliminazione se le altre sono tempi; mai se non si distingue', () => {
  const ft = riga({ period: 'ft', bookmakers: [bk('snai', x12(2.15, 3.25, 3.4))] });
  const h1 = riga({ period: '1h', bookmakers: [bk('snai', x12(2.7, 2.2, 3.75))] });
  const h2 = riga({ period: '2h', bookmakers: [bk('snai', x12(2.55, 2.4, 3.6))] });
  let r = scegliPartitaIntera([h1, ft, h2]);
  assert.deepEqual(r.righe, [ft]);
  // Un'altra partita: periodo assente sulla riga intera, gli altri sono tempi → si sceglie per eliminazione.
  const senza = riga({ event_id: 'e2', period: undefined });
  r = scegliPartitaIntera([senza, riga({ event_id: 'e2', period: '1st_half' }), riga({ event_id: 'e2', period: '2nd_half' })]);
  assert.deepEqual(r.righe, [senza]);
  // Come nel collaudo reale: tre righe 1x2 con scope "match" e senza periodo → nessuna (non si indovina).
  r = scegliPartitaIntera([riga({ period: undefined }), riga({ period: undefined }), riga({ period: undefined })]);
  assert.deepEqual(r.righe, []);
  assert.equal(r.scartate, 3);
  assert.deepEqual(r.periodiVisti, { 'match|(assente)': 3 });
  // Una riga sola senza periodo: potrebbe essere un tempo → scartata.
  assert.deepEqual(scegliPartitaIntera([riga({ period: null })]).righe, []);
  // Scope diverso da "match" (per esempio una squadra): fuori.
  assert.deepEqual(scegliPartitaIntera([riga({ scope: 'team', period: 'ft' })]).righe, []);
  // Linee diverse dell'Under/Over sono gruppi diversi.
  const ou = (line, period) => riga({ market: 'ou', line, period });
  assert.equal(scegliPartitaIntera([ou(1.5, 'ft'), ou(2.5, 'ft'), ou(1.5, '1h')]).righe.length, 2);
});

// ---- Consenso senza margine e quote dell'utente ----

test('riassunto: quote dei miei bookmaker, consenso dalla mediana senza margine, Pinnacle se c\'è, sospesi e exchange fuori', () => {
  const altri = [bk('bwin', x12(2.0, 3.5, 4.0)), bk('unibet', x12(2.1, 3.4, 3.8)), bk('william', x12(1.95, 3.6, 4.2))];
  const r = riassuntoMercato(riga({ bookmakers: [
    ...altri, bk('snai', x12(2.05, 3.4, 3.9)), bk('sportium', x12(2.1, 3.35, 3.85)),
    bk('goldbet', x12(9, 9, 9), { suspended: true }), bk('betfair_ex_eu', x12(3, 3, 3)),
  ] }));
  assert.deepEqual(Object.keys(r.miei).sort(), ['snai', 'sportium']);
  assert.deepEqual(r.miei.sportium, { quote: x12(2.1, 3.35, 3.85), aggiornato: AGG });
  const novig = (o) => { const s = 1 / o.HOME + 1 / o.DRAW + 1 / o.AWAY; return 1 / o.HOME / s; };
  const valori = [...altri.map((b) => novig(b.outcomes)), novig(x12(2.05, 3.4, 3.9)), novig(x12(2.1, 3.35, 3.85))].sort((a, b) => a - b);
  assert.equal(valori.length, 5);
  assert.ok(Math.abs(r.prob.HOME - valori[2]) < 1e-4);
  assert.equal(r.fonteProb, 'mediana di 5 bookmaker');
  // Con Pinnacle: la sua probabilità senza margine.
  const p = riassuntoMercato(riga({ bookmakers: [...altri, bk('pinnacle', x12(1.9, 3.6, 4.4))] }));
  assert.ok(Math.abs(p.prob.HOME - novig(x12(1.9, 3.6, 4.4))) < 1e-4);
  assert.equal(p.fonteProb, 'Pinnacle');
  // Doppia chance: ogni esito copre due risultati, le probabilità sommano a 2.
  const dc = riassuntoMercato(riga({ market: 'dc', bookmakers: [bk('pinnacle', { 12: 1.33, '1X': 1.3, X2: 1.67 })] }));
  const s = 1 / 1.33 + 1 / 1.3 + 1 / 1.67;
  assert.ok(Math.abs(dc.prob['1X'] - 2 / 1.3 / s) < 1e-4);
  assert.ok(Math.abs(dc.prob['1X'] + dc.prob.X2 + dc.prob['12'] - 2) < 1e-4);
  // Meno di 3 bookmaker e niente Pinnacle: nessuna probabilità. bet365 senza quote: nessun errore.
  const pochi = riassuntoMercato(riga({ bookmakers: [bk('snai', x12(2, 3.4, 4)), bk('bet365', {})] }));
  assert.equal(pochi.prob, null);
  assert.deepEqual(Object.keys(pochi.miei), ['snai']);
});

// ---- Download con budget ----

const pagineTipo = () => ({
  '1x2': [[riga({ bookmakers: [bk('sportium', x12(2.1, 3.3, 3.5)), bk('pinnacle', x12(2.0, 3.4, 3.9))] }), riga({ period: '1h' })]],
  dc: [[riga({ market: 'dc', bookmakers: [bk('sportium', { 12: 1.3, '1X': 1.26, X2: 1.7 })] })]],
  ou: [[riga({ market: 'ou', line: 1.5, bookmakers: [bk('snai', { UNDER: 3.25, OVER: 1.27 })] })], [riga({ market: 'ou', line: 2.5, bookmakers: [bk('goldbet', { UNDER: 1.8, OVER: 1.9 })] })]],
});

test('download: 1x2, dc e ou con paginazione; eventi compatti; stato con rimaste e usate oggi', async () => {
  const f = fetchFinto(pagineTipo());
  const { file, stato } = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, stato: null, fetch: f, attesaMs: 0 });
  assert.equal(f.chiamate.length, 4);
  assert.deepEqual(f.chiamate.map((c) => new URL(c.url).searchParams.get('market')), ['1x2', 'dc', 'ou', 'ou']);
  assert.equal(file.data, DATA);
  assert.deepEqual(file.erroriGiro, []);
  assert.equal(file.eventi.length, 1);
  const e = file.eventi[0];
  assert.deepEqual([e.casa, e.trasferta, e.inizio, e.campionato], ['Torino', 'Monza', '2026-10-23T18:45:00.000Z', 'Serie A']);
  assert.deepEqual(Object.keys(e.mercati).sort(), ['1x2', 'dc', 'ou|1.5', 'ou|2.5']);
  assert.equal(e.mercati['1x2'].fonteProb, 'Pinnacle');
  assert.equal(file.diagnostica.scartate, 0);
  assert.deepEqual(stato, { aggiornatoAlle: ADESSO.toISOString(), rimaste: 476, limite: 500, reset: RESET_ISO, giorno: DATA, usateOggi: 4 });
  assert.ok(!JSON.stringify(file).includes(CHIAVE));
});

test('budget: mai sotto la riserva, al massimo richiesteGiorno; se non basta niente quote e una riga chiara', async () => {
  const { riserva, richiesteGiorno } = CONFIG.odss;
  assert.equal(riserva, 60);
  assert.equal(richiesteGiorno, 6);
  // Rimaste 62: servirebbero 3 richieste e si scenderebbe sotto 60 → nessuna richiesta.
  let f = fetchFinto(pagineTipo());
  let r = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f,
    stato: { rimaste: 62, reset: '2026-11-20T00:00:00Z', giorno: DATA, usateOggi: 0 } });
  assert.equal(f.chiamate.length, 0);
  assert.deepEqual(r.file.eventi, []);
  assert.match(r.file.erroriGiro[0], /odss-api.*budget insufficiente.*rimaste 62.*riserva 60/);
  // Già 4 richieste oggi: ne restano 2 sulle 6, non bastano per 3 mercati.
  f = fetchFinto(pagineTipo());
  r = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f, stato: { rimaste: 400, giorno: DATA, usateOggi: 4 } });
  assert.equal(f.chiamate.length, 0);
  assert.match(r.file.erroriGiro[0], /budget insufficiente/);
  // Giorno nuovo: il conteggio di oggi riparte; un reset passato rende sconosciute le rimaste.
  f = fetchFinto(pagineTipo());
  r = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f, stato: { rimaste: 10, reset: '2026-10-01T00:00:00Z', giorno: '2026-10-22', usateOggi: 6 } });
  assert.equal(f.chiamate.length, 4);
  assert.equal(r.stato.usateOggi, 4);
  // Le pagine in più si fanno solo lasciando una richiesta a ogni mercato che manca; poi riga "incomplete".
  const tante = { '1x2': [[riga()], [riga({ event_id: 'e2' })], [riga({ event_id: 'e3' })], [riga({ event_id: 'e4' })]], dc: [[riga({ market: 'dc' })]], ou: [[riga({ market: 'ou', line: 1.5 })]] };
  f = fetchFinto(tante);
  r = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f, stato: { rimaste: 400, giorno: DATA, usateOggi: 1 } });
  assert.equal(f.chiamate.length, 5);
  assert.deepEqual(f.chiamate.map((c) => new URL(c.url).searchParams.get('market')), ['1x2', '1x2', '1x2', 'dc', 'ou']);
  assert.ok(r.file.erroriGiro.some((x) => /1x2.*incomplete/.test(x)));
  // Dopo ogni risposta conta l'intestazione: a 61 rimaste non si fa la richiesta successiva.
  f = fetchFinto(pagineTipo(), { rimaste: 62 });
  r = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f, stato: null });
  assert.equal(f.chiamate.length, 2);
  assert.equal(r.stato.rimaste, 60);
  assert.ok(r.file.erroriGiro.some((x) => /riserva/.test(x)));
});

test('download: 429 ferma tutto con una riga chiara; nessuna chiave → nessuna richiesta', async () => {
  let f = fetchFinto({}, { status: 429 });
  let r = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f, stato: null, attesaMs: 0 });
  assert.equal(f.chiamate.length, 1);
  assert.match(r.file.erroriGiro.join('\n'), /odss-api.*HTTP 429/);
  f = fetchFinto(pagineTipo());
  r = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: undefined, fetch: f, stato: null });
  assert.equal(f.chiamate.length, 0);
  assert.match(r.file.erroriGiro[0], /ODSS_API_KEY/);
});

test('download: periodo non distinguibile → riga in erroriGiro con i valori visti', async () => {
  const f = fetchFinto({ '1x2': [[riga({ period: undefined }), riga({ period: undefined })]], dc: [[]], ou: [[]] });
  const { file } = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f, stato: null });
  assert.deepEqual(file.eventi, []);
  assert.ok(file.erroriGiro.some((x) => /2 righe scartate/.test(x) && /match\|\(assente\)/.test(x)), file.erroriGiro.join('\n'));
});

test('raccolta odss: scrive data/raccolta/<data>-odss.json e data/stato/odss.json, la chiave mai', async () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-odss-'));
  const f = fetchFinto(pagineTipo());
  await eseguiRaccoltaOdss({ dirData: d, data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f });
  const file = readFileSync(join(d, 'raccolta', `${DATA}-odss.json`), 'utf8');
  const stato = JSON.parse(readFileSync(join(d, 'stato', 'odss.json'), 'utf8'));
  assert.equal(JSON.parse(file).eventi.length, 1);
  assert.equal(stato.usateOggi, 4);
  assert.ok(!file.includes(CHIAVE));
  // Seconda raccolta lo stesso giorno: legge lo stato e conta le richieste di oggi (4 + 4 > 6 → niente).
  const g = fetchFinto(pagineTipo());
  await eseguiRaccoltaOdss({ dirData: d, data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: g });
  assert.equal(g.chiamate.length, 0);
  // Il file buono del mattino non si cancella.
  assert.equal(JSON.parse(readFileSync(join(d, 'raccolta', `${DATA}-odss.json`), 'utf8')).eventi.length, 1);
  assert.ok(existsSync(join(d, 'raccolta', `${DATA}-odss.json`)));
});

// ---- Abbinamento ----

const ev = (id, casa, trasferta, inizio = '2026-10-23T18:45:00.000Z') => ({ id, casa, trasferta, inizio, campionato: 'Serie A', mercati: {} });
const pt = (id, casa, trasferta, inizio = '2026-10-23T20:45:00+02:00') => ({ idPartita: id, sport: 'calcio', casa, trasferta, partita: `${casa} - ${trasferta}`, inizio });

test('abbinamento: squadre (con alias) e orario; ambiguo, invertito o lontano → nessuno', () => {
  const eventi = [ev('a', 'Torino FC', 'AC Monza'), ev('b', 'Inter', 'Lecce'), ev('c', 'Roma', 'Lazio'), ev('d', 'Genoa', 'Pisa', '2026-10-23T12:00:00Z'),
    ev('e1', 'Napoli', 'Como'), ev('e2', 'Napoli', 'Como', '2026-10-23T19:30:00.000Z')];
  const m = abbinaEventiOdss([
    pt('to', 'Torino', 'Monza'), pt('in', 'Inter Milan', 'Lecce'), pt('la', 'Lazio', 'Roma'), pt('ge', 'Genoa', 'Pisa'), pt('na', 'Napoli', 'Como'),
  ], eventi);
  assert.equal(m.get('to')?.id, 'a');
  assert.equal(m.get('in')?.id, 'b');
  assert.equal(m.has('la'), false, 'casa e trasferta invertite');
  assert.equal(m.has('ge'), false, 'orario lontano');
  assert.equal(m.has('na'), false, 'due eventi possibili');
  // Un evento che andrebbe a due partite: a nessuna.
  const doppio = abbinaEventiOdss([pt('x', 'Torino', 'Monza'), pt('y', 'Torino', 'Monza', '2026-10-23T21:00:00+02:00')], [ev('a', 'Torino', 'Monza')]);
  assert.equal(doppio.size, 0);
  // Altri sport: mai.
  assert.equal(abbinaEventiOdss([{ ...pt('t', 'Torino', 'Monza'), sport: 'basket' }], [ev('a', 'Torino', 'Monza')]).size, 0);
});

// ---- Pronostici ----

const fasce = [{ da: 0.75, n: 4000, vera: 0.86 }];
const CAL = { calcio: { principali: { 'Doppia chance|1X': fasce, '1X2|1': fasce, 'Under/Over 1.5|Over 1.5': fasce, 'Under/Over casa 0.5|Over 0.5': fasce } } };
const mercato = (m, s, extra = {}) => ({ mercato: m, selezione: s, probModello: 0.8, probPinnacle: null, quota: null, ...extra });
const partitaRaccolta = (mercati) => ({ idPartita: 'calcio-2026-10-23-torino-monza', sport: 'calcio', competizione: 'Serie A', partita: 'Torino - Monza', casa: 'Torino', trasferta: 'Monza', inizio: '2026-10-23T20:45:00+02:00', mercati });
const dcRiga = (extra = []) => riga({ market: 'dc', bookmakers: [
  bk('snai', { 12: 1.3, '1X': 1.24, X2: 2.1 }), bk('sportium', { 12: 1.3, '1X': 1.26, X2: 2.1 }, { last_update: '2026-10-23T05:41:00+00:00' }),
  bk('goldbet', { 12: 1.3, '1X': 1.25, X2: 2.1 }), bk('bwin', { 12: 1.3, '1X': 1.18, X2: 2.3 }), ...extra,
] });
const eventoCon = (righe) => ({ ...ev('a', 'Torino', 'Monza'), mercati: Object.fromEntries(righe.map((r) => [r.market === 'ou' ? `ou|${r.line}` : r.market, riassuntoMercato(r)])) });

test('quote del pronostico: miei bookmaker, migliore con l\'orario, consenso; gol casa senza mercato adatto → null', () => {
  const evento = eventoCon([dcRiga([bk('pinnacle', { 12: 1.3, '1X': 1.15, X2: 2.3 })]), riga({ market: 'ou', line: 1.5, bookmakers: [bk('daznbet', { UNDER: 3.35, OVER: 1.28 })] })]);
  const q = quoteOdssPronostico(evento, 'Doppia chance', '1X');
  assert.deepEqual(q.quoteMiei, [
    { bookmaker: 'sportium', quota: 1.26, aggiornato: '2026-10-23T05:41:00+00:00' },
    { bookmaker: 'goldbet', quota: 1.25, aggiornato: AGG },
    { bookmaker: 'snai', quota: 1.24, aggiornato: AGG },
  ]);
  assert.equal(q.quotaMigliore, 1.26);
  assert.equal(q.bookmakerMigliore, 'sportium');
  assert.equal(q.oraQuota, '2026-10-23T05:41:00+00:00');
  assert.equal(q.fonteConsenso, 'Pinnacle');
  const s = 1 / 1.3 + 1 / 1.15 + 1 / 2.3;
  assert.ok(Math.abs(q.probConsenso - 2 / 1.15 / s) < 1e-4);
  assert.equal(quoteOdssPronostico(evento, 'Under/Over 1.5', 'Over 1.5').quotaMigliore, 1.28);
  assert.equal(quoteOdssPronostico(evento, 'Under/Over casa 0.5', 'Over 0.5'), null);
  assert.equal(quoteOdssPronostico(evento, '1X2', '1'), null);
});

test('pronostici con odss: quota = migliore dei miei bookmaker, ✅ con la regola di sempre, probConsenso', () => {
  const evento = eventoCon([dcRiga([bk('pinnacle', { 12: 1.3, '1X': 1.15, X2: 2.3 })])]);
  const p = pronosticiPartita(partitaRaccolta([mercato('Doppia chance', '1X'), mercato('Under/Over casa 0.5', 'Over 0.5', { quota: 1.3 })]), CAL, evento);
  const dc = p.find((x) => x.mercato === 'Doppia chance');
  assert.equal(dc.quotaMinima, 1.17);
  assert.equal(dc.quota, 1.26);
  assert.equal(dc.quotaMigliore, 1.26);
  assert.equal(dc.bookmakerMigliore, 'sportium');
  assert.equal(dc.quoteMiei.length, 3);
  assert.ok(dc.probConsenso > 0.8);
  assert.equal(dc.probMercato, dc.probConsenso);
  assert.equal(dc.giocabile, true);
  // Gol casa: nessun mercato squadra su odss → nessuna quota (neanche quella vecchia).
  const gc = p.find((x) => x.mercato === 'Under/Over casa 0.5');
  assert.equal(gc.quota, null);
  assert.equal(gc.giocabile, false);
  assert.ok(!('quotaMigliore' in gc));
  // Con quote odss il migliore è quello con la quota (dc).
  assert.equal(dc.migliore, true);
  // Consenso sotto l'80% → solo da tenere d'occhio, anche con la quota alta.
  const basso = eventoCon([dcRiga([bk('pinnacle', { 12: 1.3, '1X': 1.35, X2: 1.9 })])]);
  assert.equal(pronosticiPartita(partitaRaccolta([mercato('Doppia chance', '1X')]), CAL, basso)[0].giocabile, false);
  // Senza evento odss: tutto come prima.
  const vecchio = pronosticiPartita(partitaRaccolta([mercato('Doppia chance', '1X', { quota: 1.3, probPinnacle: 0.85 })]), CAL)[0];
  assert.equal(vecchio.quota, 1.3);
  assert.equal(vecchio.giocabile, true);
  assert.ok(!('quotaMigliore' in vecchio));
});

test('doppie e triple: quota della gamba = quota migliore con il bookmaker; altrimenti la minima da verificare', () => {
  const g = (id, casa, trasferta, extra) => ({ idPartita: id, sport: 'calcio', competizione: 'Serie A', partita: `${casa} - ${trasferta}`, inizio: '2026-10-25T18:00:00+02:00',
    pronostici: [{ mercato: '1X2', selezione: '1', testo: `Vince ${casa}`, prob: 0.87, limite: 0.85, quotaMinima: 1.2, quota: null, giocabile: false, migliore: true, esito: null, ...extra }] });
  const s = costruisciSchedinePronostici([
    g('a', 'A', 'B', { quota: 1.31, quotaMigliore: 1.31, bookmakerMigliore: 'sportium' }), g('c', 'C', 'D', {}),
  ], { data: '2026-10-25', prova: true });
  assert.equal(s.length, 1);
  const [ga, gc] = s[0].gambe;
  assert.deepEqual([ga.quota, ga.bookmaker, ga.quotaDaVerificare], [1.31, 'sportium', false]);
  assert.deepEqual([gc.quota, gc.bookmaker ?? null, gc.quotaDaVerificare], [1.2, null, true]);
  const t = testoSchedinePronostici(s, '2026-10-25');
  assert.match(t, /Vince A @1,31 su Sportium/);
  assert.match(t, /Vince C @1,20 \(quota minima, da verificare/);
});

// ---- Giro ----

const cartella = () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-odss-giro-'));
  for (const s of ['raccolta', 'giornate', 'registro', 'segnature', 'taratura']) mkdirSync(join(d, s));
  writeFileSync(join(d, 'taratura', 'calibrazione.json'), JSON.stringify(CAL));
  writeFileSync(join(d, 'raccolta', `${DATA}.json`), JSON.stringify({
    data: DATA, generataAlle: '2026-10-23T07:35:00+02:00', crediti: {}, competizioniNonCoperte: [], erroriGiro: [],
    partite: [{ ...partitaRaccolta([mercato('Doppia chance', '1X')]), modello: 'dixon-coles', lambda: { casa: 1.8, trasferta: 0.9 }, ragionamentoBase: [] }],
  }));
  return d;
};

test('giro: legge data/raccolta/<oggi>-odss.json e mette la quota migliore nei pronostici; errori del file in erroriGiro', async () => {
  const d = cartella();
  const f = fetchFinto({ '1x2': [[]], dc: [[dcRiga([bk('pinnacle', { 12: 1.3, '1X': 1.15, X2: 2.3 })])]], ou: [[]] });
  const { file } = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, fetch: f, stato: null });
  file.erroriGiro.push('odss-api alle 07:36: prova');
  writeFileSync(join(d, 'raccolta', `${DATA}-odss.json`), JSON.stringify(file));
  const g = eseguiGiro({ dirData: d, adesso: new Date('2026-10-23T07:10:00Z'), modo: 'riserva' }).giornata;
  const x = g.pronostici[0].pronostici[0];
  assert.deepEqual([x.quotaMigliore, x.bookmakerMigliore, x.quota, x.giocabile], [1.26, 'sportium', 1.26, true]);
  assert.ok(g.erroriGiro.includes('odss-api alle 07:36: prova'));
  // L'istantanea tiene il bookmaker della quota.
  const ist = JSON.parse(readFileSync(join(d, 'registro', `${DATA}-pronostici.json`), 'utf8'));
  assert.equal(ist.pronostici[0].bookmaker, 'sportium');
});

test('giro: senza il file odss i pronostici restano come prima, con una riga in erroriGiro', () => {
  const d = cartella();
  const g = eseguiGiro({ dirData: d, adesso: new Date('2026-10-23T07:10:00Z'), modo: 'riserva' }).giornata;
  assert.equal(g.pronostici[0].pronostici[0].quota, null);
  assert.ok(g.erroriGiro.includes(`Quote dei bookmaker italiani (odss-api) mancanti: data/raccolta/${DATA}-odss.json`), g.erroriGiro.join('\n'));
});

// ---- Telegram ----

test('Telegram: "quota migliore 1,31 su Sportium (minima 1,24)" con l\'orario, ✅ o solo da tenere d\'occhio', () => {
  const x = { mercato: '1X2', selezione: '1', testo: 'Vince Torino', prob: 0.85, limite: 0.82, n: 500, quotaMinima: 1.24, quota: 1.31, quotaMigliore: 1.31,
    bookmakerMigliore: 'sportium', oraQuota: '2026-10-23T05:40:00+00:00', probMercato: 0.83, giocabile: true, migliore: true, esito: null };
  const giornata = (y) => ({ data: DATA, pronostici: [{ idPartita: 'p', sport: 'calcio', partita: 'Torino - Monza', inizio: '2026-10-23T18:45:00Z', pronostici: [y] }] });
  const t = testoPronostici(giornata(x), DATA);
  assert.match(t, /quota migliore 1,31 su Sportium \(minima 1,24\), quota delle 07:40 ✅/);
  const occhio = testoPronostici(giornata({ ...x, giocabile: false, probMercato: 0.7 }), DATA);
  assert.match(occhio, /quota migliore 1,31 su Sportium \(minima 1,24\), quota delle 07:40 · solo da tenere d'occhio/);
  assert.doesNotMatch(occhio, /07:40 ✅/);
});

// ---- Workflow, comando, documenti ----

test('workflow: ODSS_API_KEY solo allo step della raccolta odss; npm run raccolta-odss; la riserva non la vede', () => {
  const w = readFileSync('.github/workflows/raccolta.yml', 'utf8');
  const step = w.split('\n      - ').filter((s) => s.includes('ODSS_API_KEY'));
  assert.equal(step.length, 1);
  assert.ok(step[0].includes('npm run raccolta-odss'));
  assert.ok(step[0].includes('ODSS_API_KEY: ${{ secrets.ODSS_API_KEY }}'));
  assert.ok(step[0].includes('continue-on-error: true'));
  assert.ok(!readFileSync('.github/workflows/riserva.yml', 'utf8').includes('ODSS_API_KEY'));
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).scripts['raccolta-odss'], 'node src/calcio/raccolta-odss.js');
  assert.match(readFileSync('docs/routine/giro-del-mattino.md', 'utf8'), /<oggi>-odss\.json/);
  assert.match(readFileSync('README.md', 'utf8'), /odss-api/);
});
