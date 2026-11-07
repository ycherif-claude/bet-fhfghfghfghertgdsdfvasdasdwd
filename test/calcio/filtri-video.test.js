import test from 'node:test';
import assert from 'node:assert/strict';
import { filtriVideo } from '../../src/calcio/filtri-video.js';
import { righeDaRaccolta } from '../../src/registro/registro.js';
import { bancoProva } from '../../src/registro/banco-prova.js';

// A e B segnano sempre, si sono incontrate 3 volte con almeno 2 gol; C non segna mai.
const p = (data, casa, trasferta, gc, gt) => ({ data, casa, trasferta, gc, gt });
const righe = [
  p('2025-01-10', 'A', 'B', 2, 1), p('2025-03-10', 'B', 'A', 1, 1), p('2025-05-10', 'A', 'B', 3, 0),
  ...['08-10', '08-17', '08-24', '08-31', '09-07', '09-14'].flatMap((g, i) => [p(`2025-${g}`, 'A', `X${i}`, 2, 0), p(`2025-${g}`, `Y${i}`, 'B', 0, 1), p(`2025-${g}`, 'C', `Z${i}`, 0, 1)]),
];

test('video: passa con media gol, scontri diretti e forma', () => {
  const f = filtriVideo(righe, 'A', 'B', '2025-10-01');
  assert.deepEqual(f, { passa: true, mediaGol: true, scontriDiretti: true, forma: true, scontri: 3 });
  // Solo le partite giocate prima di oggi: a fine agosto le partite della stagione sono poche.
  assert.equal(filtriVideo(righe, 'A', 'B', '2025-08-20').mediaGol, false);
  const c = filtriVideo(righe, 'A', 'C', '2025-10-01');
  assert.equal(c.passa, false);
  assert.equal(c.forma, false);
  assert.equal(c.scontriDiretti, false);
});

test('video: il flag arriva sulla riga Over 1.5 del registro e nel banco di prova', () => {
  const partita = { idPartita: 'a-b', partita: 'A - B', competizione: 'X', inizio: '2026-11-08T15:00:00+01:00', filtriVideo: { passa: true },
    mercati: [{ mercato: 'Under/Over 1.5', selezione: 'Over 1.5', probPinnacle: 0.8, quota: 1.22 }, { mercato: '1X2', selezione: '1', probPinnacle: 0.5, quota: 1.9 }] };
  const r = righeDaRaccolta({ partite: [partita] });
  assert.equal(r[0].video, true);
  assert.equal('video' in r[1], false);
  const b = bancoProva([{ data: '2026-11-08', righe: r.map((x) => ({ ...x, esito: 'vinta' })) }]);
  assert.equal(b.strategie.find((s) => s.id === 'video').chiuse, 1);
});
