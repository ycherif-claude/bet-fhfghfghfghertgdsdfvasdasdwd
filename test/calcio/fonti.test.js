import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scarica } from '../../src/calcio/fonti/http.js';
import { oddsApi } from '../../src/calcio/fonti/odds-api.js';
import { footballDataUk } from '../../src/calcio/fonti/football-data-uk.js';
import { footballDataOrg } from '../../src/calcio/fonti/football-data-org.js';
import { leggiCsv } from '../../src/calcio/csv.js';

const leggi = (nome) => readFileSync(new URL(`../fixtures/calcio/${nome}`, import.meta.url), 'utf8');
const finestra = { da: new Date('2026-10-20T06:00:00Z'), a: new Date('2026-10-21T06:00:00Z') };

function risposta(status, testo, headers = {}) {
  return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), text: async () => testo };
}
function fetchFinto(risposte) {
  const chiamate = [];
  const f = async (url, init) => {
    chiamate.push({ url: String(url), init });
    const r = risposte[Math.min(chiamate.length - 1, risposte.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  f.chiamate = chiamate;
  return f;
}
const opzFixture = (nome, headers) => ({ fetch: fetchFinto([risposta(200, leggi(nome), headers)]), attesaMs: 0 });

test('scarica riprova 2 volte su 503 e poi riesce', async () => {
  const f = fetchFinto([risposta(503, ''), risposta(503, ''), risposta(200, 'ok')]);
  const r = await scarica('https://esempio.it/x', { fetch: f, attesaMs: 0 });
  assert.equal(r.testo, 'ok');
  assert.equal(f.chiamate.length, 3);
});

test('scarica riprova anche su errore di rete e su 429', async () => {
  const f = fetchFinto([new Error('rete'), risposta(429, ''), risposta(200, 'ok')]);
  assert.equal((await scarica('https://esempio.it/x', { fetch: f, attesaMs: 0 })).status, 200);
});

test("scarica: dopo 3 errori lancia un errore con l'host e senza la chiave", async () => {
  const f = fetchFinto([risposta(500, '')]);
  await assert.rejects(scarica('https://api.the-odds-api.com/v4/x?apiKey=SEGRETA', { fetch: f, attesaMs: 0 }),
    (e) => e.message.includes('api.the-odds-api.com') && !e.message.includes('SEGRETA'));
  assert.equal(f.chiamate.length, 3);
});

test('scarica: errore di rete con chiave nel messaggio non la rivela', async () => {
  const f = fetchFinto([new Error('fallito https://api.the-odds-api.com/v4/x?apiKey=SEGRETA&a=1')]);
  await assert.rejects(scarica('https://api.the-odds-api.com/v4/x?apiKey=SEGRETA', { fetch: f, attesaMs: 0 }),
    (e) => !e.message.includes('SEGRETA'));
});

test('scarica: 401 fallisce subito senza ripetere', async () => {
  const f = fetchFinto([risposta(401, '')]);
  await assert.rejects(scarica('https://api.the-odds-api.com/v4/x?apiKey=K', { fetch: f, attesaMs: 0 }),
    { message: 'api.the-odds-api.com: HTTP 401' });
  assert.equal(f.chiamate.length, 1);
});

test('oddsApi.eventi legge gli eventi e i crediti rimasti', async () => {
  const opz = opzFixture('events-serie-a.json', { 'x-requests-remaining': '450' });
  const r = await oddsApi.eventi('soccer_italy_serie_a', finestra, { ...opz, chiave: 'K' });
  assert.equal(r.rimasti, 450);
  assert.deepEqual(r.eventi[0], { id: 'ev1', casa: 'Inter', trasferta: 'Monza', inizio: '2026-10-20T18:45:00Z' });
  const url = opz.fetch.chiamate[0].url;
  assert.match(url, /\/sports\/soccer_italy_serie_a\/events\?/);
  assert.match(url, /commenceTimeFrom=2026-10-20T06(:|%3A)00(:|%3A)00Z/);
  assert.match(url, /apiKey=K/);
});

test('oddsApi.quote converte la fixture e legge i crediti', async () => {
  const opz = opzFixture('odds-serie-a.json', { 'x-requests-remaining': '412', 'x-requests-used': '88' });
  const r = await oddsApi.quote('soccer_italy_serie_a', finestra, { ...opz, chiave: 'K' });
  assert.equal(r.rimasti, 412);
  assert.equal(r.usati, 88);
  const ev = r.eventi[0];
  assert.ok(ev.bookmaker.some((b) => b.chiave === 'pinnacle'));
  const pin = ev.bookmaker.find((b) => b.chiave === 'pinnacle');
  assert.deepEqual(pin.mercati.h2h, { casa: 1.62, pareggio: 4.1, trasferta: 5.5 });
  assert.deepEqual(pin.mercati.totals['2.5'], { over: 1.9, under: 1.95 });
  assert.deepEqual(pin.mercati.totals['1.5'], { over: 1.5, under: 2.6 });
  assert.equal(pin.aggiornato, '2026-10-20T05:50:00Z');
  const url = opz.fetch.chiamate[0].url;
  assert.match(url, /regions=eu/);
  assert.match(url, /markets=h2h(,|%2C)totals/);
  assert.match(url, /oddsFormat=decimal/);
});

test('oddsApi.risultati tiene solo le partite concluse, senza dati del primo tempo', async () => {
  const opz = opzFixture('scores-europa.json');
  const r = await oddsApi.risultati('soccer_uefa_champs_league', { ...opz, chiave: 'K' });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { casa: 'Napoli', trasferta: 'Ajax', inizio: '2026-10-18T19:00:00Z', gc: 2, gt: 1, gcPT: null, gtPT: null, fonte: 'the-odds-api' });
  assert.match(opz.fetch.chiamate[0].url, /daysFrom=3/);
});

test('footballDataUk.partite legge data gg/mm/aaaa, xG, angoli e cartellini', async () => {
  const opz = { fetch: fetchFinto([risposta(200, leggi('I1.csv'))]), attesaMs: 0 };
  const partite = await footballDataUk.partite('I1', ['2627'], opz);
  const grezze = leggiCsv(leggi('I1.csv'));
  const p = partite[0];
  const g = grezze[0];
  assert.match(p.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.data, '2026-08-22');
  assert.equal(p.casa, 'Inter');
  assert.equal(p.gc, 4);
  assert.equal(p.gtPT, Number(g.HTAG));
  assert.equal(typeof p.xgC, 'number');
  assert.equal(p.xgC, 1.05);
  assert.equal(p.angoliC, Number(g.HC));
  assert.equal(p.cartC, Number(g.HY) + Number(g.HR));
  assert.equal(p.arbitro, null);
  assert.equal(partite.length, grezze.length);
  const { url, init } = opz.fetch.chiamate[0];
  assert.equal(url, 'https://www.football-data.co.uk/mmz4281/2627/I1.csv');
  assert.equal(init.headers['User-Agent'], 'analisi-giocate (progetto personale)');
});

test('footballDataUk.partite salta le righe senza gol e gestisce xG e arbitro', async () => {
  const csv = 'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,HC,AC,HY,AY,HR,AR,Referee\n'
    + 'I1,01/09/2026,A,B,1,0,0,0,5,3,1,0,0,1,M. Rossi\n'
    + 'I1,02/09/2026,C,D,,,,,,,,,,,\n';
  const opz = { fetch: fetchFinto([risposta(200, csv)]), attesaMs: 0 };
  const r = await footballDataUk.partite('I1', ['2627'], opz);
  assert.equal(r.length, 1);
  assert.equal(r[0].arbitro, 'M. Rossi');
  assert.equal(r[0].xgC, null);
  assert.equal(r[0].cartT, 1);
});

test('footballDataOrg.risultati tiene solo le partite FINISHED', async () => {
  const opz = opzFixture('fdorg-matches.json');
  const r = await footballDataOrg.risultati({ da: '2026-10-17', a: '2026-10-18' }, { ...opz, chiave: 'TOK' });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { casa: 'FC Internazionale Milano', trasferta: 'AC Monza', inizio: '2026-10-18T18:45:00Z', gc: 2, gt: 1, gcPT: 1, gtPT: 0, fonte: 'football-data.org' });
  const { url, init } = opz.fetch.chiamate[0];
  assert.match(url, /dateFrom=2026-10-17&dateTo=2026-10-18/);
  assert.equal(init.headers['X-Auth-Token'], 'TOK');
});

test('scarica: il timeout interrompe la richiesta e conta come errore di rete (ripetuto)', async () => {
  let chiamate = 0;
  const f = (url, { signal }) => {
    chiamate++;
    return new Promise((_, rifiuta) => signal.addEventListener('abort', () => rifiuta(signal.reason)));
  };
  await assert.rejects(scarica('https://esempio.it/x', { fetch: f, attesaMs: 0, timeoutMs: 10 }),
    (e) => e.message.includes('errore di rete'));
  assert.equal(chiamate, 3);
});
