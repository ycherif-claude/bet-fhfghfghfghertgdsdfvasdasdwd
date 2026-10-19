import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puntataConsigliata, classificaTipo } from '../../src/regole/puntate.js';

test('Kelly 0.25 limitato a 1–3% per le singole', () => {
  assert.deepEqual(puntataConsigliata({ tipo: 'singola', prob: 0.61, quota: 1.85, bankroll: 200 }), { euro: 6, percentuale: 3 });
  assert.deepEqual(puntataConsigliata({ tipo: 'singola', prob: 0.55, quota: 1.92, bankroll: 200 }), { euro: 3, percentuale: 1.52 });
  assert.deepEqual(puntataConsigliata({ tipo: 'singola', prob: 0.35, quota: 3.0, bankroll: 200 }), { euro: 2, percentuale: 1 });
});
test('speciale fisso 1%, builder fisso 0.5%', () => {
  assert.equal(puntataConsigliata({ tipo: 'speciale', prob: 0.3, quota: 4, bankroll: 200 }).euro, 2);
  assert.equal(puntataConsigliata({ tipo: 'builder', prob: 0.2, quota: 6, bankroll: 200 }).euro, 1);
});
test('arrotonda a 0.50 per difetto', () =>
  assert.equal(puntataConsigliata({ tipo: 'singola', prob: 0.55, quota: 1.92, bankroll: 170 }).euro, 2.5));
test('classificaTipo: estremi e builder', () => {
  assert.equal(classificaTipo({ tipo: 'singola', prob: 0.5, quota: 3.0 }), 'singola');
  assert.equal(classificaTipo({ tipo: 'singola', prob: 0.5, quota: 3.01 }), 'speciale');
  assert.equal(classificaTipo({ tipo: 'builder', prob: 0.2, quota: 8.0 }), 'builder');
  assert.equal(classificaTipo({ tipo: 'builder', prob: 0.2, quota: 2.5 }), null);
});
