import test from 'node:test';
import assert from 'node:assert/strict';
import { filtraPerSport, etichettaStato, testoAvvisi, distanzaDaMostrare, avvisiDati, testoAggiornamento, valoriCampi } from '../../site/app.js';

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

test('distanza dallo stop: 0 oltre lo stop, altrimenti il valore', () => {
  assert.equal(distanzaDaMostrare({ distanzaStop: -3.5 }), 0);
  assert.equal(distanzaDaMostrare({ distanzaStop: 0 }), 0);
  assert.equal(distanzaDaMostrare({ distanzaStop: 12.5 }), 12.5);
});

test('erroriDati: un avviso "Dati non validi in <file>: <errore>" per ciascuno', () => {
  const adesso = new Date('2026-10-19T10:00:00Z');
  const d = { ...dati(), generatoAlle: '2026-10-19T09:30:00Z',
    erroriDati: [{ file: 'giornate/2026-10-18.json', errore: 'JSON non valido' }, { file: 'segnature/a.json', errore: 'ora non valida' }] };
  const a = testoAvvisi(d, adesso);
  assert.ok(a.includes('Dati non validi in giornate/2026-10-18.json: JSON non valido'));
  assert.ok(a.includes('Dati non validi in segnature/a.json: ora non valida'));
  assert.deepEqual(avvisiDati({ generatoAlle: '2026-10-19T09:30:00Z', erroriDati: [] }, adesso), []);
});

test('dati vecchi di più di 2 ore: avviso "I dati potrebbero non essere aggiornati"', () => {
  const msg = 'I dati potrebbero non essere aggiornati';
  const adesso = new Date('2026-10-19T12:00:00Z');
  assert.ok(!avvisiDati({ generatoAlle: '2026-10-19T10:00:00Z' }, adesso).includes(msg)); // esattamente 2 ore
  assert.ok(avvisiDati({ generatoAlle: '2026-10-19T09:59:00Z' }, adesso).includes(msg));
  assert.ok(avvisiDati({}, adesso).includes(msg));
  assert.ok(testoAvvisi({ ...dati(), generatoAlle: '2026-10-18T12:00:00Z' }, adesso).includes(msg));
});

test('testoAggiornamento: "Dati aggiornati alle HH:MM" in ora di Roma', () => {
  assert.equal(testoAggiornamento('2026-10-19T07:05:00Z'), 'Dati aggiornati alle 09:05');
  assert.equal(testoAggiornamento(undefined), null);
  assert.equal(testoAggiornamento('non è una data'), null);
});

test('valoriCampi: consigliati finché non si scrive, poi restano quelli scritti', () => {
  const g = { quota: 2.1, puntata: { euro: 4.5 } };
  assert.deepEqual(valoriCampi(g, null), { quota: '2,1', puntata: '4,5' });
  assert.deepEqual(valoriCampi({ quota: null, puntata: { euro: 3 } }, null), { quota: '', puntata: '3' });
  // dopo "Quota reale non valida" o un errore di rete il ridisegno mostra ancora il testo scritto
  assert.deepEqual(valoriCampi(g, { quota: '1', puntata: '7' }), { quota: '1', puntata: '7' });
  assert.deepEqual(valoriCampi(g, { quota: '', puntata: '' }), { quota: '', puntata: '' });
});
