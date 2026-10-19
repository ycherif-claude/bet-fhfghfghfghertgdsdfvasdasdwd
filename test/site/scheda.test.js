import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScheda, schedaSicura } from '../../site/app.js';

// DOM minimo: quanto basta a el(), renderScheda e renderSegnatura.
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

const giocata = (extra = {}) => ({
  id: 'g1', sport: 'calcio', competizione: 'Serie A', partita: 'A - B', inizio: '2026-10-19T20:45:00+02:00',
  tipo: 'singola', mercato: '1X2', selezione: '1', prob: 0.56, quota: 2, fonteQuota: 'x', oraQuota: null,
  quotaDaVerificare: false, ragionamento: [], value: 0.12, quotaMinima: 1.88, puntata: { euro: 4, percentuale: 2 },
  stato: 'confermata', motivoStato: null, oraUltimoControllo: null, esito: null, ...extra,
});

test('scheda valida: schedaSicura restituisce la scheda normale', () => {
  const s = schedaSicura('g1', () => renderScheda(giocata(), null));
  assert.equal(s.tag, 'article');
  assert.equal(s.className, 'scheda');
});

test('giocata con inizio non valido o senza puntata: scheda d\'errore, nessuna eccezione', () => {
  assert.throws(() => renderScheda(giocata({ inizio: 'boh' }), null));
  for (const g of [giocata({ id: 'rotta', inizio: 'boh' }), giocata({ id: 'rotta', puntata: undefined })]) {
    const s = schedaSicura(g.id, () => renderScheda(g, null));
    assert.equal(s.className, 'scheda-errore');
    assert.equal(s.testo, 'Scheda non leggibile: rotta');
  }
});
