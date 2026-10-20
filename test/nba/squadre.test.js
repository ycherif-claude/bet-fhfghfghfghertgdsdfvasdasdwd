import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SQUADRE, squadraNba } from '../../src/nba/squadre.js';
import { CONFIG } from '../../src/config.js';

test('30 squadre con abbreviazioni uniche', () => {
  assert.equal(SQUADRE.length, 30);
  assert.equal(new Set(SQUADRE.map((s) => s.abbr)).size, 30);
  assert.equal(new Set(SQUADRE.map((s) => s.nome)).size, 30);
});
test('LA Clippers, Los Angeles Clippers e LAC portano alla stessa squadra', () => {
  const a = squadraNba('LA Clippers');
  assert.equal(a.abbr, 'LAC');
  assert.deepEqual(squadraNba('Los Angeles Clippers'), a);
  assert.deepEqual(squadraNba('LAC'), a);
  assert.deepEqual(squadraNba('lac'), a);
});
test('Los Angeles Lakers ≠ Los Angeles Clippers', () =>
  assert.notEqual(squadraNba('Los Angeles Lakers').abbr, squadraNba('Los Angeles Clippers').abbr));
test('nome sconosciuto → null', () => {
  assert.equal(squadraNba('Seattle SuperSonics'), null);
  assert.equal(squadraNba('Los Angeles'), null);
  assert.equal(squadraNba('LA'), null);
  assert.equal(squadraNba(''), null);
  assert.equal(squadraNba(undefined), null);
});
test('nome completo e forme brevi', () => {
  assert.deepEqual(squadraNba('Boston Celtics'), { abbr: 'BOS', nome: 'Boston Celtics' });
  assert.equal(squadraNba('Celtics').abbr, 'BOS');
  assert.equal(squadraNba('GSW').nome, 'Golden State Warriors');
  assert.equal(squadraNba('Philadelphia 76ers').abbr, 'PHI');
});
test('CONFIG.nba congelato con i valori del piano', () => {
  assert.equal(CONFIG.nba.mezzaVitaGiorni, 30);
  assert.ok(Object.isFrozen(CONFIG.nba));
  assert.ok(Object.isFrozen(CONFIG.nba.serale));
  assert.equal(CONFIG.nba.regressioneStagione, 1 / 3);
  assert.deepEqual({ ...CONFIG.nba.serale }, { oraMinima: '14:00', ritardoAvvisoOre: 2 });
  assert.equal(CONFIG.nba.oraSerale, '22:00');
  assert.equal(CONFIG.nba.attesaBalldontlieMs, 13000);
});
test('Knicks: niente alias della sola città (New York, NY)', () => {
  assert.equal(squadraNba('New York'), null);
  assert.equal(squadraNba('NY'), null);
  assert.equal(squadraNba('Knicks').abbr, 'NYK');
  assert.equal(squadraNba('NY Knicks').abbr, 'NYK');
  assert.equal(squadraNba('NYK').abbr, 'NYK');
  assert.equal(squadraNba('New York Knicks').abbr, 'NYK');
});
