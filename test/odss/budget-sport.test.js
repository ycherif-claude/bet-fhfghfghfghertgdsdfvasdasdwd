// Budget di odss-api per sport [correzioni 24/10/2026, punto 2]: il 23 e il 24/10 calcio (6), NBA (2) e tennis (2)
// hanno consumato le 10 richieste del mattino e basket e pallavolo non sono mai stati serviti ("tetto di 10 richieste
// al giorno del giro del mattino raggiunto"). Ora ogni sport e i controlli hanno il loro tetto (CONFIG.odss.tetti),
// dentro un tetto giornaliero totale che è la loro somma: qualunque sia l'ordine delle raccolte, ogni sport ha la
// sua quota; uno sport senza partite non consuma niente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/config.js';
import { creaBudgetOdss } from '../../src/odss/budget.js';

const DATA = '2026-10-24';
const MATTINO = new Date('2026-10-24T05:36:00Z');
const SERA = new Date('2026-10-24T17:00:00Z');
const O = CONFIG.odss;
const MATTINO_SPORT = ['calcio', 'nba', 'tennis', 'basket', 'pallavolo'];

test('budget per sport: tetti di calcio 4, NBA 2, tennis 1, basket 1, pallavolo 1, controlli 7; totale 16 al giorno', () => {
  assert.deepEqual({ ...O.tetti }, { calcio: 4, nba: 2, tennis: 1, basket: 1, pallavolo: 1, controlli: 7 });
  const somma = Object.values(O.tetti).reduce((a, b) => a + b, 0);
  // Il tetto totale non toglie niente a nessuno: è la somma dei tetti.
  assert.equal(O.richiesteGiorno, somma);
  // Usando ogni giorno tutti i tetti: 16 × 30 = 480 su 500 [30/10/2026]; il consumo reale è ~11-14 al giorno e la
  // riserva (mai sotto 60 rimaste) protegge la fine del mese.
  assert.ok(O.richiesteGiorno * 30 <= 500);
  assert.equal(O.richiesteControlli, undefined);
});

test('budget per sport: in qualunque ordine ogni sport ottiene la sua quota (anche basket e pallavolo dopo gli altri)', () => {
  for (const ordine of [MATTINO_SPORT, [...MATTINO_SPORT].reverse(), ['nba', 'calcio', 'pallavolo', 'tennis', 'basket']]) {
    let stato = null;
    for (const sport of ordine) {
      const b = creaBudgetOdss({ stato, data: DATA, adesso: MATTINO, sport });
      for (let i = 0; i < O.tetti[sport]; i++) {
        assert.equal(b.puo(0), true, `${sport} richiesta ${i + 1} (ordine ${ordine.join(',')})`);
        b.conta();
      }
      assert.equal(b.puo(0), false);
      assert.match(b.motivo(), new RegExp(`tetto di ${O.tetti[sport]} richieste al giorno per ${sport} raggiunto`));
      stato = b.stato();
    }
    // I controlli della sera hanno ancora le loro.
    const c = creaBudgetOdss({ stato, data: DATA, adesso: SERA, tipo: 'controlli' });
    for (let i = 0; i < O.tetti.controlli; i++) { assert.equal(c.puo(0), true); c.conta(); }
    assert.equal(c.puo(0), false);
    assert.match(c.motivo(), new RegExp(`tetto di ${O.tetti.controlli} richieste al giorno per i controlli raggiunto`));
    const g = c.stato().giornate[DATA];
    assert.equal(g.usate + g.controlli, O.richiesteGiorno);
  }
});

test('budget per sport: il tetto giornaliero totale vale anche con contatori di prima (stato del 24/10 reale)', () => {
  // Stato reale del 24/10: calcio 6, nba 2, tennis 2 (usate 10) e 3 controlli. Con i tetti nuovi il basket ha
  // ancora la sua richiesta? No: 13 su 13 già usate in tutto → il totale ferma anche lui, con un motivo chiaro.
  const stato = { rimaste: 457, giornate: { [DATA]: { usate: 10, controlli: 6, perSport: { calcio: 6, nba: 2, tennis: 2 } } } };
  const b = creaBudgetOdss({ stato, data: DATA, adesso: MATTINO, sport: 'basket' });
  assert.equal(b.puo(0), false);
  assert.match(b.motivo(), /tetto giornaliero di 16 richieste a odss-api raggiunto/);
  // Con 9 usate al mattino (i tetti nuovi) e 3 controlli il basket ne ha ancora una.
  const s2 = { rimaste: 457, giornate: { [DATA]: { usate: 8, controlli: 3, perSport: { calcio: 4, nba: 2, tennis: 1, pallavolo: 1 } } } };
  const b2 = creaBudgetOdss({ stato: s2, data: DATA, adesso: MATTINO, sport: 'basket' });
  assert.equal(b2.puo(0), true);
  assert.match(b2.descrizione(), /basket oggi 0 su 1/);
});
