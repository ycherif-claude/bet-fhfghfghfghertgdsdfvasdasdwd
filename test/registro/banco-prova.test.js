import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoProva, statoStrategia, valoreChiusura } from '../../src/registro/banco-prova.js';

const riga = (id, extra = {}) => ({
  sport: 'calcio', idPartita: id, partita: id, mercato: '1X2', selezione: '1', riferimento: 'Pinnacle',
  quota: 1.4, probMercato: 0.7, probModello: 0.71, probPrePartita: 0.72, esito: 'vinta', ...extra,
});

test('banco di prova: valore alla chiusura dalla quota del mattino e dalla probabilità di prima della partita', () => {
  const v = valoreChiusura([riga('a'), riga('b', { probPrePartita: 0.68 }), riga('c', { probPrePartita: null })]);
  assert.equal(v.giocate, 2);
  assert.equal(v.valore, -0.02); // (1,4 x 0,72 - 1 + 1,4 x 0,68 - 1) / 2
  assert.deepEqual(valoreChiusura([]), { giocate: 0, valore: null });
});

test('banco di prova: pronta solo con abbastanza giocate e valore positivo', () => {
  const B = { minimo: 2, sogliaPronta: 0.01 };
  assert.equal(statoStrategia({ giocate: 1, valore: 0.2 }, B), 'in prova');
  assert.equal(statoStrategia({ giocate: 2, valore: 0.02 }, B), 'pronta');
  assert.equal(statoStrategia({ giocate: 2, valore: 0.005 }, B), 'in prova');
  assert.equal(statoStrategia({ giocate: 2, valore: -0.01 }, B), 'in perdita');
});

test('banco di prova: una giocata per partita, solo dal giorno di inizio', () => {
  const righe = [
    riga('a', { quota: 1.3, probMercato: 0.75 }),
    riga('a', { mercato: 'Doppia chance', selezione: '12', quota: 1.22, probMercato: 0.8 }),
    riga('b', { quota: 2.1, probMercato: 0.46, esito: 'persa' }),
  ];
  const b = bancoProva([{ data: '2026-10-20', righe }, { data: '2026-11-07', righe }], { da: '2026-10-23', minimo: 1, sogliaPronta: 0.01 });
  const s = Object.fromEntries(b.strategie.map((x) => [x.id, x]));
  assert.equal(b.giorni, 1);
  // Favoriti 1,20-1,50: per la partita a il più probabile (12 a 1,22), b è fuori quota.
  assert.equal(s.favoriti.chiuse, 1);
  assert.equal(s.favoritiBassi.chiuse, 1);
  assert.equal(s.tutto.chiuse, 3);
  assert.ok(['pronta', 'in prova', 'in perdita'].includes(s.favoriti.stato));
  assert.ok(!b.pronte.includes('tutto'));
});

