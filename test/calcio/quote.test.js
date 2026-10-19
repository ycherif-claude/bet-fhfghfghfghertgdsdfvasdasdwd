import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotaMediana, probPinnacle } from '../../src/calcio/quote.js';

const bk = (chiave, h2h, totals) => ({ chiave, aggiornato: 'x', mercati: { ...(h2h && { h2h }), ...(totals && { totals }) } });
const h = (c) => ({ casa: c, pareggio: 3.5, trasferta: 4 });

test('mediana esclude gli exchange e richiede 3 bookmaker', () => {
  const ev = { bookmaker: [bk('a', h(1.5)), bk('b', h(1.7)), bk('betfair_ex_eu', h(9)), bk('matchbook', h(9)), bk('smarkets', h(9))] };
  assert.equal(quotaMediana(ev, 'h2h', '1'), null);
  ev.bookmaker.push(bk('c', h(1.6)));
  assert.deepEqual(quotaMediana(ev, 'h2h', '1'), { quota: 1.6, n: 3 });
});
test('mediana con numero pari: media delle centrali arrotondata per difetto', () => {
  const ev = { bookmaker: [1.5, 1.61, 1.62, 2].map((q, i) => bk('b' + i, h(q))) };
  assert.deepEqual(quotaMediana(ev, 'h2h', '1'), { quota: 1.61, n: 4 });
  const ev2 = { bookmaker: [1.5, 1.6, 1.61, 2].map((q, i) => bk('b' + i, h(q))) };
  assert.equal(quotaMediana(ev2, 'h2h', '1').quota, 1.6); // 1.605 -> 1.60
});
test('mediana dei totals per linea e selezione', () => {
  const t = (o) => ({ '2.5': { over: o, under: 2 } });
  const ev = { bookmaker: [bk('a', null, t(1.8)), bk('b', null, t(1.9)), bk('c', null, t(2.0)), bk('d', h(1.5))] };
  assert.deepEqual(quotaMediana(ev, 'totals', 'Over', '2.5'), { quota: 1.9, n: 3 });
  assert.equal(quotaMediana(ev, 'totals', 'Over', '3.5'), null);
});
test('Pinnacle senza margine: 1.90/1.90 -> 0.5/0.5; somma 1 su 1X2', () => {
  const ev = { bookmaker: [bk('pinnacle', { casa: 2, pareggio: 3.5, trasferta: 4 }, { '2.5': { over: 1.9, under: 1.9 } })] };
  assert.deepEqual(probPinnacle(ev, 'totals', '2.5'), { Over: 0.5, Under: 0.5 });
  const p = probPinnacle(ev, 'h2h');
  assert.ok(Math.abs(p['1'] + p.X + p['2'] - 1) < 1e-12);
  assert.ok(p['1'] > p.X && p.X > p['2']);
});
test('linea totals assente da Pinnacle: probPinnacle null per quella linea', () => {
  const ev = { bookmaker: [bk('pinnacle', null, { '2.5': { over: 1.9, under: 1.9 } })] };
  assert.equal(probPinnacle(ev, 'totals', '1.5'), null);
  assert.equal(probPinnacle(ev, 'h2h'), null);
  assert.equal(probPinnacle({ bookmaker: [] }, 'h2h'), null);
});
