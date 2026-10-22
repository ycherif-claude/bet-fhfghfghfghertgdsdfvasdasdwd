// Idea 1: sul sito, accanto al pronostico, la quota migliore dei bookmaker dell'utente (odss-api) con l'orario,
// la quota minima e ✅ oppure "solo da tenere d'occhio"; nelle doppie/triple il bookmaker di ogni gamba.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPronostici, renderSchedinaPronostici } from '../../site/app.js';

function nodo(tag) {
  return {
    tag, attrs: {}, figli: [], className: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...n) { this.figli.push(...n); },
    replaceChildren(...n) { this.figli = n; },
    addEventListener() {},
  };
}
globalThis.document = { createElement: nodo, createTextNode: (text) => ({ text }) };
const testo = (n) => (n && typeof n === 'object' ? (n.text ?? '') + (n.figli ?? []).map(testo).join('') : '');

const x = (extra) => ({ mercato: '1X2', selezione: '1', testo: 'Vince Torino', prob: 0.85, limite: 0.82, n: 500, quotaMinima: 1.24, quota: 1.31,
  quotaMigliore: 1.31, bookmakerMigliore: 'sportium', oraQuota: '2026-10-23T05:40:00+00:00', probMercato: 0.83, giocabile: true, esito: null, migliore: true, ...extra });
const partita = (p) => ({ idPartita: 'p', sport: 'calcio', competizione: 'Serie A', partita: 'Torino - Monza', inizio: '2026-10-23T18:45:00Z', pronostici: [p] });

test('sito: quota migliore con bookmaker, minima e orario; ✅ o solo da tenere d\'occhio', () => {
  const t = testo(renderPronostici(partita(x())));
  assert.match(t, /quota migliore 1,31 su Sportium \(minima 1,24\), quota delle 07:40 ✅/);
  assert.doesNotMatch(t, /tenere d'occhio/);
  const o = testo(renderPronostici(partita(x({ giocabile: false, probMercato: 0.7 }))));
  assert.match(o, /quota migliore 1,31 su Sportium \(minima 1,24\), quota delle 07:40 · solo da tenere d'occhio/);
  // Dati senza odss: come prima.
  const v = testo(renderPronostici(partita(x({ quotaMigliore: undefined, bookmakerMigliore: undefined, oraQuota: undefined }))));
  assert.match(v, /quota minima 1,24 · oggi 1,31 ✅/);
});

test('sito: nelle doppie/triple il bookmaker della gamba', () => {
  const s = { id: 's', tipo: 'doppia', quota: 1.57, probCombinata: 0.7, esito: null, gambe: [
    { idPartita: 'a', partita: 'A - B', inizio: '2026-10-25T16:00:00Z', testo: 'Vince A', quota: 1.31, bookmaker: 'daznbet', quotaDaVerificare: false },
    { idPartita: 'c', partita: 'C - D', inizio: '2026-10-25T18:00:00Z', testo: 'Vince C', quota: 1.2, quotaDaVerificare: true },
  ] };
  const t = testo(renderSchedinaPronostici(s));
  assert.match(t, /Vince A @ 1,31 su DAZN Bet/);
  assert.match(t, /Vince C @ 1,20 \(quota minima, da verificare/);
});
