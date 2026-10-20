import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaGiocatore, abbinaGiocatore, ALIAS } from '../../src/tennis/giocatori.js';

test('normalizzazione dei formati', () => {
  assert.deepEqual(normalizzaGiocatore('Sinner J.'), { cognome: 'sinner', iniziale: 'j' });
  assert.deepEqual(normalizzaGiocatore('Jannik Sinner'), { cognome: 'sinner', iniziale: 'j' });
  assert.deepEqual(normalizzaGiocatore('Auger-Aliassime F.'), { cognome: 'auger aliassime', iniziale: 'f' });
  assert.deepEqual(normalizzaGiocatore('Felix Auger-Aliassime'), { cognome: 'auger aliassime', iniziale: 'f' });
  assert.deepEqual(normalizzaGiocatore('Alex de Minaur'), { cognome: 'de minaur', iniziale: 'a' });
  assert.deepEqual(normalizzaGiocatore('De Minaur A.'), { cognome: 'de minaur', iniziale: 'a' });
  assert.deepEqual(normalizzaGiocatore('Čilić M.'), { cognome: 'cilic', iniziale: 'm' });
  assert.deepEqual(normalizzaGiocatore("O'Connell C."), { cognome: 'o connell', iniziale: 'c' });
  assert.deepEqual(normalizzaGiocatore('Auger-Aliassime F.J.'), { cognome: 'auger aliassime', iniziale: 'f' });
});

test('Jannik Sinner ↔ Sinner J.', () => assert.equal(abbinaGiocatore('Jannik Sinner', ['Sinner J.', 'Rune H.']), 'Sinner J.'));

test('cognomi composti', () => {
  assert.equal(abbinaGiocatore('Felix Auger-Aliassime', ['Auger-Aliassime F.', 'Sinner J.']), 'Auger-Aliassime F.');
  assert.equal(abbinaGiocatore('Alex de Minaur', ['De Minaur A.']), 'De Minaur A.');
  assert.equal(abbinaGiocatore('Roberto Bautista Agut', ['Bautista Agut R.']), 'Bautista Agut R.');
});

test('omonimia: Zverev A./M. → Zverev A.; due Zverev A. → null', () => {
  assert.equal(abbinaGiocatore('Alexander Zverev', ['Zverev A.', 'Zverev M.']), 'Zverev A.');
  assert.equal(abbinaGiocatore('Alexander Zverev', ['Zverev A.', 'Zverev A.']), null);
});

test('nessun candidato → null', () => {
  assert.equal(abbinaGiocatore('Carlos Alcaraz', ['Sinner J.']), null);
  assert.equal(abbinaGiocatore('Carlos Alcaraz', []), null);
});

test('ALIAS ha la precedenza', () => {
  ALIAS['Pippo Rossi'] = 'Rossi X.';
  try {
    assert.equal(abbinaGiocatore('Pippo Rossi', ['Rossi X.', 'Rossi P.']), 'Rossi X.');
  } finally {
    delete ALIAS['Pippo Rossi'];
  }
});
