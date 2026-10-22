// Idea 4: sezione "Doppie e triple" del sito.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSchedinaPronostici } from '../../site/app.js';

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

const schedina = (extra = {}) => ({
  id: 'sp-1', tipo: 'tripla', quota: 1.87, probCombinata: 0.61, prova: true, etichetta: 'PROVA – non giocare', esito: null, quotaFinale: null,
  gambe: [
    { idPartita: 'a', partita: 'A - B', inizio: '2026-10-25T16:00:00Z', testo: 'Vince A', quota: 1.25, quotaDaVerificare: true, esito: null },
    { idPartita: 'c', partita: 'C - D', inizio: '2026-10-25T18:00:00Z', testo: 'Segna C', quota: 1.2, quotaDaVerificare: false, esito: 'vinta' },
    { idPartita: 'e', partita: 'E - F', inizio: '2026-10-25T18:00:00Z', testo: 'Vince E', quota: 1.25, quotaDaVerificare: true, esito: null },
  ],
  ...extra,
});

test('sito: scheda della schedina con PROVA, quota, probabilità, gambe ed esito', () => {
  const s = renderSchedinaPronostici(schedina());
  const testo = tutti(s).map((n) => n.testo ?? n.text ?? '').join('|');
  assert.ok(tutti(s).some((n) => n.className === 'prova' && /PROVA – non giocare/.test(n.testo)));
  assert.match(testo, /Tripla/);
  assert.match(testo, /1,87/);
  assert.match(testo, /61%/);
  assert.match(testo, /Vince A/);
  assert.match(testo, /da verificare/);
  assert.match(testo, /in attesa/);
  const vinta = tutti(renderSchedinaPronostici(schedina({ esito: 'vinta', quotaFinale: 1.87 }))).map((n) => n.testo ?? '').join('|');
  assert.match(vinta, /vinta/);
});

test('sito: la pagina ha la sezione "Doppie e triple"', () => {
  assert.match(readFileSync('site/index.html', 'utf8'), /id="schedine-pronostici"/);
  assert.match(readFileSync('site/app.js', 'utf8'), /'Doppie e triple'/);
});
