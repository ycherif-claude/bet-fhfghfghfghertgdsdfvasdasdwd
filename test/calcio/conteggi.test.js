import test from 'node:test';
import assert from 'node:assert/strict';
import { mercatiConteggi, cdf } from '../../src/calcio/modelli/conteggi.js';

const OGGI = '2026-10-19';
const squadre = ['A', 'B', 'C', 'D', 'E', 'F'];

// Generatore deterministico (LCG) per fixture ripetibili.
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function partite({ n = 60, angoliA = 0, arbitroCart = 0, data = OGGI } = {}) {
  const r = rng(7);
  const out = [];
  for (let i = 0; i < n; i++) {
    const casa = squadre[i % 6];
    const trasferta = squadre[(i + 1 + (i % 5)) % 6] === casa ? squadre[(i + 2) % 6] : squadre[(i + 1 + (i % 5)) % 6];
    const base = 4 + Math.floor(r() * 4);
    const extraC = casa === 'A' ? angoliA : 0;
    const extraT = trasferta === 'A' ? angoliA : 0;
    const arbitro = i % 3 === 0 ? 'Rossi' : 'Bianchi';
    const c = 1 + Math.floor(r() * 3) + (arbitro === 'Rossi' ? arbitroCart : 0);
    out.push({
      data, casa, trasferta, gc: 1, gt: 1, gcPT: 0, gtPT: 1, xgC: null, xgT: null,
      angoliC: base + extraC, angoliT: 3 + Math.floor(r() * 4) + extraT,
      cartC: c, cartT: 1 + Math.floor(r() * 3), arbitro,
    });
  }
  return out;
}

const opz = { oggi: OGGI, arbitro: null };
const trova = (m, mercato, sel) => m.find((x) => x.mercato === mercato && x.selezione === sel);

test('Over 9.5 + Under 9.5 = 1 per gli angoli', () => {
  const m = mercatiConteggi(partite(), 'A', 'B', opz);
  const o = trova(m, 'Angoli Under/Over 9.5', 'Over 9.5');
  const u = trova(m, 'Angoli Under/Over 9.5', 'Under 9.5');
  assert.ok(o && u);
  assert.ok(Math.abs(o.prob + u.prob - 1) < 1e-9);
  assert.equal(m.filter((x) => x.mercato.startsWith('Angoli')).length, 8);
  assert.equal(m.filter((x) => x.mercato.startsWith('Cartellini')).length, 6);
  assert.ok(trova(m, 'Cartellini Under/Over 4.5', 'Over 4.5'));
});

test('due squadre con molti angoli: P(Over 10.5) > frequenza del campionato', () => {
  const p = partite({ angoliA: 4 });
  const m = mercatiConteggi(p, 'A', 'C', opz);
  const o = trova(m, 'Angoli Under/Over 10.5', 'Over 10.5');
  assert.ok(o.prob > o.frequenzaCampionato, `${o.prob} vs ${o.frequenzaCampionato}`);
});

test('arbitro con 4 partite ignorato, con 5 partite sposta la media dei cartellini', () => {
  const base = partite({ arbitroCart: 0 });
  const forte = partite({ arbitroCart: 4 });
  const sel = (p, arb) => trova(mercatiConteggi(p, 'B', 'C', { oggi: OGGI, arbitro: arb }), 'Cartellini Under/Over 4.5', 'Over 4.5').prob;
  // arbitro sconosciuto: nessun effetto
  assert.equal(sel(forte, 'Verdi'), sel(forte, null));
  // 4 partite: ignorato
  const poche = forte.map((x) => ({ ...x }));
  let k = 0;
  for (const x of poche) { if (x.arbitro === 'Rossi') { if (k++ >= 4) x.arbitro = 'Altro'; } }
  assert.equal(sel(poche, 'Rossi'), sel(poche, null));
  // molte partite: sposta
  assert.ok(sel(forte, 'Rossi') > sel(forte, null));
  // l'arbitro severo alza l'Over anche rispetto a un campionato senza effetto arbitro
  assert.ok(sel(forte, 'Rossi') > sel(base, 'Rossi'));
});

test('squadra con 2 partite: nessun mercato', () => {
  const poche = partite({ n: 60 }).filter((x) => x.casa !== 'F' && x.trasferta !== 'F');
  poche.push(
    { ...poche[0], casa: 'F', trasferta: 'A' },
    { ...poche[1], casa: 'B', trasferta: 'F' },
  );
  assert.deepEqual(mercatiConteggi(poche, 'F', 'B', opz), []);
});

test('oggi mancante: errore', () => {
  assert.throws(() => mercatiConteggi(partite(), 'A', 'B', {}), /oggi mancante/);
});

test('frequenzaCampionato coincide con la quota di partite sopra la linea (pesi uguali)', () => {
  const p = partite();
  const m = mercatiConteggi(p, 'A', 'B', opz);
  const o = trova(m, 'Angoli Under/Over 9.5', 'Over 9.5');
  const attesa = p.filter((x) => x.angoliC + x.angoliT > 9.5).length / p.length;
  assert.ok(Math.abs(o.frequenzaCampionato - attesa) < 1e-9);
  for (const x of m) {
    assert.ok(Number.isFinite(x.prob) && x.prob >= 1e-6 && x.prob <= 1 - 1e-6);
    assert.ok(Number.isFinite(x.frequenzaCampionato) && x.frequenzaCampionato >= 1e-6 && x.frequenzaCampionato <= 1 - 1e-6);
  }
});

test('righe senza conteggi vengono saltate', () => {
  const p = partite();
  p.push({ ...p[0], angoliC: null, angoliT: NaN });
  const m = mercatiConteggi(p, 'A', 'B', opz);
  assert.ok(trova(m, 'Angoli Under/Over 9.5', 'Over 9.5'));
});

function campionatoSovradisperso() {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const tot = (i >> 1) % 2 === 0 ? 2 : 18;
    out.push({
      data: OGGI, casa: i % 2 ? 'B' : 'A', trasferta: i % 2 ? 'A' : 'B', gc: 1, gt: 1, gcPT: 0, gtPT: 1,
      xgC: null, xgT: null, angoliC: tot / 2, angoliT: tot / 2, cartC: 2, cartT: 2, arbitro: null,
    });
  }
  return out;
}

test('campionato sovradisperso (r > 1.2): Over + Under = 1 e code più grasse del Poisson', () => {
  const m = mercatiConteggi(campionatoSovradisperso(), 'A', 'B', opz);
  const o = trova(m, 'Angoli Under/Over 11.5', 'Over 11.5');
  const u = trova(m, 'Angoli Under/Over 11.5', 'Under 11.5');
  assert.ok(Math.abs(o.prob + u.prob - 1) < 1e-9);
  const sotto = trova(m, 'Angoli Under/Over 8.5', 'Under 8.5');
  // media 10: Poisson(10) ha P(<=8) = 0.333 e P(>=12) = 0.303
  assert.ok(sotto.prob > cdf(8, 10, 1) + 0.02, String(sotto.prob));
  assert.ok(o.prob > 1 - cdf(11, 10, 1) + 0.02, String(o.prob));
});

test('cdf: la binomiale negativa ha la media richiesta e passa dal Poisson oltre 1.2', () => {
  let media = 0;
  for (let k = 0; k < 40; k++) media += 1 - cdf(k, 10, 6.4);
  assert.ok(Math.abs(media - 10) < 0.15, 'media ' + media);
  assert.equal(cdf(9, 10, 1.2), cdf(9, 10, 1));
  assert.notEqual(cdf(9, 10, 1.25), cdf(9, 10, 1));
});

test('senza cartellini restano i mercati degli angoli', () => {
  const p = partite().map((x) => ({ ...x, cartC: null, cartT: null }));
  const m = mercatiConteggi(p, 'A', 'B', opz);
  assert.equal(m.length, 8);
  assert.ok(m.every((x) => x.mercato.startsWith('Angoli')));
});

test('probabilità non calcolabile (NaN): il mercato si salta, non diventa 50%', () => {
  // Attesa infinita (valori enormi) → Poisson NaN: niente angoli, i cartellini restano.
  const sq = ['A', 'B', 'C', 'D'];
  const p = Array.from({ length: 24 }, (_, i) => ({
    data: '2026-10-01', casa: sq[i % 4], trasferta: sq[(i + 1) % 4], angoliC: 1e200, angoliT: 1e200, cartC: 2 + (i % 2), cartT: 2, arbitro: null,
  }));
  const m = mercatiConteggi(p, 'A', 'B', opz);
  assert.equal(m.filter((x) => x.mercato.startsWith('Angoli')).length, 0);
  assert.ok(m.some((x) => x.mercato.startsWith('Cartellini')));
  assert.ok(m.every((x) => Number.isFinite(x.prob) && x.prob !== 0.5));
});
