// Idea 2 [utente, 22/10/2026]: un solo pronostico "migliore" per partita. Con quota: il massimo di
// probabilità prudente × quota; senza: la probabilità prudente più alta fra quelli con quota minima ≥ 1,20
// (se nessuno, la quota minima più alta). Sito e Telegram mettono in evidenza il migliore; l'istantanea lo salva.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scegliMigliore, pronosticiPartita, righeIstantanea } from '../../src/regole/pronostici.js';
import { testoPronostici } from '../../src/notifiche/telegram.js';

const pr = (selezione, limite, quotaMinima, quota = null, extra = {}) => ({
  mercato: 'M', selezione, testo: `T ${selezione}`, prob: limite + 0.02, limite, quotaMinima, quota, giocabile: false, esito: null, ...extra,
});
const migliori = (lista) => lista.filter((x) => x.migliore === true).map((x) => x.selezione);

test('migliore con quota: massimo di probabilità prudente × quota fra quelli con quota', () => {
  const lista = scegliMigliore([
    pr('a', 0.90, 1.08, 1.10), // 0,99
    pr('b', 0.82, 1.20, 1.30), // 1,066
    pr('c', 0.85, 1.15), // senza quota: non conta
  ]);
  assert.deepEqual(migliori(lista), ['b']);
  assert.equal(lista.filter((x) => x.migliore === false).length, 2);
});

test('migliore senza quote: probabilità prudente più alta fra quota minima ≥ 1,20; se nessuna, quota minima più alta', () => {
  assert.deepEqual(migliori(scegliMigliore([pr('a', 0.92, 1.06), pr('b', 0.81, 1.22), pr('c', 0.83, 1.20)])), ['c']);
  assert.deepEqual(migliori(scegliMigliore([pr('a', 0.92, 1.06), pr('b', 0.86, 1.15), pr('c', 0.88, 1.13)])), ['b']);
  // Senza limite (dati vecchi) si usa la probabilità.
  assert.deepEqual(migliori(scegliMigliore([{ selezione: 'x', prob: 0.8, quotaMinima: 1.25 }, { selezione: 'y', prob: 0.82, quotaMinima: 1.22 }])), ['y']);
  assert.deepEqual(scegliMigliore([]), []);
});

test('pronosticiPartita: esattamente un migliore per partita', () => {
  const fasce = [{ da: 0.75, n: 4000, vera: 0.86 }];
  const cal = { calcio: { principali: { 'Under/Over 1.5|Over 1.5': fasce, 'Doppia chance|1X': fasce, '1X2|1': [{ da: 0.75, n: 4000, vera: 0.82 }] } } };
  const partita = { sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Lecce', casa: 'Inter', trasferta: 'Lecce', mercati: [
    { mercato: 'Under/Over 1.5', selezione: 'Over 1.5', probModello: 0.8, probPinnacle: 0.7, quota: null },
    { mercato: 'Doppia chance', selezione: '1X', probModello: 0.8, probPinnacle: 0.84, quota: null },
    { mercato: '1X2', selezione: '1', probModello: 0.8, probPinnacle: 0.8, quota: null },
  ] };
  const p = pronosticiPartita(partita, cal);
  assert.ok(p.length >= 2);
  assert.equal(p.filter((x) => x.migliore === true).length, 1);
  assert.ok(p.every((x) => typeof x.migliore === 'boolean'));
});

test('istantanea: salva migliore (e niente campo per i dati vecchi senza)', () => {
  const p = { idPartita: 'x', sport: 'calcio', competizione: 'Serie A', partita: 'A - B', inizio: '2026-10-25T18:00:00Z',
    pronostici: [{ ...pr('a', 0.82, 1.22), migliore: true }, { ...pr('b', 0.85, 1.15), migliore: false }, pr('c', 0.85, 1.15)] };
  const righe = righeIstantanea([p]);
  assert.deepEqual(righe.map((r) => r.migliore), [true, false, undefined]);
  assert.ok(!('migliore' in righe[2]));
});

test('Telegram del mattino: solo i migliori, più una riga "altri N pronostici sul sito"', () => {
  const g = { data: '2026-10-25', pronostici: [
    { idPartita: 'x', sport: 'calcio', partita: 'A - B', inizio: '2026-10-25T18:00:00Z', pronostici: [
      { ...pr('a', 0.82, 1.22), testo: 'Vince A', migliore: true }, { ...pr('b', 0.85, 1.15), testo: 'Segna A', migliore: false }, { ...pr('c', 0.85, 1.15), testo: 'A non perde', migliore: false },
    ] },
    { idPartita: 'y', sport: 'calcio', partita: 'C - D', inizio: '2026-10-25T20:00:00Z', pronostici: [{ ...pr('d', 0.85, 1.15), testo: 'Segna C', migliore: true }] },
  ] };
  const t = testoPronostici(g, '2026-10-25');
  assert.match(t, /Vince A/);
  assert.match(t, /Segna C/);
  assert.doesNotMatch(t, /Segna A/);
  assert.doesNotMatch(t, /A non perde/);
  assert.match(t, /altri 2 pronostici sul sito/);
  // Senza altri pronostici nessuna riga.
  assert.doesNotMatch(testoPronostici({ ...g, pronostici: [g.pronostici[1]] }, '2026-10-25'), /altri .* sul sito/);
});
