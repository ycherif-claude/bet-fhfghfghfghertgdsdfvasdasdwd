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
test('in corso conta come persa per risultatoSettimana e stop', () => {
  const gs = [g('a', '2026-10-20T18:00:00+02:00', { esito: 'persa' }),
    g('b', '2026-10-21T10:00:00+02:00')];
  const r = statoBankroll(gs, [s('a', { puntataReale: 45 }), s('b', { puntataReale: 6 })], ADESSO);
  assert.equal(r.risultatoSettimana, -51);
  assert.equal(r.stopRaggiunto, true);
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
test('distanzaStop = 50 + risultatoSettimana', () => {
  const r = statoBankroll([g('a', '2026-10-20T18:00:00+02:00', { esito: 'persa' })], [s('a', { puntataReale: 20 })], ADESSO);
  assert.equal(r.risultatoSettimana, -20);
  assert.equal(r.distanzaStop, 30);
  assert.equal(r.stopRaggiunto, false);
});
test('profitti di settimane precedenti contano nel bankroll ma non nella settimana', () => {
  const r = statoBankroll([g('a', '2026-10-14T18:00:00+02:00', { esito: 'vinta' })], [s('a')], ADESSO);
  assert.equal(r.bankroll, 210);
  assert.equal(r.risultatoSettimana, 0);
});
