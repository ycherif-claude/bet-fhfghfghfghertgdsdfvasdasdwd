import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrazione, confronto, perdita, pesoMigliore, simulaGiocate } from '../../src/taratura/metriche.js';
import { quoteFootballData } from '../../src/calcio/fonti/football-data-uk.js';
import { stimaForze } from '../../src/calcio/modelli/gol.js';
import { calcolaElo } from '../../src/tennis/elo.js';
import { CONFIG } from '../../src/config.js';

test('log-loss e confronto appaiato', () => {
  assert.ok(Math.abs(perdita(0.5) - Math.log(2)) < 1e-12);
  const c = confronto([1, 2, 3], [1, 1, 1]);
  assert.equal(c.differenza, 1);
  assert.ok(c.errore > 0);
});

test('peso migliore: zero se il modello sbaglia, uno se è perfetto', () => {
  assert.equal(pesoMigliore([{ pm: 0.1, pp: 0.6 }, { pm: 0.2, pp: 0.7 }]).migliore.peso, 0);
  assert.equal(pesoMigliore([{ pm: 0.95, pp: 0.6 }, { pm: 0.9, pp: 0.7 }]).migliore.peso, 1);
});

test('calibrazione per fasce e giocate simulate con rendimento e CLV', () => {
  const cal = calibrazione([{ p: 0.15, y: 0 }, { p: 0.18, y: 1 }, { p: 0.72, y: 1 }]);
  assert.deepEqual(cal.map((x) => [x.fascia, x.n, x.vera]), [['10-20%', 2, 0.5], ['70-80%', 1, 1]]);
  const g = simulaGiocate([
    { p: 0.6, quota: 2, y: 1, pChiusura: 0.55 },
    { p: 0.6, quota: 2, y: 0, pChiusura: 0.45 },
    { p: 0.4, quota: 2, y: 1, pChiusura: 0.5 }, // value negativo: non si gioca
  ]);
  assert.equal(g.giocate, 2);
  assert.equal(g.rendimento, 0);
  assert.ok(Math.abs(g.clv - 0) < 1e-12);
});

test('quote del CSV di football-data: terne complete o null', () => {
  const q = quoteFootballData({ PSH: '2.1', PSD: '3.4', PSA: '3.6', PSCH: '2', PSCD: '', PSCA: '3.9', 'P>2.5': '1.9', 'P<2.5': '1.95' });
  assert.deepEqual(q.pinnacle1x2, [2.1, 3.4, 3.6]);
  assert.equal(q.pinnacleChiusura1x2, null);
  assert.deepEqual(q.pinnacleOU, [1.9, 1.95]);
  assert.equal(q.media1x2, null);
});

test('forze: la mezza vita di CONFIG è quella di sempre, un valore diverso cambia le stime', () => {
  const p = [
    { data: '2025-01-01', casa: 'A', trasferta: 'B', gc: 3, gt: 0 },
    { data: '2026-01-01', casa: 'B', trasferta: 'A', gc: 2, gt: 0 },
    { data: '2026-02-01', casa: 'A', trasferta: 'B', gc: 1, gt: 1 },
  ];
  const base = stimaForze(p, { oggi: '2026-03-01' });
  const uguale = stimaForze(p, { oggi: '2026-03-01', mezzaVita: CONFIG.calcio.mezzaVitaGiorni });
  const diversa = stimaForze(p, { oggi: '2026-03-01', mezzaVita: 30 });
  assert.equal(base.attacco.get('A'), uguale.attacco.get('A'));
  assert.notEqual(base.attacco.get('A'), diversa.attacco.get('A'));
});

test('Elo: primaDi vede i punteggi prima dell\'aggiornamento, partita per partita', () => {
  const visti = [];
  const partite = [
    { data: '2025-01-01', vincitore: 'X', perdente: 'Y', superficie: 'cemento', setW: [6, 6], setL: [3, 4] },
    { data: '2025-01-02', vincitore: 'X', perdente: 'Y', superficie: 'cemento', setW: [6, 6], setL: [3, 4] },
  ];
  const elo = calcolaElo(partite, CONFIG.tennis, { primaDi: (p, w, l) => visti.push([w.tot, l.tot]) });
  assert.deepEqual(visti[0], [1500, 1500]);
  assert.ok(visti[1][0] > 1500 && visti[1][1] < 1500);
  assert.ok(elo.get('X').tot > visti[1][0]);
});
