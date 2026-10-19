import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riepiloga } from '../../src/storico/riepiloghi.js';

const riga = (id, extra = {}, sig = null) => ({
  giocata: { id, sport: 'calcio', tipo: 'singola', mercato: '1X2', quota: 2, quotaMinima: 1.9,
    quotaDaVerificare: false, stato: 'confermata', esito: 'vinta', puntata: { euro: 10, percentuale: 2 }, ...extra },
  segnatura: sig,
});
const fatta = (id, extra = {}) => ({ idGiocata: id, fatta: true, quotaReale: 2, puntataReale: 10, ora: '2026-10-19T09:00:00+02:00', ...extra });

test('roi = profitto / somma puntate', () => {
  const righe = [
    riga('a', { esito: 'vinta' }, fatta('a', { quotaReale: 2, puntataReale: 10 })),
    riga('b', { esito: 'persa' }, fatta('b', { puntataReale: 10 })),
    riga('c', { esito: 'persa' }, fatta('c', { puntataReale: 5 })),
  ];
  const [r] = riepiloga(righe, 'sport', 'fatte');
  assert.deepEqual(r, { gruppo: 'calcio', n: 3, vinte: 1, profitto: -5, roi: -0.2 });
});

test('vista proposte include anche le giocate non giocate; vista fatte solo quelle segnate fatte', () => {
  const righe = [
    riga('a', { esito: 'vinta' }, fatta('a')),
    riga('b', { esito: 'persa' }, null),
    riga('c', { esito: 'vinta' }, fatta('c', { fatta: false })),
    riga('d', { esito: 'vinta', quota: null, quotaMinima: 2.5 }, null),
  ];
  const [p] = riepiloga(righe, 'sport', 'proposte');
  assert.equal(p.n, 4);
  assert.equal(p.profitto, 10 + 15 - 10 + 10); // a:+10 b:-10 c:+10 d:+15
  const [f] = riepiloga(righe, 'sport', 'fatte');
  assert.equal(f.n, 1);
  assert.equal(f.profitto, 10);
});

test('annullate e senza esito escluse dai riepiloghi', () => {
  const righe = [
    riga('a', { stato: 'annullata' }, null),
    riga('b', { esito: null }, fatta('b')),
    riga('c', {}, null),
    riga('d', { stato: 'annullata' }, fatta('d')),
  ];
  assert.equal(riepiloga(righe, 'sport', 'proposte')[0].n, 1);
  // annullata ma segnata fatta: i soldi sono reali, quindi conta
  assert.equal(riepiloga(righe, 'sport', 'fatte')[0].n, 1);
  assert.deepEqual(riepiloga([], 'sport', 'fatte'), []);
});
