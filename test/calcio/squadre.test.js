import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeCanonico, ALIAS } from '../../src/calcio/squadre.js';
import { normalizzaNome } from '../../src/calcio/testo.js';

const CITY = ['Manchester City', 'Manchester United', 'Arsenal'];

test('Man City, Manchester City e Manchester City FC portano allo stesso nome', () => {
  const r = ['Man City', 'Manchester City', 'Manchester City FC'].map((n) => nomeCanonico(n, CITY));
  assert.deepEqual(r, ['Manchester City', 'Manchester City', 'Manchester City']);
});
test('Inter e Internazionale tramite ALIAS', () =>
  assert.equal(nomeCanonico('Internazionale', ['Inter', 'Lecce']), 'Inter'));
test('FC Internazionale Milano porta a Inter Milan', () =>
  assert.equal(nomeCanonico('FC Internazionale Milano', ['Inter Milan', 'AC Milan']), 'Inter Milan'));
test('nome ambiguo (due candidati) restituisce null', () =>
  assert.equal(nomeCanonico('United', ['Manchester United', 'Newcastle United']), null));
test('nome sconosciuto restituisce null', () => assert.equal(nomeCanonico('Pippo', ['Inter', 'Lecce']), null));
test('alias il cui bersaglio non e tra i candidati viene ignorato', () =>
  assert.equal(nomeCanonico('Internazionale', ['Lecce']), null));
test('tutte le chiavi di ALIAS sono gia normalizzate', () => {
  for (const k of Object.keys(ALIAS)) assert.equal(normalizzaNome(k), k);
});
