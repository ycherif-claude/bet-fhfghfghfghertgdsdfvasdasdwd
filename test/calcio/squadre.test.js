import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeCanonico, ALIAS } from '../../src/calcio/squadre.js';
import { normalizzaNome } from '../../src/calcio/testo.js';

const CITY = ['Manchester City', 'Manchester United', 'Arsenal'];

test('Man City, Manchester City e Manchester City FC portano allo stesso nome', () => {
  const r = ['Man City', 'Manchester City', 'Manchester City FC'].map((n) => nomeCanonico(n, CITY));
  assert.deepEqual(r, ['Manchester City', 'Manchester City', 'Manchester City']);
});
test('Internazionale tramite ALIAS', () =>
  assert.equal(nomeCanonico('Internazionale', ['Inter Milan', 'Lecce']), 'Inter Milan'));
test('FC Internazionale Milano porta a Inter Milan', () =>
  assert.equal(nomeCanonico('FC Internazionale Milano', ['Inter Milan', 'AC Milan']), 'Inter Milan'));
test('nome ambiguo (due candidati) restituisce null', () =>
  assert.equal(nomeCanonico('United', ['Manchester United', 'Newcastle United']), null));
test('nome sconosciuto restituisce null', () => assert.equal(nomeCanonico('Pippo', ['Inter', 'Lecce']), null));
test('alias il cui bersaglio non e tra i candidati viene ignorato', () =>
  assert.equal(nomeCanonico('Internazionale', ['Lecce']), null));
test('l alias non passa dal contenimento: Internazionale non trova Inter', () =>
  assert.equal(nomeCanonico('Internazionale', ['Inter', 'Lecce']), null));
test('squadre di riserva e giovanili non si abbinano alla prima squadra', () => {
  assert.equal(nomeCanonico('Real Sociedad B', ['Real Sociedad', 'Real Madrid']), null);
  assert.equal(nomeCanonico('Real Madrid Castilla', ['Real Sociedad', 'Real Madrid']), null);
  assert.equal(nomeCanonico('Bayern Munich II', ['Bayern Munich', 'Augsburg']), null);
});
test('contenimento sotto meta dei token rifiutato', () =>
  assert.equal(nomeCanonico('Paris FC', ['Paris Saint Germain', 'Lyon']), null));
test('nome canonico di un altra squadra non si aggancia per contenimento', () =>
  assert.equal(nomeCanonico('Inter Milan', ['Milan', 'Juventus']), null));
test('Hertha Berlin sceglie Hertha, non Union Berlin', () =>
  assert.equal(nomeCanonico('Hertha Berlin', ['Union Berlin', 'Hertha']), 'Hertha'));
test('tutte le chiavi di ALIAS sono gia normalizzate', () => {
  for (const k of Object.keys(ALIAS)) assert.equal(normalizzaNome(k), k);
});

import { abbinaSquadra } from '../../src/calcio/squadre.js';
test('abbinaSquadra: trova il nome CSV tramite ALIAS', () =>
  assert.equal(abbinaSquadra('Inter Milan', ['Inter', 'Lecce', 'Milan']), 'Inter'));
test('abbinaSquadra: nome uguale dopo la normalizzazione', () =>
  assert.equal(abbinaSquadra('Lecce', ['Inter', 'Lecce']), 'Lecce'));
test('abbinaSquadra: ripiego su nomeCanonico', () =>
  assert.equal(abbinaSquadra('Manchester City', ['Man City', 'Arsenal']), 'Man City'));
test('abbinaSquadra: nessun abbinamento o ambiguo → null', () => {
  assert.equal(abbinaSquadra('Pippo', ['Inter', 'Lecce']), null);
  assert.equal(abbinaSquadra('Inter Milan', ['Inter', 'Internazionale']), null);
});
