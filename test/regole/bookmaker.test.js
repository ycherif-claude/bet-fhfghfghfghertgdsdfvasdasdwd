import test from 'node:test';
import assert from 'node:assert/strict';
import { bookmakerItaliani } from '../../src/nba/quote.js';
import { bookmakerCalcio, riassuntoMercato } from '../../src/calcio/odss.js';

globalThis.document ??= { createElement: () => ({ setAttribute() {}, append() {}, replaceChildren() {}, addEventListener() {} }), createTextNode: (text) => ({ text }), getElementById: () => null };
const { doveGiocare } = await import('../../site/app.js');

test('bookmaker italiani (formato NBA): solo quelli con licenza italiana, dalla quota più alta', () => {
  const b = (chiave, casa) => ({ chiave, mercati: { vincente: { casa, trasferta: 3 } } });
  const evento = { bookmaker: [b('snai', 1.4), b('pinnacle', 1.5), b('sisal', 1.45), b('bet365', 1.38)] };
  assert.deepEqual(bookmakerItaliani(evento, 'vincente', 'casa', null), [['sisal', 1.45], ['snai', 1.4], ['bet365', 1.38]]);
  assert.equal(bookmakerItaliani({ bookmaker: [b('pinnacle', 1.5)] }, 'vincente', 'casa', null), null);
});

test('calcio: quote dei bookmaker italiani nel riassunto del mercato e per la partita', () => {
  const libro = (key, HOME) => ({ key, outcomes: { HOME, DRAW: 3.5, AWAY: 4 } });
  const riga = { market: '1x2', bookmakers: [libro('snai', 1.9), libro('eurobet', 1.95), libro('pinnacle', 2.0), libro('unibet', 2.1)] };
  const r = riassuntoMercato(riga);
  assert.deepEqual(r.italiani.HOME, [['eurobet', 1.95], ['snai', 1.9]]);
  assert.deepEqual(bookmakerCalcio({ mercati: { '1x2': r } }, '1X2', '1'), [['eurobet', 1.95], ['snai', 1.9]]);
  assert.equal(bookmakerCalcio({ mercati: {} }, '1X2', '1'), null);
});

test('dove giocare: solo i bookmaker con tutte le partite, quota totale dalla più alta', () => {
  const gambe = [
    { bookmaker: [['snai', 1.4], ['sisal', 1.45], ['eurobet', 1.5]] },
    { bookmaker: [['snai', 1.45], ['sisal', 1.4]] },
  ];
  assert.deepEqual(doveGiocare(gambe), [['sisal', 2.03], ['snai', 2.03]]);
  assert.deepEqual(doveGiocare([{ bookmaker: [['snai', 1.4]] }, {}]), []);
});
