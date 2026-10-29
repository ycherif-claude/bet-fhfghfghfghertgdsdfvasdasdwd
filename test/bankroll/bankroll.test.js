import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statoBankroll } from '../../src/bankroll/bankroll.js';

const ADESSO = new Date('2026-10-21T12:00:00Z'); // mer 14:00 Roma, settimana del 19/10
const g = (id, inizio, extra = {}) => ({ id, inizio, stato: 'confermata', esito: null, ...extra });
const s = (idGiocata, extra = {}) => ({ idGiocata, fatta: true, quotaReale: 2, puntataReale: 10, ora: '2026-10-19T09:00:00+02:00', ...extra });

test('bankroll = 200 + profitti delle giocate fatte e chiuse, con la quota reale', () => {
  const r = statoBankroll([g('a', '2026-10-20T18:00:00+02:00', { esito: 'vinta' })],
    [s('a', { quotaReale: 1.90, puntataReale: 5 })], ADESSO);
  assert.equal(r.bankroll, 204.5);
});
test('rimborsata: profitto 0', () => {
  const r = statoBankroll([g('a', '2026-10-20T18:00:00+02:00', { esito: 'rimborsata' })], [s('a')], ADESSO);
  assert.equal(r.bankroll, 200);
  assert.equal(r.risultatoSettimana, 0);
});
test('giocata non segnata non conta nel bankroll', () => {
  const r = statoBankroll([g('a', '2026-10-20T18:00:00+02:00', { esito: 'vinta' })], [], ADESSO);
  assert.equal(r.bankroll, 200);
});
test('risultatoSettimana solo con le giocate chiuse: le in corso non si sottraggono (contano in inGiocoOggi)', () => {
  const gs = [g('a', '2026-10-20T18:00:00+02:00', { esito: 'persa' }),
    g('b', '2026-10-21T10:00:00+02:00')];
  const r = statoBankroll(gs, [s('a', { puntataReale: 45 }), s('b', { puntataReale: 6 })], ADESSO);
  assert.equal(r.risultatoSettimana, -45);
  assert.equal(r.inGiocoOggi, 6);
  assert.equal(r.bankroll, 155); // le puntate in corso non scalano dal bankroll
});
test('inGiocoOggi = somma puntate reali delle giocate fatte di oggi non ancora chiuse', () => {
  const gs = [g('a', '2026-10-21T10:00:00+02:00'), g('b', '2026-10-21T20:00:00+02:00'),
    g('c', '2026-10-21T21:00:00+02:00', { esito: 'vinta' }), g('d', '2026-10-20T10:00:00+02:00'),
    g('e', '2026-10-22T09:00:00+02:00')];
  const r = statoBankroll(gs, gs.map((x) => s(x.id, { puntataReale: 10 })), ADESSO);
  assert.equal(r.inGiocoOggi, 20); // d è prima delle 08:00 di oggi, e dopo le 08:00 di domani
});
test('prima delle 08:00 la giornata è quella iniziata ieri alle 08:00', () => {
  const gs = [g('a', '2026-10-20T23:00:00+02:00'), g('b', '2026-10-21T07:00:00+02:00'),
    g('c', '2026-10-21T09:00:00+02:00')];
  const r = statoBankroll(gs, gs.map((x) => s(x.id)), new Date('2026-10-21T04:00:00Z')); // 06:00 Roma
  assert.equal(r.inGiocoOggi, 20);
});
test('daSegnare: giocate iniziate senza segnatura da meno di 24h', () => {
  const gs = [g('a', '2026-10-21T10:00:00+02:00'), g('b', '2026-10-21T18:00:00+02:00'),
    g('c', '2026-10-21T09:00:00+02:00', { stato: 'annullata' }), g('d', '2026-10-21T11:00:00+02:00')];
  const r = statoBankroll(gs, [s('d')], ADESSO);
  assert.deepEqual(r.daSegnare, ['a']);
});
test('dopo 24h senza segnatura vale come saltata e non è in daSegnare', () => {
  const r = statoBankroll([g('a', '2026-10-20T13:00:00+02:00')], [], ADESSO);
  assert.deepEqual(r.daSegnare, []);
});
test('segnatura con fatta:false = saltata', () => {
  const r = statoBankroll([g('a', '2026-10-21T10:00:00+02:00', { esito: 'persa' })],
    [s('a', { fatta: false, quotaReale: null, puntataReale: null })], ADESSO);
  assert.equal(r.bankroll, 200);
  assert.deepEqual(r.daSegnare, []);
});
test('più segnature per la stessa giocata: vale quella con ora più recente', () => {
  const r = statoBankroll([g('a', '2026-10-20T18:00:00+02:00', { esito: 'persa' })], [
    s('a', { puntataReale: 10, ora: '2026-10-20T10:00:00+02:00' }),
    s('a', { puntataReale: 4, ora: '2026-10-20T11:00:00+02:00' })], ADESSO);
  assert.equal(r.bankroll, 196);
});
test('fatta:true conta anche se la giocata è annullata', () => {
  const r = statoBankroll([g('a', '2026-10-20T18:00:00+02:00', { stato: 'annullata', esito: 'persa' })], [s('a')], ADESSO);
  assert.equal(r.bankroll, 190);
});
test('stop settimanale tolto: nessun campo stopRaggiunto né distanzaStop, anche con la settimana a −90', () => {
  const r = statoBankroll([g('a', '2026-10-20T18:00:00+02:00', { esito: 'persa' })], [s('a', { puntataReale: 90 })], ADESSO);
  assert.equal(r.risultatoSettimana, -90);
  assert.deepEqual(Object.keys(r).sort(), ['avvisi', 'bankroll', 'daSegnare', 'inGiocoOggi', 'risultatoSettimana', 'saldo']);
});
test('profitti di settimane precedenti contano nel bankroll ma non nella settimana', () => {
  const r = statoBankroll([g('a', '2026-10-14T18:00:00+02:00', { esito: 'vinta' })], [s('a')], ADESSO);
  assert.equal(r.bankroll, 210);
  assert.equal(r.risultatoSettimana, 0);
});

import { CONFIG } from '../../src/config.js';

test('CONFIG senza stopSettimanale (stop tolto dall\'utente il 21/10/2026)', () => {
  assert.equal('stopSettimanale' in CONFIG, false);
});

test('A4 prova: le giocate di prova non entrano in daSegnare, bankroll, inGiocoOggi, risultatoSettimana; se segnate fatte, avviso', async () => {
  const { giocateConProva } = await import('../../src/bankroll/bankroll.js');
  const gs = [
    g('p1', '2026-10-20T18:00:00+02:00', { esito: 'vinta', prova: true }),
    g('p2', '2026-10-21T10:00:00+02:00', { prova: true }),
    g('p3', '2026-10-21T11:00:00+02:00', { prova: true }),
  ];
  const r = statoBankroll(gs, [s('p1'), s('p2')], ADESSO);
  assert.equal(r.bankroll, 200);
  assert.equal(r.risultatoSettimana, 0);
  assert.equal(r.inGiocoOggi, 0);
  assert.deepEqual(r.daSegnare, []);
  assert.equal(r.avvisi.length, 2);
  assert.match(r.avvisi[0], /PROVA p1 .*non conta nel bankroll/);
  assert.deepEqual(statoBankroll([g('a', '2026-10-21T10:00:00+02:00')], [], ADESSO).avvisi, []);
  // Giornata scritta con prova: true: valgono come prova tutte le sue giocate.
  assert.deepEqual(giocateConProva({ prova: true, giocate: [{ id: 'x' }] }).map((x) => x.prova), [true]);
  assert.deepEqual(giocateConProva({ giocate: [{ id: 'x' }] }), [{ id: 'x' }]);
});

test('saldo da 0 dal 30/10, biglietti mai da segnare, multipla con il bonus nella vincita', async () => {
  const { bigliettiGiornata } = await import('../../src/storico/biglietti.js');
  const gamba = (id, inizio, esito) => ({ idPartita: id, sport: 'calcio', partita: `${id} - x`, inizio, quota: 1.4, esito });
  const giornata = {
    coppieQuota2: { margine: [{ id: 'Q2M1-2026-10-30', quota: 1.96, esito: 'vinta', ritorno: 1.96, gambe: [gamba('a', '2026-10-30T18:00:00+01:00', 'vinta'), gamba('b', '2026-10-30T20:00:00+01:00', 'vinta')] }], probabilita: [{ id: 'Q2P1-x', gambe: [] }] },
    multipleBonus: [
      { id: 'MBP5-2026-10-30', criterio: 'probabilita', quota: 5, incremento: 0.1, esito: 'vinta', ritorno: 5.5, gambe: [gamba('c', '2026-10-30T19:00:00+01:00', 'vinta')] },
      { id: 'MB10-2026-10-30', quota: 30, esito: null, gambe: [] },
      { id: 'MBP10-2026-10-30', criterio: 'probabilita', quota: 20, incremento: 0.35, esito: null, gambe: [gamba('d', '2026-10-30T21:00:00+01:00', null)] },
    ],
  };
  const b = bigliettiGiornata(giornata);
  assert.deepEqual(b.map((x) => [x.id, x.tipo]), [['Q2M1-2026-10-30', 'coppia'], ['MBP5-2026-10-30', 'multipla'], ['MBP10-2026-10-30', 'multipla']]);
  assert.equal(b[0].inizio, new Date('2026-10-30T18:00:00+01:00').toISOString());
  assert.equal(b[1].moltiplicatore, 1.1);
  const vecchia = { id: 'v', inizio: '2026-10-21T20:00:00+02:00', esito: 'persa', stato: 'confermata' };
  const segnature = [
    { idGiocata: 'Q2M1-2026-10-30', fatta: true, quotaReale: 2, puntataReale: 5, ora: '2026-10-30T09:00:00+01:00' },
    { idGiocata: 'MBP5-2026-10-30', fatta: true, quotaReale: 5, puntataReale: 1, ora: '2026-10-30T09:00:00+01:00' },
    { idGiocata: 'v', fatta: true, quotaReale: 2, puntataReale: 2, ora: '2026-10-21T09:00:00+02:00' },
  ];
  const s = statoBankroll([...b, vecchia], segnature, new Date('2026-10-30T23:00:00+01:00'));
  // Coppia 5 € a 2,00 vinta: +5; multipla 1 € a 5,00 con bonus 10%: 5,5 − 1 = +4,5; la giocata del 21/10 no.
  assert.equal(s.saldo, 9.5);
  assert.deepEqual(s.daSegnare, []);
});
