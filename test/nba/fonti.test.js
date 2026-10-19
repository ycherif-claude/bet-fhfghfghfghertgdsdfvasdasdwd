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
