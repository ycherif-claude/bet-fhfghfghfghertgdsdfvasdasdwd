import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcolaElo, probElo, probVittoria, pesoModelloPartita, kFattore, eloDefault,
} from '../../src/tennis/elo.js';

const partita = (data, vincitore, perdente, extra = {}) => ({
  data, torneo: 'Torneo', serie: 'ATP250', superficie: 'cemento', turno: '1st Round', bestOf: 3,
  vincitore, perdente, setW: [6, 6], setL: [3, 4], commento: null, ...extra,
});

// Con 20 partite su ogni superficie il peso della superficie è pieno.
const voce = (tot, cemento = tot, terra = tot, erba = tot, n = 20) => ({
  tot, cemento, terra, erba, partite: [], conteggi: { tot: n, cemento: n, terra: n, erba: n },
});

test('probElo: stesso Elo 0,5 e +200 punti circa 0,76', () => {
  assert.equal(probElo(1500, 1500), 0.5);
  assert.ok(Math.abs(probElo(1700, 1500) - 0.7597) < 0.001);
  assert.ok(Math.abs(probElo(1500, 1700) - 0.2403) < 0.001);
});

test('kFattore cala con le partite giocate', () => {
  assert.ok(Math.abs(kFattore(0) - 250 / 5 ** 0.4) < 1e-9);
  assert.ok(kFattore(10) < kFattore(0));
  assert.ok(kFattore(100) < kFattore(10));
});

test('calcolaElo: il vincitore sale, il perdente scende, K cala con le partite', () => {
  const elo = calcolaElo([partita('2026-01-05', 'Rossi A.', 'Bianchi B.')]);
  const k0 = kFattore(0);
  assert.ok(Math.abs(elo.get('Rossi A.').tot - (1500 + k0 / 2)) < 1e-9);
  assert.ok(Math.abs(elo.get('Bianchi B.').tot - (1500 - k0 / 2)) < 1e-9);
  assert.ok(Math.abs(elo.get('Rossi A.').cemento - (1500 + k0 / 2)) < 1e-9);
  assert.equal(elo.get('Rossi A.').terra, 1500);
  assert.equal(elo.get('Rossi A.').erba, 1500);
  assert.deepEqual(elo.get('Rossi A.').partite, ['2026-01-05']);

  // Due esordienti che si affrontano dopo molte partite: variazione minore della prima.
  const molte = [];
  for (let i = 0; i < 30; i++) {
    const g = String(i + 1).padStart(2, '0');
    molte.push(partita(`2026-01-${g}`, 'C C.', 'D D.'));
    molte.push(partita(`2026-01-${g}`, 'D D.', 'C C.'));
  }
  const prima = calcolaElo(molte).get('C C.').tot;
  const dopo = calcolaElo([...molte, partita('2026-02-15', 'C C.', 'D D.')]).get('C C.').tot;
  assert.ok(dopo > prima);
  assert.ok(dopo - prima < k0 / 2);
});

test('calcolaElo: conteggi separati per complessivo e superficie', () => {
  const elo = calcolaElo([
    partita('2026-01-05', 'A A.', 'B B.'),
    partita('2026-01-06', 'A A.', 'B B.'),
    partita('2026-04-10', 'A A.', 'B B.', { superficie: 'terra' }),
  ]);
  const a = elo.get('A A.');
  // Sulla terra è la prima partita: K pieno con aspettativa 0,5.
  assert.ok(Math.abs(a.terra - (1500 + kFattore(0) / 2)) < 1e-9);
  assert.equal(a.partite.length, 3);
  assert.ok(a.tot > a.terra);
});

test('calcolaElo: ordina per data, stabile nello stesso giorno', () => {
  const p1 = partita('2026-01-05', 'A A.', 'B B.');
  const p2 = partita('2026-01-05', 'B B.', 'A A.');
  const p3 = partita('2026-01-01', 'C C.', 'A A.');
  const x = calcolaElo([p1, p2, p3]);
  const y = calcolaElo([p3, p1, p2]);
  assert.deepEqual(x.get('A A.'), y.get('A A.'));
  assert.deepEqual(x.get('A A.').partite, ['2026-01-01', '2026-01-05', '2026-01-05']);
  const z = calcolaElo([p3, p2, p1]);
  assert.notEqual(z.get('A A.').tot, x.get('A A.').tot);
});

test('calcolaElo: walkover ignorato, ritiro con set giocati conta', () => {
  const elo = calcolaElo([
    partita('2026-01-05', 'A A.', 'B B.', { setW: [], setL: [], commento: 'Walkover' }),
    partita('2026-01-06', 'A A.', 'C C.', { commento: 'Walkover' }),
    partita('2026-01-07', 'D D.', 'E E.', { setW: [], setL: [], commento: null }),
  ]);
  assert.equal(elo.has('A A.'), false);
  assert.equal(elo.has('B B.'), false);
  assert.equal(elo.has('D D.'), false);

  const rit = calcolaElo([partita('2026-01-05', 'A A.', 'B B.', { setW: [6, 2], setL: [4, 1], commento: 'Retired' })]);
  assert.ok(rit.get('A A.').tot > 1500);
  assert.ok(rit.get('B B.').tot < 1500);
});

test('probVittoria: stesso Elo 0,5; superficie conta', () => {
  assert.equal(probVittoria(voce(1500), voce(1500), 'cemento', 3), 0.5);
  const terraiolo = voce(1700, 1600, 1900, 1600);
  const avversario = voce(1700);
  const pTerra = probVittoria(terraiolo, avversario, 'terra', 3);
  const pCemento = probVittoria(terraiolo, avversario, 'cemento', 3);
  assert.ok(pTerra > pCemento);
  // Media 50/50 di complessivo e superficie.
  assert.ok(Math.abs(pTerra - (0.5 * probElo(1700, 1700) + 0.5 * probElo(1900, 1700))) < 1e-12);
});

test('probVittoria: al meglio dei 5 il favorito sale, 0,5 resta 0,5', () => {
  assert.ok(Math.abs(probVittoria(voce(1500), voce(1500), 'erba', 5) - 0.5) < 1e-9);
  // Trova un divario che dia p3 = 0,7.
  const diff = 400 * Math.log10(0.7 / 0.3);
  const a = voce(1500 + diff);
  const b = voce(1500);
  const p3 = probVittoria(a, b, 'cemento', 3);
  assert.ok(Math.abs(p3 - 0.7) < 1e-9);
  const p5 = probVittoria(a, b, 'cemento', 5);
  assert.ok(p5 > 0.7);
  // Verifica con la formula: s tale che s²(3−2s) = 0,7.
  let lo = 0; let hi = 1;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (m * m * (3 - 2 * m) < 0.7) lo = m; else hi = m; }
  const s = (lo + hi) / 2;
  assert.ok(Math.abs(p5 - s ** 3 * (10 - 15 * s + 6 * s * s)) < 1e-9);
  // Simmetria.
  assert.ok(Math.abs(probVittoria(b, a, 'cemento', 5) - (1 - p5)) < 1e-9);
});

test('probVittoria: risultato limitato in [1e-6, 1−1e-6]', () => {
  assert.equal(probVittoria(voce(9000), voce(0), 'cemento', 3), 1 - 1e-6);
  assert.equal(probVittoria(voce(0), voce(9000), 'cemento', 5), 1e-6);
});

test('eloDefault: 1500 ovunque e nessuna partita', () => {
  assert.deepEqual(eloDefault(), { tot: 1500, cemento: 1500, terra: 1500, erba: 1500, partite: [] });
  const d = eloDefault();
  d.partite.push('x');
  assert.deepEqual(eloDefault().partite, []);
});

test('pesoModelloPartita: 19 partite → 0,25, 20 partite → 0,5', () => {
  const date = (n, inizio = '2026-01-01') => {
    const out = [];
    const t0 = Date.parse(`${inizio}T00:00:00Z`);
    for (let i = 0; i < n; i++) out.push(new Date(t0 + i * 86400000).toISOString().slice(0, 10));
    return out;
  };
  const elo = new Map([
    ['Venti', { ...eloDefault(), partite: date(20) }],
    ['Altro', { ...eloDefault(), partite: date(25) }],
    ['Diciannove', { ...eloDefault(), partite: date(19) }],
    ['Vecchio', { ...eloDefault(), partite: [...date(5, '2025-01-01'), ...date(19)] }],
  ]);
  const oggi = '2026-10-20';
  assert.equal(pesoModelloPartita(elo, 'Venti', 'Altro', oggi), 0.5);
  assert.equal(pesoModelloPartita(elo, 'Diciannove', 'Altro', oggi), 0.25);
  assert.equal(pesoModelloPartita(elo, 'Altro', 'Diciannove', oggi), 0.25);
  // Le partite più vecchie di 365 giorni non contano.
  assert.equal(pesoModelloPartita(elo, 'Vecchio', 'Altro', oggi), 0.25);
  // Giocatore sconosciuto: pochi dati.
  assert.equal(pesoModelloPartita(elo, 'Nessuno', 'Altro', oggi), 0.25);
  // Accetta anche una Date.
  assert.equal(pesoModelloPartita(elo, 'Venti', 'Altro', new Date('2026-10-20T08:00:00Z')), 0.5);
});

test('calcolaElo: conteggi delle partite per superficie in ogni voce', () => {
  const elo = calcolaElo([
    partita('2026-01-05', 'A A.', 'B B.'),
    partita('2026-01-06', 'A A.', 'C C.'),
    partita('2026-04-10', 'A A.', 'B B.', { superficie: 'terra' }),
    partita('2026-04-11', 'A A.', 'B B.', { setW: [], setL: [], commento: 'Walkover' }),
  ]);
  assert.deepEqual(elo.get('A A.').conteggi, { tot: 3, cemento: 2, terra: 1, erba: 0 });
  assert.deepEqual(elo.get('B B.').conteggi, { tot: 2, cemento: 1, terra: 1, erba: 0 });
});

test('probVittoria: peso della superficie × min(1, nSup/20), nSup il minimo dei due giocatori', () => {
  const pTerra = (nA, nB) => probVittoria(voce(1700, 1600, 1900, 1600, nA), voce(1700, 1700, 1700, 1700, nB), 'terra', 3);
  const mix = (w) => (1 - w) * probElo(1700, 1700) + w * probElo(1900, 1700);
  assert.ok(Math.abs(pTerra(20, 40) - mix(0.5)) < 1e-12);
  assert.ok(Math.abs(pTerra(40, 10) - mix(0.25)) < 1e-12);
  assert.ok(Math.abs(pTerra(5, 30) - mix(0.125)) < 1e-12);
  assert.equal(pTerra(0, 30), 0.5);
  // Senza conteggi (giocatore mai visto, eloDefault): solo l'Elo complessivo.
  assert.equal(probVittoria({ ...eloDefault(), terra: 1900 }, eloDefault(), 'terra', 3), 0.5);
});
