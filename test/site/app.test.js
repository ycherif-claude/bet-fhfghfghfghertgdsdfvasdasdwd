import test from 'node:test';
import assert from 'node:assert/strict';
import { filtraPerSport, etichettaStato, testoAvvisi } from '../../site/app.js';

const bankrollOk = { bankroll: 200, risultatoSettimana: 0, inGiocoOggi: 0, stopRaggiunto: false, distanzaStop: 50, daSegnare: [] };
const giornata = (extra = {}) => ({ data: '2026-10-19', giocate: [{ id: 'a' }], competizioniNonCoperte: [], erroriGiro: [], ...extra });
const dati = (extra = {}, bankroll = {}) => ({
  oggi: { data: '2026-10-19', disponibile: true, giornata: giornata(extra) },
  bankroll: { ...bankrollOk, ...bankroll },
});

test('filtra per sport', () => {
  const g = [{ sport: 'calcio' }, { sport: 'tennis' }, { sport: 'calcio' }];
  assert.equal(filtraPerSport(g, null).length, 3);
  assert.equal(filtraPerSport(g, 'calcio').length, 2);
  assert.equal(filtraPerSport(g, 'nba').length, 0);
});

test('multipla compare sotto ogni sport delle gambe e sotto Tutti', () => {
  const m = { id: 'M-a+b', sport: 'multipla', gambe: [{ sport: 'calcio' }, { sport: 'tennis' }] };
  const g = [m, { sport: 'nba' }];
  assert.deepEqual(filtraPerSport(g, 'calcio'), [m]);
  assert.deepEqual(filtraPerSport(g, 'tennis'), [m]);
  assert.equal(filtraPerSport(g, null).length, 2);
  assert.equal(filtraPerSport(g, 'basket').length, 0);
});

test('etichetta stato', () => {
  assert.equal(etichettaStato({ stato: 'in_attesa' }).testo, 'In attesa formazioni');
  assert.equal(etichettaStato({ stato: 'confermata' }).testo, 'Confermata');
  assert.equal(etichettaStato({ stato: 'in_revisione' }).testo, 'In revisione');
  assert.equal(etichettaStato({ stato: 'modificata' }).testo, 'Modificata');
  assert.equal(etichettaStato({ stato: 'modificata', motivoStato: 'quota scesa' }).testo, 'Modificata: quota scesa');
  assert.equal(etichettaStato({ stato: 'annullata' }).testo, 'Annullata');
  assert.equal(etichettaStato({ stato: 'annullata', motivoStato: 'out Leão' }).testo, 'Annullata: out Leão');
  assert.ok(etichettaStato({ stato: 'annullata' }).classe);
});

test('avviso se oggi non disponibile', () =>
  assert.ok(testoAvvisi({ oggi: { disponibile: false }, bankroll: bankrollOk }).includes('Analisi di oggi non disponibile')));

test('avviso stop settimanale raggiunto', () => {
  const a = testoAvvisi(dati({}, { stopRaggiunto: true }));
  assert.ok(a.includes('Stop settimanale raggiunto: nessuna nuova giocata fino a lunedì'));
  assert.ok(!testoAvvisi(dati()).some((x) => x.startsWith('Stop')));
});

test('avviso giocate da segnare', () => {
  assert.ok(testoAvvisi(dati({}, { daSegnare: ['a', 'b'] })).includes('Hai 2 giocate da segnare'));
  assert.ok(testoAvvisi(dati({}, { daSegnare: ['a'] })).includes('Hai 1 giocata da segnare'));
  assert.ok(!testoAvvisi(dati()).some((x) => x.includes('da segnare')));
});

test('avviso competizioni non coperte e errori del giro', () => {
  const a = testoAvvisi(dati({ competizioniNonCoperte: ['Liga turca volley', 'X'], erroriGiro: ['fonte giù', 'timeout'] }));
  assert.ok(a.includes('Competizioni non coperte oggi: Liga turca volley, X'));
  assert.ok(a.includes('Errore nel giro del mattino: fonte giù'));
  assert.ok(a.includes('Errore nel giro del mattino: timeout'));
});

test('nessuna giocata con value: "Oggi nessuna giocata con value"', () => {
  assert.ok(testoAvvisi(dati({ giocate: [] })).includes('Oggi nessuna giocata con value'));
  assert.ok(!testoAvvisi(dati()).includes('Oggi nessuna giocata con value'));
});

test('dati di esempio', () => {
  assert.ok(testoAvvisi(dati({ esempio: true })).includes('Dati di esempio, non sono giocate reali'));
});
