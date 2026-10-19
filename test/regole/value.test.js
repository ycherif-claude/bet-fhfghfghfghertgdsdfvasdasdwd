import test from 'node:test';
import assert from 'node:assert/strict';
import { calcolaValue, quotaGiusta, quotaMinima } from '../../src/regole/value.js';
import { CONFIG } from '../../src/config.js';

const round = (n) => Math.round(n * 10000) / 10000;

test('value = prob × quota − 1', () => assert.equal(round(calcolaValue(0.61, 1.85)), 0.1285));
test('quota giusta = 1/prob', () => assert.equal(round(quotaGiusta(0.5)), 2));
test('quota minima con quota gratuita: quota per cui il value è 5%', () =>
  assert.equal(round(quotaMinima({ prob: 0.6, quota: 1.9, quotaDaVerificare: false }, 'singola')), 1.75));
test('quota minima senza quota gratuita: quota giusta × 1.05', () =>
  assert.equal(round(quotaMinima({ prob: 0.5, quota: null, quotaDaVerificare: true }, 'singola')), 2.1));
test('speciali e builder usano × 1.10', () =>
  assert.equal(round(quotaMinima({ prob: 0.25, quota: null, quotaDaVerificare: true }, 'builder')), 4.4));
test('quota minima arrotonda per eccesso a 2 decimali', () =>
  assert.equal(quotaMinima({ prob: 0.55, quota: null, quotaDaVerificare: true }, 'speciale'), 2.0));
test('CONFIG è congelato in profondità', () => {
  assert.ok(Object.isFrozen(CONFIG));
  assert.ok(Object.isFrozen(CONFIG.quote.singola));
  assert.equal(CONFIG.bankrollIniziale, 200);
  assert.equal(CONFIG.kelly, 0.25);
});

test('quotaMinima con prob fuori da (0,1): errore', () => {
  for (const prob of [0, 1, -0.2, 1.5, NaN]) {
    assert.throws(() => quotaMinima({ prob, quota: null }, 'singola'), /probabilità non valida/);
  }
});
