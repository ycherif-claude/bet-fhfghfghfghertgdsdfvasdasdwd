import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balldontlie } from '../../src/nba/fonti/balldontlie.js';
import { sportsgameodds, americanaInDecimale } from '../../src/nba/fonti/sportsgameodds.js';

const leggi = (nome) => readFileSync(new URL(`../fixtures/nba/${nome}`, import.meta.url), 'utf8');
const risposta = (status, testo) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(), text: async () => testo });
function fetchFinto(risposte) {
  const chiamate = [];
  const f = async (url, init) => {
    chiamate.push({ url: String(url), init });
    return risposte[Math.min(chiamate.length - 1, risposte.length - 1)];
  };
  f.chiamate = chiamate;
  return f;
}
const pagineBdl = () => fetchFinto(['p1', 'p2', 'p3'].map((p) => risposta(200, leggi(`balldontlie-${p}.json`))));
const finestra = { da: new Date('2026-10-20T06:00:00Z'), a: new Date('2026-10-21T06:00:00Z') };

test('balldontlie segue il cursore e aspetta tra le pagine', async () => {
  const f = pagineBdl();
  const t0 = Date.now();
  const p = await balldontlie.partite({ date: ['2026-10-20'], stagioni: [2026] }, { fetch: f, attesaMs: 30, chiave: 'K1' });
  assert.equal(f.chiamate.length, 3);
  assert.ok(Date.now() - t0 >= 55);
  assert.ok(f.chiamate[0].url.includes('per_page=100'));
  assert.ok(f.chiamate[0].url.includes('dates%5B%5D=2026-10-20'));
  assert.ok(!f.chiamate[0].url.includes('cursor='));
  assert.ok(f.chiamate[1].url.includes('cursor=1001'));
  assert.ok(f.chiamate[2].url.includes('cursor=1003'));
  assert.equal(f.chiamate[0].init.headers.Authorization, 'K1');
  assert.ok(!f.chiamate[0].url.includes('K1'));
  assert.equal(p.length, 3);
});

test('partita delle 19:30 di New York del 20/10: dataUsa 2026-10-20, inizio 2026-10-21T01:30:00+02:00', async () => {
  const p = await balldontlie.partite({}, { fetch: pagineBdl(), attesaMs: 0 });
  assert.deepEqual(p[0], {
    id: 1001, dataUsa: '2026-10-20', inizio: '2026-10-21T01:30:00+02:00',
    casa: 'New York Knicks', trasferta: 'Boston Celtics', puntiCasa: null, puntiTrasferta: null,
    finita: false, stagione: 2026, postseason: false,
  });
});

test('balldontlie: finita solo con Final, squadra sconosciuta scartata e segnalata', async () => {
  const p = await balldontlie.partite({}, { fetch: pagineBdl(), attesaMs: 0 });
  assert.equal(p[1].finita, true);
  assert.equal(p[1].puntiCasa, 112);
  assert.equal(p[2].finita, false);
  assert.equal(p[2].puntiCasa, 70);
  assert.deepEqual(p.nonRiconosciute, ['Seattle Foo']);
  assert.equal(Object.keys(p).includes('nonRiconosciute'), false);
  assert.ok(!p.some((x) => x.id === 1003));
});

test('balldontlie: datetime nullo → inizio null', async () => {
  const corpo = { data: [{ id: 5, date: '2026-10-19', datetime: null, status: 'Final', season: 2026, postseason: true,
    home_team_score: 1, visitor_team_score: 2,
    home_team: { full_name: 'Miami Heat', abbreviation: 'MIA' }, visitor_team: { full_name: 'Boston Celtics', abbreviation: 'BOS' } }], meta: {} };
  const p = await balldontlie.partite({}, { fetch: fetchFinto([risposta(200, JSON.stringify(corpo))]), attesaMs: 0 });
  assert.equal(p[0].inizio, null);
  assert.equal(p[0].postseason, true);
});

test('sportsgameodds: quote americane -110 → 1.91, +150 → 2.5', async () => {
  assert.equal(americanaInDecimale('-110'), 1.91);
  assert.equal(americanaInDecimale('+150'), 2.5);
  const f = fetchFinto([risposta(200, leggi('sgo-p1.json')), risposta(200, leggi('sgo-p2.json'))]);
  const ev = await sportsgameodds.eventi(finestra, { fetch: f, attesaMs: 0, chiave: 'SEGRETA' });
  assert.equal(f.chiamate.length, 2);
  assert.ok(f.chiamate[0].url.includes('leagueID=NBA'));
  assert.ok(f.chiamate[0].url.includes('oddsAvailable=true'));
  assert.ok(f.chiamate[1].url.includes('cursor=abc123'));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].casa, 'New York Knicks');
  assert.equal(ev[0].inizio, '2026-10-21T01:30:00+02:00');
  const dk = ev[0].bookmaker.find((b) => b.chiave === 'draftkings');
  const fd = ev[0].bookmaker.find((b) => b.chiave === 'fanduel');
  assert.deepEqual(dk.mercati.vincente, { casa: 1.91, trasferta: 1.91 });
  assert.deepEqual(fd.mercati.vincente, { casa: 2.5, trasferta: 1.56 });
  assert.deepEqual(dk.mercati.totale, { '224.5': { over: 1.93, under: 1.89 } });
  // betmgm: quota di casa non disponibile e nessun altro mercato → bookmaker omesso
  assert.equal(ev[0].bookmaker.find((b) => b.chiave === 'betmgm'), undefined);
  assert.deepEqual(ev.nonRiconosciute, ['Seattle Foo']);
});

test('sportsgameodds: handicap con linee diverse tra bookmaker restano separate per linea', async () => {
  const f = fetchFinto([risposta(200, leggi('sgo-p2.json').replace('Seattle Foo', 'Boston Celtics'))]);
  const ev = await sportsgameodds.eventi(finestra, { fetch: f, attesaMs: 0, chiave: 'K' });
  const dk = ev[0].bookmaker.find((b) => b.chiave === 'draftkings');
  const fd = ev[0].bookmaker.find((b) => b.chiave === 'fanduel');
  assert.deepEqual(dk.mercati.handicap, { '-4.5': { casa: 1.91, trasferta: 1.91 } });
  assert.deepEqual(fd.mercati.handicap, { '-5': { casa: 1.95, trasferta: 1.87 } });
  assert.deepEqual(fd.mercati.totale, { '225': { over: 1.91, under: 1.91 } });
});

test('errore 401 senza chiave nel messaggio', async () => {
  const f = fetchFinto([risposta(401, '')]);
  await assert.rejects(balldontlie.partite({}, { fetch: f, attesaMs: 0, chiave: 'SEGRETA' }),
    (e) => e.status === 401 && !e.message.includes('SEGRETA'));
  const g = fetchFinto([risposta(401, '')]);
  await assert.rejects(sportsgameodds.eventi(finestra, { fetch: g, attesaMs: 0, chiave: 'SEGRETA' }),
    (e) => e.status === 401 && !e.message.includes('SEGRETA'));
});

// --- Round di correzione 1 ---

function eventoSgo(modifica) {
  const corpo = JSON.parse(leggi('sgo-p1.json'));
  delete corpo.nextCursor;
  modifica?.(corpo.data[0]);
  return fetchFinto([risposta(200, JSON.stringify(corpo))]);
}
const eventiSgo = (f) => sportsgameodds.eventi(finestra, { fetch: f, attesaMs: 0, chiave: 'K' });

test('sportsgameodds: spread mancante → handicap non emesso e contato in lineaMancante', async () => {
  const ev = await eventiSgo(eventoSgo((e) => { delete e.odds['points-home-game-sp-home'].byBookmaker.draftkings.spread; }));
  const dk = ev[0].bookmaker.find((b) => b.chiave === 'draftkings');
  assert.equal(dk.mercati.handicap, undefined);
  assert.deepEqual(ev.diagnostica, { lineaMancante: { handicap: 1, totale: 0 }, quoteNonConvertibili: 0, handicapAsimmetrico: 0 });
});

test('sportsgameodds: handicap asimmetrico contato, nessun ripiego su overUnder', async () => {
  const ev = await eventiSgo(eventoSgo((e) => {
    e.odds['points-away-game-sp-away'].byBookmaker.draftkings.spread = '5';
    // un overUnder sul mercato sp non deve essere usato al posto di spread
    delete e.odds['points-home-game-sp-fanduel'];
    delete e.odds['points-home-game-sp-home'].byBookmaker.fanduel.spread;
    e.odds['points-home-game-sp-home'].byBookmaker.fanduel.overUnder = '-5';
  }));
  assert.equal(ev[0].bookmaker.find((b) => b.chiave === 'draftkings').mercati.handicap, undefined);
  assert.equal(ev[0].bookmaker.find((b) => b.chiave === 'fanduel').mercati.handicap, undefined);
  assert.deepEqual(ev.diagnostica, { lineaMancante: { handicap: 1, totale: 0 }, quoteNonConvertibili: 0, handicapAsimmetrico: 1 });
});

test('sportsgameodds: prezzo "EVEN" o non numerico → non convertibile, contato', async () => {
  const ev = await eventiSgo(eventoSgo((e) => { e.odds['points-all-game-ou-over'].byBookmaker.draftkings.odds = 'EVEN'; }));
  assert.equal(ev[0].bookmaker.find((b) => b.chiave === 'draftkings').mercati.totale, undefined);
  assert.equal(ev[0].bookmaker.find((b) => b.chiave === 'fanduel').mercati.totale['225'].over, 1.91);
  assert.equal(ev.diagnostica.quoteNonConvertibili, 1);
  assert.equal(americanaInDecimale('abc'), null);
  assert.equal(americanaInDecimale('EVEN'), null);
});

test('americane +100 e -100 → 2.0', () => {
  assert.equal(americanaInDecimale('+100'), 2);
  assert.equal(americanaInDecimale('-100'), 2);
});

test('inizio nella settimana 25/10-1/11 (USA EDT, Roma CET): 23:30Z → 00:30+01:00', async () => {
  const corpo = { data: [{ id: 7, date: '2026-10-27', datetime: '2026-10-27T23:30:00.000Z', status: '7:30 pm ET', season: 2026, postseason: false,
    home_team_score: null, visitor_team_score: null,
    home_team: { full_name: 'Miami Heat' }, visitor_team: { full_name: 'Boston Celtics' } }], meta: {} };
  const p = await balldontlie.partite({}, { fetch: fetchFinto([risposta(200, JSON.stringify(corpo))]), attesaMs: 0 });
  assert.equal(p[0].inizio, '2026-10-28T00:30:00+01:00');
  assert.equal(p[0].dataUsa, '2026-10-27');
});

test('cursore ripetuto → errore (balldontlie e sportsgameodds)', async () => {
  const bdl = JSON.stringify({ data: [], meta: { next_cursor: 5 } });
  await assert.rejects(balldontlie.partite({}, { fetch: fetchFinto([risposta(200, bdl)]), attesaMs: 0 }), /cursore ripetuto/);
  const sgo = JSON.stringify({ data: [], nextCursor: 'x' });
  await assert.rejects(eventiSgo(fetchFinto([risposta(200, sgo)])), /cursore ripetuto/);
});

test('oltre 50 pagine → errore', async () => {
  let n = 0;
  const f = async () => risposta(200, JSON.stringify({ data: [], meta: { next_cursor: ++n } }));
  await assert.rejects(balldontlie.partite({}, { fetch: f, attesaMs: 0 }), /oltre 50 pagine/);
  let m = 0;
  const g = async () => risposta(200, JSON.stringify({ data: [], nextCursor: `c${++m}` }));
  await assert.rejects(eventiSgo(g), /oltre 50 pagine/);
});

test('nonRiconosciute registra entrambi i nomi; balldontlie senza date è scartata e contata', async () => {
  const corpo = { data: [
    { id: 8, date: '2026-10-20', status: 'Final', home_team: { full_name: 'Foo A' }, visitor_team: { full_name: 'Foo B' } },
    { id: 9, status: 'Final', season: 2026, home_team: { full_name: 'Miami Heat' }, visitor_team: { full_name: 'Boston Celtics' } },
  ], meta: {} };
  const p = await balldontlie.partite({}, { fetch: fetchFinto([risposta(200, JSON.stringify(corpo))]), attesaMs: 0 });
  assert.equal(p.length, 0);
  assert.deepEqual(p.nonRiconosciute, ['Foo A', 'Foo B']);
  assert.equal(p.diagnostica.senzaData, 1);
  const sgo = eventoSgo((e) => { e.teams.home.names.long = 'Foo A'; e.teams.away.names.long = 'Foo B'; });
  assert.deepEqual((await eventiSgo(sgo)).nonRiconosciute, ['Foo A', 'Foo B']);
});

test('balldontlie: il limite vale anche tra due chiamate consecutive', async () => {
  const una = () => fetchFinto([risposta(200, JSON.stringify({ data: [], meta: { next_cursor: null } }))]);
  const istanti = [];
  const conOra = (f) => async (...a) => { istanti.push(Date.now()); return f(...a); };
  await balldontlie.partite({ date: ['2026-10-20'] }, { fetch: conOra(una()), attesaMs: 80 });
  await balldontlie.partite({ date: ['2026-10-21'] }, { fetch: conOra(una()), attesaMs: 80 });
  assert.equal(istanti.length, 2);
  assert.ok(istanti[1] - istanti[0] >= 75, `solo ${istanti[1] - istanti[0]} ms tra le richieste`);
  // Con attesaMs 0 nessuna attesa.
  const t0 = Date.now();
  await balldontlie.partite({}, { fetch: una(), attesaMs: 0 });
  assert.ok(Date.now() - t0 < 50);
});
