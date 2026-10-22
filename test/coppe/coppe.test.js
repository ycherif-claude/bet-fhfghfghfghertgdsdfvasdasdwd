// Coppe europee (src/coppe): Elo, gol attesi, squadre, storico da ESPN con il risultato dei 90 minuti
// anche per le partite finite ai supplementari o ai rigori (correzione B3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRIOR, SOLO_COPPE, attesa, calcolaElo, lambdaCoppa, poissonLineare, stimaGol } from '../../src/coppe/elo.js';
import { idSquadra, nomeNelPaese } from '../../src/coppe/squadre.js';
import { aggiornaStoricoCoppe, giorniDiCoppa, partiteDaScoreboard, risultato90 } from '../../src/coppe/storico.js';
import { calcolaRating } from '../../src/coppe/rating.js';

const vicino = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// ---------- Elo ----------

test('coppe Elo: punteggi iniziali per campionato, vittoria in casa, margine di gol, campo neutro', () => {
  const r = calcolaElo([{ data: '2024-01-01', casa: 'ITA:Inter', trasferta: 'ENG:Leeds', gc: 1, gt: 0, codice: 'I1' }], { K: 30, H: 50 });
  // Inter (1700) e Leeds partono dal punteggio di Serie A (codice della partita).
  const d = 30 * (1 - attesa(50));
  vicino(r.get('ITA:Inter'), PRIOR.I1 + d);
  vicino(r.get('ENG:Leeds'), PRIOR.I1 - d);
  // 3 gol di scarto: K × (11 + 3) / 8; campo neutro: niente vantaggio casa.
  const n = calcolaElo([{ casa: 'a', trasferta: 'b', gc: 3, gt: 0, neutro: true }], { K: 30, H: 50 });
  vicino(n.get('a'), SOLO_COPPE + 30 * (14 / 8) * 0.5);
  // Partita senza risultato: chiama primaDi ma non cambia i punteggi.
  const visti = [];
  const s = calcolaElo([{ casa: 'a', trasferta: 'b', gc: null, gt: null }], { primaDi: (p, delta) => visti.push(delta) });
  assert.deepEqual(visti, [50]);
  assert.equal(s.get('a'), SOLO_COPPE);
});

test('coppe gol attesi: la regressione di Poisson ritrova i parametri; lambda casa e trasferta', () => {
  const x = [-1, -0.5, 0, 0.5, 1];
  const { a, b } = poissonLineare(x, x.map((v) => Math.exp(0.3 + 0.6 * v)));
  vicino(a, 0.3, 1e-6);
  vicino(b, 0.6, 1e-6);
  const gol = stimaGol([{ delta: 0, gc: 1, gt: 1 }, { delta: 400, gc: 3, gt: 0 }, { delta: -400, gc: 0, gt: 2 }, { delta: 200, gc: 2, gt: 1 }]);
  const l = lambdaCoppa(gol, 200);
  assert.ok(l.casa > l.trasferta);
  vicino(lambdaCoppa({ casa: { a: 0, b: 1 }, trasferta: { a: 0, b: 1 } }, 400).trasferta, Math.exp(-1));
});

test('coppe squadre: id ESPN → paese:nome del CSV, alias, altrimenti espn:<id>', () => {
  const ctx = { paeseDiEspn: new Map([['110', 'ITA'], ['999', 'ITA']]), nomiPerPaese: new Map([['ITA', ['Inter', 'Milan']], ['POL', ['Lech Poznan']]]) };
  assert.equal(idSquadra({ id: '110', nome: 'Internazionale' }, ctx), 'ITA:Inter');
  assert.equal(idSquadra({ id: '999', nome: 'Squadra ignota' }, ctx), 'espn:999');
  // Paese senza elenco ESPN: si cerca per nome.
  assert.equal(idSquadra({ id: '5', nome: 'Lech Poznan' }, ctx), 'POL:Lech Poznan');
  assert.equal(nomeNelPaese('Milan', ['Inter', 'Milan']), 'Milan');
});

// ---------- Storico ESPN: risultato dei 90 minuti ----------

const gol = (clock, team, extra = {}) => ({ type: { text: 'Goal' }, clock: { displayValue: clock }, team: { id: team }, scoringPlay: true, shootout: false, ownGoal: false, ...extra });
const giallo = (clock, team) => ({ type: { text: 'Yellow Card' }, clock: { displayValue: clock }, team: { id: team }, scoringPlay: false });
const evento = (id, stato, [casa, sc], [trasferta, st], details) => ({
  id, date: '2026-08-27T17:00Z',
  competitions: [{
    status: { type: { name: stato } }, neutralSite: false, details,
    competitors: [
      { homeAway: 'home', score: sc, team: { id: casa, displayName: `Squadra ${casa}` } },
      { homeAway: 'away', score: st, team: { id: trasferta, displayName: `Squadra ${trasferta}` } },
    ],
  }],
});
// FK Qarabag - FC Twente 1-4 dopo i supplementari: 1-2 ai 90 minuti (gol al 90'+2' compreso).
const qarabag = evento('401909619', 'STATUS_FINAL_AET', ['10414', '1'], ['152', '4'], [
  giallo("22'", '152'), gol("59'", '10414'), gol("79'", '152'), gol("90'+2'", '152'), gol("94'", '152'), gol("114'", '152'),
]);
// Jablonec - Rangers ai rigori: 1-0 nei tempi (73'), i rigori non contano.
const jablonec = evento('401910970', 'STATUS_FINAL_PEN', ['7922', '1'], ['257', '0'], [
  gol("73'", '7922'), gol("120'", '257', { shootout: true }), gol("120'", '7922', { shootout: true }),
]);

test('B3 storico: supplementari e rigori → risultato dei 90 minuti dai gol con il minuto', () => {
  assert.deepEqual(risultato90(qarabag.competitions[0]), { gc: 1, gt: 2 });
  assert.deepEqual(risultato90(jablonec.competitions[0]), { gc: 1, gt: 0 });
  // I gol nel dettaglio non tornano con il punteggio finale: niente risultato.
  const monco = evento('1', 'STATUS_FINAL_AET', ['1', '2'], ['2', '1'], [gol("10'", '1'), gol("100'", '2')]);
  assert.equal(risultato90(monco.competitions[0]), null);
  assert.equal(risultato90({ ...monco.competitions[0], details: undefined }), null);

  const [a, b] = partiteDaScoreboard({ events: [qarabag, jablonec] }, 'Conference League (preliminari)');
  assert.deepEqual([a.gc, a.gt, a.stato, a.controllato90], [1, 2, 'STATUS_FINAL_AET', true]);
  assert.deepEqual([b.gc, b.gt, b.stato], [1, 0, 'STATUS_FINAL_PEN']);
  const [c] = partiteDaScoreboard({ events: [monco] }, 'Europa League');
  assert.deepEqual([c.gc, c.gt, c.controllato90], [null, null, true]);
  // Nei 90 minuti come prima.
  const [f] = partiteDaScoreboard({ events: [evento('2', 'STATUS_FULL_TIME', ['1', '2'], ['2', '0'], [])] }, 'Europa League');
  assert.deepEqual([f.gc, f.gt], [2, 0]);
});

test('B3 storico: si scaricano tutti i giorni della settimana', () => {
  assert.deepEqual(giorniDiCoppa('2026-10-19', '2026-10-25'), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
  ]);
});

function fetchFinto(perUrl) {
  const chiesti = [];
  const f = async (url) => {
    chiesti.push(url);
    const corpo = perUrl(url) ?? { events: [] };
    return { ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(corpo) };
  };
  return { f, chiesti };
}

test('B3 storico: le vecchie partite ai supplementari senza risultato e i giorni mai scaricati si riprendono una volta', async () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-coppe-'));
  mkdirSync(join(d, 'storico'));
  const vecchia = { id: '401909619', coppa: 'Conference League (preliminari)', inizio: '2023-08-24T17:00Z', data: '2023-08-24',
    casa: { id: '10414', nome: 'Squadra 10414' }, trasferta: { id: '152', nome: 'Squadra 152' }, gc: null, gt: null, neutro: false, stato: 'STATUS_FINAL_AET' };
  const recente = { ...vecchia, id: '9', inizio: '2026-10-15T17:00Z', data: '2026-10-15', stato: 'STATUS_FULL_TIME', gc: 1, gt: 0 };
  writeFileSync(join(d, 'storico', 'coppe-europee.json'), JSON.stringify({ partite: [vecchia, recente] }));
  const { f, chiesti } = fetchFinto((url) => (/uefa\.europa\.conf_qual\/scoreboard\?dates=20230824$/.test(url) ? { events: [{ ...qarabag, date: '2023-08-24T17:00Z' }] } : null));
  const r = await aggiornaStoricoCoppe({ dirData: d, adesso: new Date('2026-10-22T06:00:00Z'), fetch: f, maxRiprese: 100000 });
  assert.deepEqual(r.errori, []);
  const salvato = JSON.parse(readFileSync(join(d, 'storico', 'coppe-europee.json'), 'utf8'));
  const p = salvato.partite.find((x) => x.id === '401909619');
  assert.deepEqual([p.gc, p.gt, p.controllato90], [1, 2, true]);
  // Ripresa completa una volta (anche sabato e lunedì, es. le finali): poi il segno nel file.
  assert.equal(salvato.tuttiIGiorni, true);
  assert.ok(chiesti.some((u) => /uefa\.champions\/scoreboard\?dates=20240601$/.test(u)), 'la finale di sabato 1/6/2024');
  assert.ok(chiesti.some((u) => /dates=20261019$/.test(u)), 'lunedì della settimana in corso');

  // Secondo giro: solo gli ultimi giorni, niente più ripresa completa né partite già controllate.
  const due = fetchFinto(() => null);
  await aggiornaStoricoCoppe({ dirData: d, adesso: new Date('2026-10-23T06:00:00Z'), fetch: due.f });
  assert.ok(due.chiesti.length <= 6 * 21, String(due.chiesti.length));
  assert.ok(!due.chiesti.some((u) => /dates=2023/.test(u)));
});

test('B3 storico: i giorni vecchi da riprendere sono al massimo maxRiprese per giro, prima le partite ai supplementari', async () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-coppe-'));
  mkdirSync(join(d, 'storico'));
  const vecchia = { id: '401909619', coppa: 'Conference League (preliminari)', inizio: '2023-08-24T17:00Z', data: '2023-08-24',
    casa: { id: '10414', nome: 'Squadra 10414' }, trasferta: { id: '152', nome: 'Squadra 152' }, gc: null, gt: null, neutro: false, stato: 'STATUS_FINAL_AET' };
  const recente = { ...vecchia, id: '9', inizio: '2026-10-15T17:00Z', data: '2026-10-15', stato: 'STATUS_FULL_TIME', gc: 1, gt: 0 };
  writeFileSync(join(d, 'storico', 'coppe-europee.json'), JSON.stringify({ partite: [vecchia, recente] }));
  const { f, chiesti } = fetchFinto(() => null);
  await aggiornaStoricoCoppe({ dirData: d, adesso: new Date('2026-10-22T06:00:00Z'), fetch: f, maxRiprese: 10 });
  const finestra = 6 * 20; // dal 5/10 al 24/10, sei coppe
  assert.equal(chiesti.length, finestra + 10);
  assert.ok(chiesti.some((u) => /uefa\.europa\.conf_qual\/scoreboard\?dates=20230824$/.test(u)));
  const salvato = JSON.parse(readFileSync(join(d, 'storico', 'coppe-europee.json'), 'utf8'));
  assert.equal(salvato.tuttiIGiorni, true);
  assert.ok(salvato.daRiprendere.length > 1000);
  // Giro dopo: riprende dai giorni rimasti.
  const due = fetchFinto(() => null);
  await aggiornaStoricoCoppe({ dirData: d, adesso: new Date('2026-10-22T06:00:00Z'), fetch: due.f, maxRiprese: 10 });
  const tre = JSON.parse(readFileSync(join(d, 'storico', 'coppe-europee.json'), 'utf8'));
  // La partita ai supplementari che ESPN non ha restituito si riprova a ogni giro (1 richiesta): 9 giorni vecchi in meno.
  assert.equal(tre.daRiprendere.length, salvato.daRiprendere.length - 9);
});

test('B3 rating: le partite ai supplementari contano con il risultato dei 90 minuti per Elo e calibrazione', () => {
  const coppa = (id, data, gc, gt, stato = 'STATUS_FULL_TIME') => ({ id, coppa: 'Europa League', data, inizio: `${data}T19:00Z`,
    casa: { id: '1', nome: 'Alfa' }, trasferta: { id: '2', nome: 'Beta' }, gc, gt, neutro: false, stato });
  const base = { nazionali: [], paeseDiEspn: new Map() };
  const senza = calcolaRating({ ...base, coppe: [coppa('a', '2024-09-01', 2, 0), coppa('b', '2024-10-01', null, null, 'STATUS_FINAL_AET')] });
  const con = calcolaRating({ ...base, coppe: [coppa('a', '2024-09-01', 2, 0), coppa('b', '2024-10-01', 1, 1, 'STATUS_FINAL_AET')] });
  assert.equal(senza.campioni, 1);
  assert.equal(con.campioni, 2);
  assert.notEqual(con.rating['espn:1'], senza.rating['espn:1']);
});
