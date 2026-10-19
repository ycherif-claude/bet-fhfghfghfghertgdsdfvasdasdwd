import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineaComune, quotaMedianaNba, consensoNba } from '../../src/nba/quote.js';

const hc = (chiave, linea, casa, trasferta) => ({ chiave, mercati: { handicap: { [linea]: { casa, trasferta } } } });
const tot = (chiave, linea, over, under) => ({ chiave, mercati: { totale: { [linea]: { over, under } } } });
const vin = (chiave, casa, trasferta) => ({ chiave, mercati: { vincente: { casa, trasferta } } });

test('linea più comune: -4.5 su 3, -5 su 2 → -4.5', () => {
  const ev = { bookmaker: [hc('a', '-4.5', 1.9, 1.9), hc('b', '-4.5', 1.9, 1.9), hc('c', '-4.5', 1.9, 1.9), hc('d', '-5', 1.9, 1.9), hc('e', '-5', 1.9, 1.9)] };
  assert.equal(lineaComune(ev, 'handicap'), -4.5);
  assert.equal(lineaComune({ bookmaker: [] }, 'totale'), null);
});
test('parità: vince la più vicina alla mediana, poi la più bassa in valore assoluto', () => {
  const ev = { bookmaker: [tot('a', '220.5', 1.9, 1.9), tot('b', '220.5', 1.9, 1.9), tot('c', '221', 1.9, 1.9), tot('d', '221', 1.9, 1.9), tot('e', '225', 1.9, 1.9), tot('f', '225', 1.9, 1.9)] };
  // linee ordinate: 220.5,220.5,221,221,225,225 → mediana 221 → 221
  assert.equal(lineaComune(ev, 'totale'), 221);
  const pari = { bookmaker: [hc('a', '-3', 1.9, 1.9), hc('b', '3', 1.9, 1.9)] };
  assert.equal(lineaComune(pari, 'handicap'), -3);
});
test('linee non intere né mezze ignorate', () => {
  const ev = { bookmaker: [hc('a', '-4.25', 1.9, 1.9), hc('b', '-4.25', 1.9, 1.9), hc('c', '-4', 1.9, 1.9)] };
  assert.equal(lineaComune(ev, 'handicap'), -4);
});
test('mediana e consenso calcolati solo sui bookmaker con quella linea', () => {
  const ev = { bookmaker: [hc('a', '-4.5', 1.8, 2.0), hc('b', '-4.5', 1.9, 1.9), hc('c', '-4.5', 2.0, 1.8), hc('d', '-5', 5, 5)] };
  assert.deepEqual(quotaMedianaNba(ev, 'handicap', 'casa', -4.5), { quota: 1.9, n: 3 });
  assert.equal(quotaMedianaNba(ev, 'handicap', 'casa', -5), null);
  const pari = { bookmaker: [1.5, 1.6, 1.61, 2].map((q, i) => vin('b' + i, q, 2.5)) };
  assert.deepEqual(quotaMedianaNba(pari, 'vincente', 'casa'), { quota: 1.6, n: 4 });
});
test('meno di 3 bookmaker sulla linea → null', () => {
  const ev = { bookmaker: [tot('a', '220.5', 1.9, 1.9), tot('b', '220.5', 1.9, 1.9), tot('c', '221', 1.9, 1.9)] };
  assert.equal(quotaMedianaNba(ev, 'totale', 'over', 220.5), null);
  assert.equal(consensoNba(ev, 'totale', 220.5), null);
});
test('consenso: somma 1 e media dei bookmaker senza margine', () => {
  const ev = { bookmaker: [tot('a', '220.5', 1.9, 1.9), tot('b', '220.5', 1.8, 2.1), tot('c', '220.5', 2.0, 1.8), { chiave: 'd', mercati: { totale: { '220.5': { over: 1.9 } } } }] };
  const c = consensoNba(ev, 'totale', 220.5);
  assert.ok(Math.abs(c.over + c.under - 1) < 1e-12);
  const p = (o, u) => 1 / o / (1 / o + 1 / u);
  const atteso = (p(1.9, 1.9) + p(1.8, 2.1) + p(2.0, 1.8)) / 3;
  assert.ok(Math.abs(c.over - atteso) < 1e-12);
  const v = consensoNba({ bookmaker: [vin('a', 1.5, 2.6), vin('b', 1.5, 2.6), vin('c', 1.5, 2.6)] }, 'vincente');
  assert.ok(Math.abs(v.casa + v.trasferta - 1) < 1e-12);
});
