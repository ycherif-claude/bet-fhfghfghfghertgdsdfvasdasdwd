import test from 'node:test';
import assert from 'node:assert/strict';
import { filtraPerSport, etichettaStato, testoAvvisi, vociRiquadro, giornataPiena, avvisiDati, testoAggiornamento, valoriCampi } from '../../site/app.js';

const bankrollOk = { bankroll: 200, risultatoSettimana: 0, inGiocoOggi: 0, daSegnare: [] };
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

test('stop settimanale tolto: nessun avviso di stop, nemmeno con la settimana molto negativa o dati vecchi', () => {
  const a = testoAvvisi(dati({}, { risultatoSettimana: -90, stopRaggiunto: true }));
  assert.ok(!a.some((x) => /stop/i.test(x)), a.join(' | '));
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

const fissa = { euro: 1, percentuale: 0.5, fissa: { da: 5, motivo: 'giornata piena' } };

test('giornataPiena: vero se una giocata di oggi ha la puntata fissa', () => {
  assert.equal(giornataPiena({ giocate: [{ puntata: { euro: 5 } }, { puntata: fissa }] }), true);
  assert.equal(giornataPiena({ giocate: [{ puntata: { euro: 5 } }, { puntata: { euro: 2.4, ridotta: { da: 5, motivo: 'tetto giornaliero' } } }] }), false);
  assert.equal(giornataPiena(null), false);
  assert.equal(giornataPiena({ giocate: [null, {}] }), false);
});

test('riquadro: saldo da 0 dal giorno di inizio dei conti, settimana e in gioco oggi; niente bankroll né tetto', () => {
  const b = { ...bankrollOk, saldo: 4.5, risultatoSettimana: -12.5, inGiocoOggi: 7 };
  const voci = vociRiquadro(b, '2026-10-30');
  assert.deepEqual(voci.map(([e]) => e), ['Saldo dal 30/10', 'Questa settimana', 'In gioco oggi']);
  assert.match(voci[0][1], /^\+4,50\s€$/);
  assert.match(voci[1][1], /12,50\s€$/);
  assert.match(voci[2][1], /^7,00\s€$/);
  assert.ok(!voci.some(([e, v]) => /stop|tetto|bankroll/i.test(`${e} ${v}`)));
  assert.equal(vociRiquadro({}, null)[0][0], 'Saldo');
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
  assert.deepEqual(valoriCampi(g, null), { quota: '2,1', puntata: '4,50', bookmaker: 'bet365' });
  assert.deepEqual(valoriCampi({ quota: null, puntata: { euro: 3 } }, null), { quota: '', puntata: '3,00', bookmaker: 'bet365' });
  // dopo "Quota reale non valida" o un errore di rete il ridisegno mostra ancora il testo scritto
  assert.deepEqual(valoriCampi(g, { quota: '1', puntata: '7', bookmaker: 'Snai' }), { quota: '1', puntata: '7', bookmaker: 'Snai' });
  assert.deepEqual(valoriCampi(g, { quota: '', puntata: '' }), { quota: '', puntata: '', bookmaker: 'bet365' });
});

test('etichetta stato: il motivo compare per ogni stato', () => {
  const m = 'controllo serale non eseguito';
  assert.equal(etichettaStato({ stato: 'in_attesa', motivoStato: m }).testo, `In attesa formazioni: ${m}`);
  assert.equal(etichettaStato({ stato: 'confermata', motivoStato: m }).testo, `Confermata: ${m}`);
  assert.equal(etichettaStato({ stato: 'in_revisione', motivoStato: m }).testo, `In revisione: ${m}`);
  assert.equal(etichettaStato({ stato: 'modificata', motivoStato: m }).testo, `Modificata: ${m}`);
  assert.equal(etichettaStato({ stato: 'annullata', motivoStato: m }).testo, `Annullata: ${m}`);
  assert.equal(etichettaStato({ stato: 'confermata', motivoStato: null }).testo, 'Confermata');
  assert.equal(etichettaStato({ stato: 'confermata', motivoStato: '' }).testo, 'Confermata');
});

import { testoRidotta, testoFissa, euro } from '../../site/app.js';

test('testoRidotta: riga "ridotta da …" per il tetto giornaliero, null se non ridotta (lo stop non esiste più)', () => {
  assert.equal(testoRidotta({ euro: 2.4, percentuale: 1.2, ridotta: { da: 5, motivo: 'tetto giornaliero' } }),
    `ridotta da ${euro(5)} per il tetto giornaliero`);
  assert.match(testoRidotta({ euro: 2.4, percentuale: 1.2, ridotta: { da: 5, motivo: 'tetto giornaliero' } }), /^ridotta da 5,00\s€ per il tetto giornaliero$/);
  assert.equal(testoRidotta({ euro: 1, percentuale: 0.5, ridotta: { da: 6, motivo: 'stop settimanale' } }), null);
  assert.equal(testoRidotta({ euro: 5, percentuale: 2.5 }), null);
  assert.equal(testoRidotta(undefined), null);
  assert.equal(testoRidotta({ euro: 2, ridotta: { da: 'x', motivo: 'tetto giornaliero' } }), null);
});

test('testoFissa: riga della puntata fissa da 1 € a giornata piena, null altrimenti', () => {
  assert.match(testoFissa({ euro: 1, percentuale: 0.5, fissa: { da: 5, motivo: 'giornata piena' } }),
    /^puntata fissa 1,00\s€ \(giornata piena: tetto giornaliero tolto per oggi\)$/);
  assert.equal(testoFissa({ euro: 2.4, percentuale: 1.2, ridotta: { da: 5, motivo: 'tetto giornaliero' } }), null);
  assert.equal(testoFissa({ euro: 5, percentuale: 2.5 }), null);
  assert.equal(testoFissa(undefined), null);
  assert.equal(testoFissa({ euro: 'x', fissa: { da: 5, motivo: 'giornata piena' } }), null);
});

test('A4 avviso del bankroll: giocata di prova segnata come fatta', () => {
  const a = testoAvvisi(dati({}, { avvisi: ['Giocata di PROVA x segnata come fatta: non conta nel bankroll'] }));
  assert.ok(a.includes('Giocata di PROVA x segnata come fatta: non conta nel bankroll'));
});

test('A3 bilancio dei pronostici sul sito: per partita e collegati', async () => {
  const { testoBilancioPronostici } = await import('../../site/app.js');
  const t = testoBilancioPronostici({ data: '2026-10-22', giusti: 3, chiusi: 4, aperti: 1, partite: { totale: 3, tutteGiuste: 1, conSbagliati: 1, aperte: 1 }, sbagliati: [] });
  assert.match(t, /22\/10: 3 giusti su 4 \(75%\)/);
  assert.match(t, /per partita: 1 su 2 tutti giusti, 1 con qualcuno sbagliato/);
  assert.match(t, /1 senza esito/);
  assert.equal(testoBilancioPronostici(null), null);
});

test('B1 pronostici sul sito: n della fascia accanto alla percentuale', async () => {
  const { testoProbPronostico } = await import('../../site/app.js');
  assert.match(testoProbPronostico({ prob: 0.82, n: 4000 }), /^82\s?% su 4\.000 partite$/);
  assert.doesNotMatch(testoProbPronostico({ prob: 0.82 }), /partite/);
});
