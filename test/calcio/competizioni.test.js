import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPETIZIONI } from '../../src/calcio/competizioni.js';
import { CONFIG } from '../../src/config.js';

test('16 competizioni con le quote (priorità 1-3) e 25 senza quote (priorità 4, solo pronostici)', () => {
  assert.equal(COMPETIZIONI.length, 41);
  const conQuote = COMPETIZIONI.filter((c) => c.chiave);
  assert.equal(conQuote.length, 16);
  assert.ok(conQuote.every((c) => c.nome && [1, 2, 3].includes(c.priorita)));
  const senza = COMPETIZIONI.filter((c) => !c.chiave);
  assert.ok(senza.every((c) => c.nome && c.csv && c.priorita === 4 && c.modello === 'dixon-coles'));
  assert.equal(new Set(COMPETIZIONI.map((c) => c.nome)).size, 41);
  assert.equal(COMPETIZIONI.filter((c) => c.priorita === 1).length, 7);
  assert.equal(COMPETIZIONI.filter((c) => c.priorita === 2).length, 5);
  assert.equal(COMPETIZIONI.filter((c) => c.priorita === 3).length, 4);
});
test('il modello è dixon-coles solo con il csv', () =>
  assert.ok(COMPETIZIONI.every((c) => c.modello === (c.csv ? 'dixon-coles' : 'solo-pinnacle'))));
test('CONFIG.calcio congelato con i valori dello spec', () => {
  assert.equal(CONFIG.calcio.correzioneMax, 0.08);
  assert.equal(CONFIG.calcio.scartoMaxPinnacle, 0.10);
  assert.equal(CONFIG.calcio.rho, -0.08);
  assert.equal(CONFIG.calcio.golMaxMatrice, 10);
  assert.ok(Object.isFrozen(CONFIG.calcio));
});
