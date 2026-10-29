import test from 'node:test';
import assert from 'node:assert/strict';
import { applicaChiusura, vociChiusura } from '../../src/controlli/chiusura.js';
import { quotaCalcio } from '../../src/controlli/quote.js';
import { chiusuraPartite } from '../../src/regole/mercati-partite.js';

const gamba = (id, inizio, extra = {}) => ({ idPartita: id, sport: 'calcio', competizione: 'Serie A', partita: `${id}c - ${id}t`, inizio, mercato: 'Doppia chance', selezione: '12', quota: 1.3, probMercato: 0.7, ...extra });

test('chiusura: una voce per partita nell\'ultima finestra, poi salvata su tutte le copie', () => {
  const adesso = new Date('2026-10-30T17:30:00+01:00');
  const a = gamba('a', '2026-10-30T18:00:00+01:00'); // 30 minuti: ultimo
  const b = gamba('b', '2026-10-30T19:30:00+01:00'); // 2 ore: presto
  const giornata = {
    multipleBonus: [{ id: 'MBP5', gambe: [a, b] }],
    coppieQuota2: { margine: [{ id: 'Q2M1', gambe: [{ ...a }] }], probabilita: [] },
  };
  const voci = vociChiusura(giornata, adesso);
  assert.deepEqual(voci.map((v) => v.id), ['chiusura|a|Doppia chance|12']);
  const n = applicaChiusura(giornata, new Map([[voci[0].id, { quota: 1.27, n: 40, prob: 0.73 }]]), adesso);
  assert.equal(n, 1);
  assert.deepEqual(giornata.multipleBonus[0].gambe[0].chiusura, { quota: 1.27, prob: 0.73, alle: '2026-10-30T17:30:00+01:00', minutiPrima: 30 });
  assert.equal(giornata.coppieQuota2.margine[0].gambe[0].chiusura.prob, 0.73);
  assert.equal(giornata.multipleBonus[0].gambe[1].chiusura, undefined);
  // Già chiusa: non si chiede più.
  assert.deepEqual(vociChiusura(giornata, adesso), []);
});

test('doppia chance nei controlli: quota dal mercato dc, probabilità dall\'1X2 di Pinnacle senza margine', () => {
  const libro = (chiave, dc, h2h) => ({ chiave, mercati: { dc, h2h } });
  const evento = { bookmaker: [
    libro('pinnacle', { 12: 1.25 }, { casa: 2.0, pareggio: 3.6, trasferta: 4.0 }),
    libro('snai', { 12: 1.27 }, null), libro('goldbet', { 12: 1.26 }, null), libro('sisal', { 12: 1.28 }, null),
  ] };
  const q = quotaCalcio(evento, 'Doppia chance', '12');
  assert.equal(q.quota, 1.26);
  const somma = 1 / 2 + 1 / 3.6 + 1 / 4;
  assert.ok(Math.abs(q.prob - (1 / 2 + 1 / 4) / somma) < 1e-9);
  assert.equal(quotaCalcio(evento, 'Doppia chance', 'boh'), null);
});

test('storico della chiusura: a favore, movimento medio e valore del prezzo del mattino', () => {
  const giornate = [{ multipleBonus: [{ gambe: [
    gamba('a', 'x', { chiusura: { prob: 0.75 } }),
    gamba('b', 'x', { chiusura: { prob: 0.68 } }),
    gamba('c', 'x'),
  ] }] }];
  const [tutte, calcio] = chiusuraPartite(giornate);
  assert.equal(tutte.gruppo, 'tutte');
  assert.equal(tutte.partite, 2);
  assert.equal(tutte.aFavore, 1);
  assert.equal(tutte.movimento, Math.round(((0.05 - 0.02) / 2) * 10000) / 10000);
  assert.equal(tutte.valore, Math.round(((1.3 * 0.75 - 1 + 1.3 * 0.68 - 1) / 2) * 10000) / 10000);
  assert.equal(calcio.gruppo, 'Calcio');
});
