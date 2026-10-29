import test from 'node:test';
import assert from 'node:assert/strict';
import { calcolaTaratura, datiTaratura, stimaCorrezione, tara } from '../../src/regole/taratura-modello.js';
import { costruisciCoppieQuota2, pm } from '../../src/regole/coppie-quota2.js';
import { gambePossibili } from '../../src/regole/multipla-bonus.js';

const gamba = (id, probModello, esito, sport = 'calcio') => ({ idPartita: id, sport, mercato: '1X2', selezione: '1', quota: 1.4, probMercato: 0.7, probModello, esito });

test('dati della taratura: solo partite chiuse con il modello, una volta, divise per sport', () => {
  const g = gamba('a', 0.6, 'vinta');
  const d = datiTaratura([{ multipleBonus: [{ gambe: [g, gamba('b', null, 'vinta'), gamba('c', 0.7, null), gamba('d', 0.5, 'persa', 'nba')] }, { gambe: [g] }] }]);
  assert.deepEqual(d, { calcio: [[0.6, 1]], nba: [[0.5, 0]] });
});

test('correzione: senza scostamento resta quasi identica, con un modello pessimista alza le probabilità', () => {
  // Modello giusto: 70% che escono 7 volte su 10.
  const giusto = Array.from({ length: 200 }, (_, i) => [0.7, i % 10 < 7 ? 1 : 0]);
  const c1 = stimaCorrezione(giusto);
  assert.ok(Math.abs(c1.a) < 0.05 && Math.abs(c1.b - 1) < 0.1, JSON.stringify(c1));
  // Modello pessimista: dice 60% ma escono 8 su 10.
  const pessimista = Array.from({ length: 300 }, (_, i) => [i % 2 ? 0.55 : 0.65, i % 10 < 8 ? 1 : 0]);
  const t = { calcio: stimaCorrezione(pessimista) };
  assert.ok(tara(t, 'calcio', 0.6) > 0.72, String(tara(t, 'calcio', 0.6)));
  // Con poche partite la correzione è trattenuta: cambia meno.
  const poche = { calcio: stimaCorrezione(pessimista.slice(0, 20)) };
  assert.ok(tara(poche, 'calcio', 0.6) < tara(t, 'calcio', 0.6));
  assert.equal(tara(t, 'nba', 0.6), null);
  assert.equal(tara(t, 'calcio', null), null);
});

test('taratura per sport solo da 50 partite chiuse', () => {
  const tante = Array.from({ length: 60 }, (_, i) => gamba(`c${i}`, 0.6, i % 10 < 8 ? 'vinta' : 'persa'));
  const poche = Array.from({ length: 10 }, (_, i) => gamba(`n${i}`, 0.6, 'vinta', 'nba'));
  const t = calcolaTaratura([{ multipleBonus: [{ gambe: [...tante, ...poche] }] }]);
  assert.deepEqual(Object.keys(t), ['calcio']);
  assert.equal(t.calcio.partite, 60);
});

test('coppie modello e confermate usano la probabilità corretta se c\'è', () => {
  const g = (id, probModello, probModelloTarato) => ({ idPartita: id, sport: 'calcio', partita: `${id}c - ${id}t`, inizio: '2026-10-30T15:00:00+01:00', mercato: '1X2', selezione: '1', quota: 1.4, probMercato: 0.7, probModello, probModelloTarato });
  assert.equal(pm(g('a', 0.6, 0.69)), 0.69);
  assert.equal(pm(g('a', 0.6, null)), 0.6);
  // Grezzo 0,60 (lontano dal mercato), corretto 0,69 (d'accordo): entra fra le confermate.
  const c = costruisciCoppieQuota2([g('a', 0.6, 0.69), { ...g('b', 0.6, 0.71), quota: 1.42 }], { data: 'x' });
  assert.equal(c.confermate.length, 1);
  assert.equal(Math.round(c.modello[0].probModello * 10000), Math.round(0.69 * 0.71 * 10000));
});

test('pallavolo: l\'Elo di studio entra nelle partite di coppie e multiple come probabilità del modello', () => {
  const partita = { idPartita: 'v1', sport: 'pallavolo', competizione: 'PlusLiga', partita: 'A - B', inizio: '2026-10-30T18:00:00+01:00' };
  const voci = [{ partita, m: { mercato: 'Vincente', selezione: 'A', quota: 1.4, probPinnacle: 0.7, probModello: null, probModelloStudio: 0.66 } }];
  assert.equal(gambePossibili(voci)[0].probModello, 0.66);
  voci[0].m.probModello = 0.68;
  assert.equal(gambePossibili(voci)[0].probModello, 0.68);
});
