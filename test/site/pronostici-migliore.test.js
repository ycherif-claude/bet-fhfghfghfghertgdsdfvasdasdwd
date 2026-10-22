// Idea 2: sul sito il pronostico migliore di ogni partita in evidenza, gli altri in un <details>.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPronostici } from '../../site/app.js';

function nodo(tag) {
  return {
    tag, attrs: {}, figli: [], className: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...n) { this.figli.push(...n); },
    replaceChildren(...n) { this.figli = n; },
    addEventListener() {},
    get testo() { return this.figli.map((f) => f.text ?? f.testo ?? '').join(''); },
  };
}
globalThis.document = { createElement: nodo, createTextNode: (text) => ({ text }) };
const tutti = (n) => [n, ...(n.figli ?? []).flatMap((f) => (f && typeof f === 'object' ? tutti(f) : []))];

const x = (testo, migliore) => ({ mercato: 'M', selezione: testo, testo, prob: 0.85, limite: 0.82, n: 500, quotaMinima: 1.18, quota: null, giocabile: false, esito: null, migliore });
const partita = (pronostici) => ({ idPartita: 'p', sport: 'calcio', competizione: 'Serie A', partita: 'A - B', inizio: '2026-10-25T18:00:00Z', pronostici });

test('sito: il migliore in evidenza, gli altri in "altri pronostici (collegati)"', () => {
  const s = renderPronostici(partita([x('Segna A', false), x('Vince A', true), x('A non perde', false)]));
  const evidenza = tutti(s).find((n) => n.className === 'pronostico-migliore');
  assert.ok(evidenza, 'manca il migliore in evidenza');
  assert.match(evidenza.testo + tutti(evidenza).map((n) => n.testo).join(''), /Vince A/);
  const det = tutti(s).find((n) => n.tag === 'details');
  assert.ok(det, 'manca il details degli altri');
  const sommario = tutti(det).find((n) => n.tag === 'summary');
  assert.match(sommario.testo, /altri pronostici \(collegati\)/);
  const dentro = tutti(det).map((n) => n.testo).join('|');
  assert.match(dentro, /Segna A/);
  assert.match(dentro, /A non perde/);
  assert.doesNotMatch(dentro, /Vince A/);
});

test('sito: senza altri pronostici niente details; dati vecchi senza migliore: tutti in lista come prima', () => {
  const solo = renderPronostici(partita([x('Vince A', true)]));
  assert.ok(!tutti(solo).some((n) => n.tag === 'details'));
  const vecchi = renderPronostici(partita([x('Segna A', undefined), x('Vince A', undefined)]));
  assert.ok(!tutti(vecchi).some((n) => n.tag === 'details'));
  assert.equal(tutti(vecchi).filter((n) => n.tag === 'li').length, 2);
});
