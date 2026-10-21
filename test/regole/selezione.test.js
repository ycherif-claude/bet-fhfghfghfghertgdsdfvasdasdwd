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
test('tetto 12%: con bankroll 200 e inGiocoOggi 20, una puntata da 6 € viene ridotta a 4 € (tetto giornaliero)', () => {
  const c = candidato({ prob: 0.61, quota: 1.85 });
  const r = selezionaGiocate([c], stato({ bankroll: 200, inGiocoOggi: 20 }));
  assert.equal(r.scartate.length, 0);
  assert.equal(r.giocate[0].puntata.euro, 4);
  assert.equal(r.giocate[0].puntata.percentuale, 2);
  assert.deepEqual(r.giocate[0].puntata.ridotta, { da: 6, motivo: 'tetto giornaliero' });
  const ok = selezionaGiocate([c], stato({ bankroll: 200, inGiocoOggi: 18 }));
  assert.equal(ok.giocate[0].puntata.euro, 6);
  assert.equal(ok.giocate[0].puntata.ridotta, undefined);
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

import { statoBankroll } from '../../src/bankroll/bankroll.js';

test('stop esattamente a −50: stopRaggiunto true e nessuna giocata proposta', () => {
  const adesso = new Date('2026-10-21T12:00:00Z');
  const giocate = [{ id: 'x', inizio: '2026-10-20T18:00:00+02:00', stato: 'confermata', esito: 'persa' }];
  const segn = [{ idGiocata: 'x', fatta: true, quotaReale: 2, puntataReale: 50, ora: '2026-10-20T09:00:00+02:00' }];
  const s = statoBankroll(giocate, segn, adesso);
  assert.equal(s.risultatoSettimana, -50);
  assert.equal(s.stopRaggiunto, true);
  assert.equal(s.distanzaStop, 0);
  const cs = [candidato(), candidato()];
  const r = selezionaGiocate(cs, s);
  assert.equal(r.giocate.length, 0);
  assert.ok(r.scartate.every((x) => x.motivo === 'stop settimanale'));
});
test('distanzaStop minore di una puntata: giocata ridotta alla distanza, motivo "stop settimanale"', () => {
  const c = candidato({ prob: 0.61, quota: 1.85 }); // 6 € con bankroll 200
  const r = selezionaGiocate([c], stato({ bankroll: 200, distanzaStop: 5 }));
  assert.equal(r.scartate.length, 0);
  assert.equal(r.giocate[0].puntata.euro, 5);
  assert.deepEqual(r.giocate[0].puntata.ridotta, { da: 6, motivo: 'stop settimanale' });
  // Distanza sotto la puntata minima: scartata.
  const fuori = selezionaGiocate([c], stato({ bankroll: 200, distanzaStop: 0.9 }));
  assert.equal(fuori.giocate.length, 0);
  assert.equal(motivi(fuori)[c.id], 'puntata ridotta sotto il minimo (stop settimanale)');
});
test('distanzaStop 5 con più candidati: somma delle puntate proposte ≤ 5 €', () => {
  const cs = Array.from({ length: 6 }, (_, i) => candidato({ prob: 0.56 + i * 0.01, quota: 1.92 }));
  const r = selezionaGiocate(cs, stato({ bankroll: 155, distanzaStop: 5 }));
  const somma = r.giocate.reduce((a, g) => a + g.puntata.euro, 0);
  assert.ok(r.giocate.length > 0);
  assert.ok(somma <= 5 + 1e-9, `somma ${somma}`);
  assert.ok(r.giocate.every((g) => g.puntata.euro >= 1 && g.puntata.ridotta.motivo === 'stop settimanale'));
  assert.ok(r.scartate.some((x) => x.motivo === 'puntata ridotta sotto il minimo (stop settimanale)'));
});
test('tetto giornaliero più stretto della distanza dallo stop: motivo resta "tetto giornaliero"', () => {
  const c = candidato({ prob: 0.61, quota: 1.85 });
  const r = selezionaGiocate([c], stato({ bankroll: 200, inGiocoOggi: 20, distanzaStop: 30 }));
  assert.deepEqual(r.giocate[0].puntata.ridotta, { da: 6, motivo: 'tetto giornaliero' });
});

// --- Puntate ridotte in proporzione (tetto giornaliero e stop settimanale) ---

// 10 singole da 5 € con bankroll 200 (Kelly 2,5-2,7%), value crescente con l'indice.
// Quota 2,50: due gambe fanno 6,25, oltre il massimo della multipla, quindi nessuna multipla.
const dieciDa5 = () => Array.from({ length: 10 }, (_, i) => candidato({ prob: 0.46 + i * 0.0005, quota: 2.5 }));
const somma = (r) => r.giocate.reduce((a, g) => a + Math.round(g.puntata.euro * 100), 0) / 100;

test('somma delle puntate sotto il limite: puntate invariate, nessun "ridotta"', () => {
  const cs = dieciDa5().slice(0, 4);
  const r = selezionaGiocate(cs, stato({ bankroll: 200 }));
  assert.equal(r.giocate.length, 4);
  assert.ok(r.giocate.every((g) => g.puntata.euro === 5 && !('ridotta' in g.puntata)));
  assert.equal(r.scartate.length, 0);
});
test('10 giocate da 5 € con limite 24: tutte presenti, ognuna 2,40 €, motivo tetto giornaliero', () => {
  const cs = dieciDa5();
  const r = selezionaGiocate(cs, stato({ bankroll: 200 }));
  assert.equal(r.giocate.length, 10);
  assert.equal(r.scartate.length, 0);
  for (const g of r.giocate) {
    assert.equal(g.puntata.euro, 2.4);
    assert.equal(g.puntata.percentuale, 1.2);
    assert.deepEqual(g.puntata.ridotta, { da: 5, motivo: 'tetto giornaliero' });
  }
  assert.ok(somma(r) <= 24, `somma ${somma(r)}`);
});
test('riduzione sotto 1 €: esce la giocata col value più basso, le altre ricalcolate', () => {
  // Limite 9 €: 10 × 5 € → 0,90 € ciascuna, sotto il minimo; tolta la peggiore, 9 × 1,00 €.
  const cs = dieciDa5();
  const r = selezionaGiocate(cs, stato({ bankroll: 200, inGiocoOggi: 15 }));
  assert.equal(r.giocate.length, 9);
  assert.deepEqual(r.scartate, [{ idCandidato: cs[0].id, motivo: 'puntata ridotta sotto il minimo (tetto giornaliero)' }]);
  assert.ok(r.giocate.every((g) => g.puntata.euro === 1 && g.puntata.ridotta.da === 5));
  assert.ok(somma(r) <= 9, `somma ${somma(r)}`);
});
test('limite dato dallo stop (distanzaStop 10 < tetto): motivo "stop settimanale"', () => {
  const r = selezionaGiocate(dieciDa5(), stato({ bankroll: 200, distanzaStop: 10 }));
  assert.equal(r.giocate.length, 10);
  assert.ok(r.giocate.every((g) => g.puntata.euro === 1));
  assert.ok(r.giocate.every((g) => g.puntata.ridotta.motivo === 'stop settimanale'));
  assert.ok(somma(r) <= 10);
});
test('residuo del tetto 1,50 € e due giocate: resta solo quella col value più alto', () => {
  const [a, b] = dieciDa5().slice(0, 2);
  const r = selezionaGiocate([a, b], stato({ bankroll: 200, inGiocoOggi: 22.5 }));
  assert.deepEqual(r.giocate.map((g) => g.id), [b.id]);
  assert.equal(r.giocate[0].puntata.euro, 1.5);
  assert.equal(r.giocate[0].puntata.percentuale, 0.75);
  assert.deepEqual(r.giocate[0].puntata.ridotta, { da: 5, motivo: 'tetto giornaliero' });
  assert.deepEqual(r.scartate, [{ idCandidato: a.id, motivo: 'puntata ridotta sotto il minimo (tetto giornaliero)' }]);
});
test('residuo sotto 1 €: nessuna giocata, scartate tutte per puntata ridotta sotto il minimo', () => {
  const cs = dieciDa5().slice(0, 3);
  const r = selezionaGiocate(cs, stato({ bankroll: 200, inGiocoOggi: 23.5 }));
  assert.equal(r.giocate.length, 0);
  assert.equal(r.scartate.length, 3);
  assert.ok(r.scartate.every((s) => s.motivo === 'puntata ridotta sotto il minimo (tetto giornaliero)'));
});
test('arrotondamento ai 10 centesimi per difetto: la somma non supera mai il limite', () => {
  // Limite 7 €, tre giocate da 5 €: 7/15 × 5 = 2,333 → 2,30 € ciascuna, somma 6,90.
  const cs = dieciDa5().slice(0, 3);
  const r = selezionaGiocate(cs, stato({ bankroll: 200, inGiocoOggi: 17 }));
  assert.deepEqual(r.giocate.map((g) => g.puntata.euro), [2.3, 2.3, 2.3]);
  assert.ok(somma(r) <= 7);
});
test('riduzione anche per multiple e speciali: tutte con "ridotta", somma ≤ limite', () => {
  // Quote 1,90: si formano due multiple da 2 €; una speciale da 2 €; 4 singole da 6 €. Limite 20 € su 30.
  const cs = [...Array.from({ length: 4 }, (_, i) => candidato({ prob: 0.60 + i * 0.005, quota: 1.90 })),
    candidato({ prob: 0.33, quota: 3.5 })];
  const r = selezionaGiocate(cs, stato({ bankroll: 200, inGiocoOggi: 4 }));
  assert.ok(r.giocate.some((g) => g.tipo === 'multipla'));
  assert.ok(r.giocate.some((g) => g.tipo === 'speciale'));
  assert.ok(r.giocate.every((g) => g.puntata.ridotta?.motivo === 'tetto giornaliero' && g.puntata.euro >= 1));
  assert.ok(somma(r) <= 20, `somma ${somma(r)}`);
});

test('bankroll o inGiocoOggi non numerici: per prudenza nessuna nuova puntata', () => {
  for (const s of [{ inGiocoOggi: NaN }, { inGiocoOggi: undefined }, { bankroll: NaN }]) {
    const r = selezionaGiocate([candidato({ id: 'x', prob: 0.6, quota: 2 })], stato(s));
    assert.equal(r.giocate.length, 0, JSON.stringify(s));
  }
});
