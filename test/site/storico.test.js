import test from 'node:test';
import assert from 'node:assert/strict';
import { righeVista, etichettaGruppo } from '../../site/storico.js';

const g = (id, esito, extra = {}) => ({ id, esito, stato: 'confermata', quota: 2, quotaMinima: 1.8, puntata: { euro: 10 }, ...extra });
const righe = [
  { giocata: g('a', 'vinta'), segnatura: { fatta: true, quotaReale: 2.1, puntataReale: 5 } },
  { giocata: g('b', 'persa'), segnatura: null },
  { giocata: g('c', 'rimborsata'), segnatura: { fatta: false } },
  { giocata: g('d', null), segnatura: null },
  { giocata: g('e', 'vinta', { stato: 'annullata' }), segnatura: null },
];

test('vista fatte: solo giocate segnate fatte, con quota e puntata reali', () => {
  const r = righeVista(righe, 'fatte');
  assert.deepEqual(r.map((x) => [x.giocata.id, x.profitto]), [['a', 5.5]]);
});

test('vista proposte: tutte le chiuse non annullate, con puntata consigliata', () => {
  const r = righeVista(righe, 'proposte');
  assert.deepEqual(r.map((x) => [x.giocata.id, x.profitto]), [['a', 10], ['b', -10], ['c', 0]]);
});

test('etichette dei gruppi', () => {
  assert.equal(etichettaGruppo('quotaDaVerificare', true), 'Quota da verificare');
  assert.equal(etichettaGruppo('quotaDaVerificare', false), 'Quota verificata');
  assert.equal(etichettaGruppo('tipo', 'builder'), 'Bet builder');
  assert.equal(etichettaGruppo('sport', 'calcio'), 'calcio');
});
