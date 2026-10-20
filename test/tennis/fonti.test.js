import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scarica } from '../../src/calcio/fonti/http.js';
import { tennisData } from '../../src/tennis/fonti/tennis-data.js';
import { oddsTennis } from '../../src/tennis/fonti/odds-tennis.js';

const leggi = (nome) => readFileSync(new URL(`../fixtures/tennis/${nome}`, import.meta.url), 'utf8');
const finestra = { da: new Date('2026-10-20T06:00:00Z'), a: new Date('2026-10-21T06:00:00Z') };

function risposta(status, corpo, headers = {}) {
  const buf = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo);
  return {
    status, ok: status >= 200 && status < 300, headers: new Headers(headers),
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
  };
}
function fetchFinto(risposte) {
  const chiamate = [];
  const f = async (url, init) => {
    chiamate.push({ url: String(url), init });
    return risposte[Math.min(chiamate.length - 1, risposte.length - 1)];
  };
  f.chiamate = chiamate;
  return f;
}

test('scarica con binario restituisce un Buffer e il testo resta invariato', async () => {
  const bytes = Buffer.from([0x50, 0x4b, 0xff, 0x00, 0x03]);
  const b = await scarica('https://esempio.it/x', { fetch: fetchFinto([risposta(200, bytes)]), attesaMs: 0, binario: true });
  assert.ok(Buffer.isBuffer(b.corpo));
  assert.deepEqual(b.corpo, bytes);
  const t = await scarica('https://esempio.it/x', { fetch: fetchFinto([risposta(200, 'ciao')]), attesaMs: 0 });
  assert.equal(t.testo, 'ciao');
  assert.equal(t.corpo, undefined);
});

test('fileStagione prende l\'URL con la cartella strana da alldata.php', async () => {
  const f = fetchFinto([risposta(200, leggi('alldata.html'))]);
  const atp = await tennisData.fileStagione(2026, 'atp', { fetch: f, attesaMs: 0 });
  assert.equal(atp, 'https://www.tennis-data.co.uk/hrjk-85HytOjkhth76j_ygh4jf7/2026/2026.xlsx');
  assert.equal(f.chiamate[0].url, 'http://www.tennis-data.co.uk/alldata.php');
  assert.equal(f.chiamate[0].init.headers['User-Agent'], 'analisi-giocate (progetto personale)');
  const wta = await tennisData.fileStagione(2026, 'wta', { fetch: f, attesaMs: 0 });
  assert.equal(wta, 'https://www.tennis-data.co.uk/hrjk-85HytOjkhth76j_ygh4jf7/2026w/2026.xlsx');
  await assert.rejects(tennisData.fileStagione(2019, 'atp', { fetch: f, attesaMs: 0 }), /non trovato/);
});

test('partite converte le righe: superfici, set, commento, quote Pinnacle', async () => {
  const righe = [
    { ATP: 1, Location: 'Paris', Date: '2026-10-19', Tournament: 'Paris Masters', Series: 'Masters 1000', Surface: 'Carpet', Round: '1st Round', 'Best of': 3,
      Winner: 'Sinner J.', Loser: 'Rune H.', W1: 6, L1: 4, W2: 7, L2: 6, W3: 3, L3: 0, Comment: 'Completed', PSW: 1.2, PSL: 4.5 },
    { Date: '2026-10-19', Tournament: 'X', Tier: 'WTA500', Surface: 'Clay', Round: 'Final', 'Best of': 3,
      Winner: 'A B.', Loser: 'C D.', W1: 6, L1: 3, Comment: 'Retired' },
    { Date: '2026-10-19', Tournament: 'X', Series: 'ATP250', Surface: 'Grass', Winner: 'E F.', Loser: 'G H.', Comment: 'Walkover' },
    { Date: '2026-10-19', Tournament: 'X', Surface: '???', Winner: 'I J.', Loser: 'K L.' },
    { Date: 46023, Winner: 'senza data valida', Loser: 'Y' },
  ];
  const f = fetchFinto([risposta(200, leggi('alldata.html')), risposta(200, Buffer.from([1, 2, 3]))]);
  let ricevuto;
  const p = await tennisData.partite(2026, 'atp', { fetch: f, attesaMs: 0, leggi: (b) => { ricevuto = b; return righe; } });
  assert.deepEqual(ricevuto, Buffer.from([1, 2, 3]));
  assert.equal(f.chiamate[1].url, 'https://www.tennis-data.co.uk/hrjk-85HytOjkhth76j_ygh4jf7/2026/2026.xlsx');
  assert.equal(p.length, 4);
  assert.deepEqual(p[0], {
    data: '2026-10-19', torneo: 'Paris Masters', luogo: 'Paris', serie: 'Masters 1000', superficie: 'cemento', turno: '1st Round', bestOf: 3,
    vincitore: 'Sinner J.', perdente: 'Rune H.', setW: [6, 7, 3], setL: [4, 6, 0], commento: null, psw: 1.2, psl: 4.5,
  });
  assert.equal(p[1].superficie, 'terra');
  assert.equal(p[1].serie, 'WTA500');
  assert.equal(p[1].commento, 'Retired');
  assert.deepEqual(p[1].setL, [3]);
  assert.equal(p[1].psw, undefined);
  assert.equal(p[2].superficie, 'erba');
  assert.equal(p[2].commento, 'Walkover');
  assert.deepEqual(p[2].setW, []);
  assert.equal(p[3].superficie, 'cemento');
});

test('torneiAttivi tiene solo tennis ATP/WTA attivi', async () => {
  const f = fetchFinto([risposta(200, leggi('sports.json'))]);
  const t = await oddsTennis.torneiAttivi({ chiave: 'K', fetch: f, attesaMs: 0 });
  assert.deepEqual(t, [
    { chiave: 'tennis_atp_paris_masters', titolo: 'ATP Paris Masters', circuito: 'atp' },
    { chiave: 'tennis_wta_tokyo', titolo: 'WTA Tokyo', circuito: 'wta' },
    { chiave: 'tennis_atp_us_open_winner', titolo: 'US Open', circuito: 'atp' },
  ]);
  assert.match(f.chiamate[0].url, /\/v4\/sports\?apiKey=K$/);
});

test('quote chiede solo h2h e converte gli esiti per nome del giocatore', async () => {
  const f = fetchFinto([risposta(200, leggi('odds.json'), { 'x-requests-remaining': '480', 'x-requests-used': '20' })]);
  const r = await oddsTennis.quote('tennis_atp_paris_masters', finestra, { chiave: 'K', fetch: f, attesaMs: 0 });
  const u = new URL(f.chiamate[0].url);
  assert.equal(u.pathname, '/v4/sports/tennis_atp_paris_masters/odds');
  assert.equal(u.searchParams.get('markets'), 'h2h');
  assert.equal(u.searchParams.get('regions'), 'eu');
  assert.equal(u.searchParams.get('oddsFormat'), 'decimal');
  assert.deepEqual(r, {
    eventi: [{
      id: 'e1', giocatore1: 'Jannik Sinner', giocatore2: 'Carlos Alcaraz', inizio: '2026-10-21T10:00:00Z',
      bookmaker: [{ chiave: 'pinnacle', aggiornato: '2026-10-20T08:00:00Z', quote: { 'Jannik Sinner': 1.8, 'Carlos Alcaraz': 2.05 } }],
    }],
    rimasti: 480, usati: 20,
  });
});

test('eventi e risultati usano gli endpoint giusti', async () => {
  const f = fetchFinto([risposta(200, JSON.stringify([{ id: 'e1', home_team: 'A', away_team: 'B', commence_time: 'T' }]), { 'x-requests-remaining': '9' })]);
  const e = await oddsTennis.eventi('tennis_wta_tokyo', finestra, { chiave: 'K', fetch: f, attesaMs: 0 });
  assert.deepEqual(e, { eventi: [{ id: 'e1', giocatore1: 'A', giocatore2: 'B', inizio: 'T' }], rimasti: 9 });
  assert.match(f.chiamate[0].url, /\/sports\/tennis_wta_tokyo\/events\?/);
  const sc = JSON.stringify([
    { completed: true, home_team: 'A', away_team: 'B', commence_time: 'T', scores: [{ name: 'A', score: '1' }, { name: 'B', score: '2' }] },
    { completed: false, home_team: 'C', away_team: 'D', scores: null },
  ]);
  const f2 = fetchFinto([risposta(200, sc)]);
  const r = await oddsTennis.risultati('tennis_wta_tokyo', { chiave: 'K', fetch: f2, attesaMs: 0 });
  assert.match(f2.chiamate[0].url, /\/scores\?.*daysFrom=3/);
  assert.equal(r.length, 1);
  assert.equal(r[0].vincitore, 'B');
});

test('errore 401 senza la chiave nel messaggio', async () => {
  const f = fetchFinto([risposta(401, 'no')]);
  await assert.rejects(
    oddsTennis.quote('tennis_atp_paris_masters', finestra, { chiave: 'SEGRETA123', fetch: f, attesaMs: 0 }),
    (e) => /401/.test(e.message) && !e.message.includes('SEGRETA123'),
  );
});

test('partite: righe presenti ma nessuna leggibile → errore "formato cambiato?"; file vuoto → []', async () => {
  const f = () => fetchFinto([risposta(200, leggi('alldata.html')), risposta(200, Buffer.from([1]))]);
  const righe = [{ Data: '2026-10-19', Vincitore: 'A', Perdente: 'B' }, { Date: 46023, Winner: 'X', Loser: 'Y' }];
  await assert.rejects(
    tennisData.partite(2026, 'atp', { fetch: f(), attesaMs: 0, leggi: () => righe }),
    { message: 'tennis-data.co.uk: nessuna riga leggibile (formato cambiato?)' },
  );
  assert.deepEqual(await tennisData.partite(2026, 'atp', { fetch: f(), attesaMs: 0, leggi: () => [] }), []);
});
