import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selezionaGiocate } from '../../src/regole/selezione.js';

let n = 0;
const candidato = (o = {}) => {
  n += 1;
  return {
    id: `c${n}`, sport: 'calcio', competizione: 'Serie A', partita: `A${n} - B${n}`, idPartita: `p${n}`,
    inizio: '2026-10-19T20:45:00+02:00', tipo: 'singola', mercato: '1X2', selezione: '1',
    prob: 0.60, quota: 1.90, fonteQuota: 'x', oraQuota: null, quotaDaVerificare: false, ragionamento: [], ...o,
  };
};
const stato = (o = {}) => ({ bankroll: 1000, inGiocoOggi: 0, stopRaggiunto: false, ...o });
const motivi = (r) => Object.fromEntries(r.scartate.map((s) => [s.idCandidato, s.motivo]));

test('estremi inclusi: 1.60 e 3.00 singola, 3.01 speciale, 4.50 speciale, 4.51 scartata', () => {
  const c160 = candidato({ prob: 0.7, quota: 1.60 });
  const c300 = candidato({ prob: 0.4, quota: 3.00 });
  const c301 = candidato({ prob: 0.4, quota: 3.01 });
  const c450 = candidato({ prob: 0.3, quota: 4.50 });
  const c451 = candidato({ prob: 0.3, quota: 4.51 });
  const r = selezionaGiocate([c160, c300, c301, c450, c451], stato());
  const tipo = (id) => r.giocate.find((g) => g.id === id)?.tipo;
  assert.equal(tipo(c160.id), 'singola');
  assert.equal(tipo(c300.id), 'singola');
  assert.equal(tipo(c301.id), 'speciale');
  assert.equal(tipo(c450.id), 'speciale');
  assert.equal(tipo(c451.id), undefined);
  assert.equal(motivi(r)[c451.id], 'quota fuori range');
});
test('value sotto 5% scartato con motivo "value insufficiente"', () => {
  const c = candidato({ prob: 0.5, quota: 2.0 });
  const r = selezionaGiocate([c], stato());
  assert.equal(r.giocate.length, 0);
  assert.equal(motivi(r)[c.id], 'value insufficiente');
});
test('speciale con value 8% scartata', () => {
  const c = candidato({ prob: 0.27, quota: 4.0 });
  const r = selezionaGiocate([c], stato());
  assert.equal(r.giocate.length, 0);
  assert.equal(motivi(r)[c.id], 'value insufficiente');
});
test('due singole sulla stessa partita: resta quella con value più alto', () => {
  const a = candidato({ idPartita: 'x', prob: 0.60, quota: 1.90 });
  const b = candidato({ idPartita: 'x', prob: 0.65, quota: 1.90 });
  const r = selezionaGiocate([a, b], stato());
  assert.deepEqual(r.giocate.map((g) => g.id), [b.id]);
  assert.equal(motivi(r)[a.id], 'altra giocata sulla stessa partita');
});
test('massimo 10 singole: restano le 10 con value più alto', () => {
  const cs = Array.from({ length: 12 }, (_, i) => candidato({ prob: 0.60 + i * 0.005, quota: 1.90 }));
  const r = selezionaGiocate(cs, stato({ bankroll: 1000, inGiocoOggi: -10000 }));
  const singole = r.giocate.filter((g) => g.tipo === 'singola');
  assert.equal(singole.length, 10);
  const attesi = cs.slice(2).map((c) => c.id).sort();
  assert.deepEqual(singole.map((g) => g.id).sort(), attesi);
  assert.equal(motivi(r)[cs[0].id], 'limite giornaliero singole');
});
test('tetto 12%: con bankroll 200 e inGiocoOggi 20, una puntata da 6 € viene scartata con motivo "tetto giornaliero"', () => {
  const c = candidato({ prob: 0.61, quota: 1.85 });
  const r = selezionaGiocate([c], stato({ bankroll: 200, inGiocoOggi: 20 }));
  assert.equal(r.giocate.length, 0);
  assert.equal(motivi(r)[c.id], 'tetto giornaliero');
  const ok = selezionaGiocate([c], stato({ bankroll: 200, inGiocoOggi: 18 }));
  assert.equal(ok.giocate.length, 1);
});
test('stopRaggiunto: nessuna giocata, tutte scartate con motivo "stop settimanale"', () => {
  const cs = [candidato(), candidato()];
  const r = selezionaGiocate(cs, stato({ stopRaggiunto: true }));
  assert.equal(r.giocate.length, 0);
  assert.deepEqual(r.scartate, cs.map((c) => ({ idCandidato: c.id, motivo: 'stop settimanale' })));
});
test('puntata arrotondata a 0 (bankroll 30, builder): scartata con motivo "puntata troppo bassa"', () => {
  const c = candidato({ tipo: 'builder', prob: 0.2, quota: 6.0 });
  const r = selezionaGiocate([c], stato({ bankroll: 30 }));
  assert.equal(r.giocate.length, 0);
  assert.equal(motivi(r)[c.id], 'puntata troppo bassa');
});
test('stato iniziale delle giocate = "in_attesa"', () => {
  const r = selezionaGiocate([candidato()], stato());
  const g = r.giocate[0];
  assert.equal(g.stato, 'in_attesa');
  assert.equal(g.motivoStato, null);
  assert.equal(g.oraUltimoControllo, null);
  assert.equal(g.esito, null);
  assert.ok(g.value > 0.05);
  assert.ok(g.puntata.euro > 0);
});
test('quota null: valutata alla quota minima, resta null e da verificare', () => {
  const c = candidato({ prob: 0.55, quota: null, quotaDaVerificare: true });
  const r = selezionaGiocate([c], stato());
  const g = r.giocate[0];
  assert.equal(g.quota, null);
  assert.equal(g.quotaDaVerificare, true);
  assert.equal(g.quotaMinima, 1.91);
  assert.ok(Math.abs(g.value - 0.0505) < 1e-9);
});
