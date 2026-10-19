import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costruisciMultiple } from '../../src/regole/multiple.js';

let n = 0;
const singola = (o = {}) => {
  n += 1;
  const prob = o.prob ?? 0.60;
  const quota = o.quota === undefined ? 1.90 : o.quota;
  return {
    id: `s${n}`, sport: 'calcio', competizione: 'Serie A', partita: `A${n} - B${n}`, idPartita: `p${n}`,
    inizio: `2026-10-19T${String(10 + (n % 10)).padStart(2, '0')}:00:00+02:00`, tipo: 'singola', mercato: '1X2', selezione: '1',
    prob, quota, fonteQuota: 'x', oraQuota: null, quotaDaVerificare: quota === null, ragionamento: [],
    value: prob * (quota ?? 1.9) - 1, quotaMinima: 1.75, puntata: { euro: 3, percentuale: 1.5 },
    stato: 'in_attesa', motivoStato: null, oraUltimoControllo: null, esito: null, ...o,
  };
};

test('solo gambe con quota ≥ 1.40 e partite diverse, 2–4 gambe, totale 2.50–6.00, value ≥ 5%', () => {
  const a = singola({ prob: 0.62, quota: 1.90 });
  const b = singola({ prob: 0.62, quota: 1.90 });
  const stessa = singola({ prob: 0.9, quota: 1.90, idPartita: a.idPartita });
  const bassa = singola({ prob: 0.9, quota: 1.30 });
  const ms = costruisciMultiple([a, b, stessa, bassa], 1000);
  assert.ok(ms.length >= 1);
  for (const m of ms) {
    assert.equal(m.tipo, 'multipla');
    assert.ok(m.gambe.length >= 2 && m.gambe.length <= 4);
    assert.equal(new Set(m.gambe.map((g) => g.idPartita)).size, m.gambe.length);
    assert.ok(m.gambe.every((g) => g.quota >= 1.40));
    assert.ok(m.quota >= 2.5 && m.quota <= 6.0);
    assert.ok(m.value >= 0.05);
    assert.ok(!m.gambe.some((g) => g.id === bassa.id));
    assert.equal(m.stato, 'in_attesa');
  }
  const c = singola({ prob: 0.9, quota: 1.40 });
  const d = singola({ prob: 0.9, quota: 1.40 });
  assert.deepEqual(costruisciMultiple([c, d], 1000), []);
});
test('al massimo 2 multiple, scelte per value più alto', () => {
  const ss = [0.60, 0.62, 0.64, 0.66, 0.68, 0.70].map((p) => singola({ prob: p, quota: 1.90 }));
  const ms = costruisciMultiple(ss, 1000);
  assert.equal(ms.length, 2);
  assert.ok(ms[0].value >= ms[1].value);
  const usate = ms.flatMap((m) => m.gambe.map((g) => g.id));
  assert.equal(new Set(usate).size, usate.length);
  assert.ok(ms[0].gambe.some((g) => g.id === ss[5].id));
});
test('prob della multipla = prodotto delle prob delle gambe', () => {
  const a = singola({ prob: 0.62, quota: 1.90 });
  const b = singola({ prob: 0.65, quota: 1.90 });
  const [m] = costruisciMultiple([a, b], 1000);
  assert.ok(Math.abs(m.prob - 0.62 * 0.65) < 1e-12);
  assert.equal(m.quota, 3.61);
  assert.equal(m.id, `M-${a.id}+${b.id}`);
});
