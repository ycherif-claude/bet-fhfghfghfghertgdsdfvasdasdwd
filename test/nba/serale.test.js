import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  orarioSerale, daAvviare, scaricaQuoteSerali, validaDecisioni, applicaSerale, segnaScaduto,
} from '../../src/nba/serale.js';
import { quotaMinima } from '../../src/regole/value.js';
import { costruisciDati } from '../../src/build/costruisci-sito.js';
import { isoRoma } from '../../src/calcio/testo.js';

const SERALE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'nba', 'serale.js');
const DATA = '2026-10-20';
const NBA1 = 'nba-2026-10-20-boston-celtics-new-york-knicks';
const NBA2 = 'nba-2026-10-20-los-angeles-lakers-golden-state-warriors';
const ID_A = `${NBA1}-vincente-boston-celtics`;
const ID_B = `${NBA2}-totale-punti-221-5-over-221-5`;
const ID_C = 'calcio-2026-10-20-inter-lecce-1x2-1';
const ADESSO = new Date('2026-10-20T19:30:00Z'); // 21:30 a Roma

function giocata(over = {}) {
  const g = {
    id: ID_A, sport: 'nba', competizione: 'NBA', partita: 'Boston Celtics - New York Knicks', idPartita: NBA1,
    inizio: '2026-10-21T01:30:00+02:00', tipo: 'singola', mercato: 'Vincente', selezione: 'Boston Celtics',
    prob: 0.61, quota: 1.8, fonteQuota: 'mediana di 7 bookmaker (SportsGameOdds)', oraQuota: '2026-10-20T07:40:00+02:00',
    quotaDaVerificare: false, ragionamento: ['riga'], probModello: 0.62, probPinnacle: 0.6, correzioneNotizie: null,
    value: 0.098, puntata: { euro: 4, percentuale: 2 }, stato: 'in_attesa', motivoStato: null, oraUltimoControllo: null, esito: null,
    ...over,
  };
  if (!('quotaMinima' in over)) g.quotaMinima = quotaMinima(g, g.tipo);
  return g;
}

const giocataB = (over = {}) => giocata({
  id: ID_B, idPartita: NBA2, partita: 'Los Angeles Lakers - Golden State Warriors', inizio: '2026-10-21T04:00:00+02:00',
  mercato: 'Totale punti 221.5', selezione: 'Over 221.5', prob: 0.55, quota: 1.95, probModello: 0.56, probPinnacle: 0.54, ...over,
});

const giocataC = (over = {}) => giocata({
  id: ID_C, sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Lecce', idPartita: 'calcio-2026-10-20-inter-lecce',
  inizio: '2026-10-20T20:45:00+02:00', mercato: '1X2', selezione: '1', prob: 0.58, quota: 1.95, probModello: 0.6, probPinnacle: 0.56, ...over,
});

const giornata = (giocate = [giocata(), giocataB(), giocataC()]) => ({
  data: DATA, generataAlle: '2026-10-20T08:04:00+02:00', giro: 'claude', notizieControllate: true,
  competizioniNonCoperte: [], candidati: [], giocate, scartate: [], erroriGiro: [],
});

const bk = (chiave, mercati) => ({ chiave, mercati });
const tre = (mercati) => ['fanduel', 'draftkings', 'betmgm'].map((k) => bk(k, mercati));
const eventoCK = () => ({
  id: 'ev1', casa: 'Boston Celtics', trasferta: 'New York Knicks', inizio: '2026-10-21T01:30:00+02:00',
  bookmaker: tre({ vincente: { casa: 1.65, trasferta: 2.3 }, handicap: { '-4.5': { casa: 1.91, trasferta: 1.91 } } }),
});
const eventoLW = () => ({
  id: 'ev2', casa: 'Los Angeles Lakers', trasferta: 'Golden State Warriors', inizio: '2026-10-21T04:00:00+02:00',
  bookmaker: tre({ totale: { '223.5': { over: 1.9, under: 1.9 } } }),
});
const eventoAltro = () => ({
  id: 'ev3', casa: 'Miami Heat', trasferta: 'Chicago Bulls', inizio: '2026-10-21T02:00:00+02:00',
  bookmaker: tre({ vincente: { casa: 1.5, trasferta: 2.6 } }),
});

const quoteFresche = (partite = [{ idPartita: NBA1, ...eventoCK() }, { idPartita: NBA2, ...eventoLW() }]) => ({
  data: DATA, scaricateAlle: '2026-10-20T21:20:00+02:00', erroriGiro: [], partite,
});

const decisione = (idGiocata, stato, extra = {}) => ({ idGiocata, stato, motivo: 'Tatum in dubbio', fonte: 'NBA injury report 21:00', ...extra });
const decisioni = (lista) => ({ controllateAlle: '2026-10-20T21:25:00+02:00', decisioni: lista });

function dirTemp({ g = giornata(), dec = null, quote = quoteFresche(), segnature = [], stato = null } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bet-serale-'));
  for (const s of ['raccolta', 'giornate', 'segnature']) fs.mkdirSync(path.join(d, s));
  if (g) fs.writeFileSync(path.join(d, 'giornate', `${DATA}.json`), `${JSON.stringify(g, null, 2)}\n`);
  if (dec) fs.writeFileSync(path.join(d, 'raccolta', `${DATA}-serale-nba.json`), JSON.stringify(dec));
  if (quote) fs.writeFileSync(path.join(d, 'raccolta', `${DATA}-serale-quote.json`), JSON.stringify(quote));
  if (stato) fs.writeFileSync(path.join(d, 'raccolta', `${DATA}-serale-stato.json`), JSON.stringify(stato));
  for (const s of segnature) fs.writeFileSync(path.join(d, 'segnature', `${s.idGiocata}.json`), JSON.stringify(s));
  return d;
}
const leggiGiornata = (d) => JSON.parse(fs.readFileSync(path.join(d, 'giornate', `${DATA}.json`), 'utf8'));
const testoGiornata = (d) => fs.readFileSync(path.join(d, 'giornate', `${DATA}.json`), 'utf8');
const vicino = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

// --- orario ---

test('orario: nessuna partita prima delle 22:30 → 22:00 di Roma', () => {
  assert.equal(orarioSerale(giornata(), DATA).toISOString(), '2026-10-20T20:00:00.000Z');
  // Partita alle 22:30 esatte: non è "prima" della soglia.
  const g = giornata([giocata({ inizio: '2026-10-20T22:30:00+02:00' })]);
  assert.equal(orarioSerale(g, DATA).toISOString(), '2026-10-20T20:00:00.000Z');
  // Ora solare (dopo il 25 ottobre): 22:00 di Roma = 21:00 UTC.
  const inverno = giornata([giocata({ inizio: '2026-11-03T01:30:00+01:00' })]);
  assert.equal(orarioSerale({ ...inverno, data: '2026-11-02' }, '2026-11-02').toISOString(), '2026-11-02T21:00:00.000Z');
});

test('orario: prima partita alle 19:00 di Roma → 18:00; alle 14:30 → 14:00', () => {
  const g19 = giornata([giocata(), giocataB({ inizio: '2026-10-20T19:00:00+02:00' })]);
  assert.equal(isoRoma(orarioSerale(g19, DATA)), '2026-10-20T18:00:00+02:00');
  const g1430 = giornata([giocata({ inizio: '2026-10-20T14:30:00+02:00' })]);
  assert.equal(isoRoma(orarioSerale(g1430, DATA)), '2026-10-20T14:00:00+02:00');
});

test('orario: null senza giocate NBA non annullate; conta la gamba NBA di una multipla', () => {
  assert.equal(orarioSerale(giornata([giocataC()]), DATA), null);
  assert.equal(orarioSerale(giornata([giocata({ stato: 'annullata' }), giocataC()]), DATA), null);
  const multipla = {
    ...giocataC({ id: `M-${ID_C}+${ID_A}`, tipo: 'multipla', mercato: 'Multipla', sport: 'calcio + nba' }),
    gambe: [giocataC(), giocata({ inizio: '2026-10-20T20:00:00+02:00' })],
  };
  assert.equal(isoRoma(orarioSerale(giornata([multipla]), DATA)), '2026-10-20T19:00:00+02:00');
});

test('daAvviare: alle 21:20 per le 22:00 → true; alle 20:20 → false; già avviato → false', () => {
  const g = giornata();
  assert.equal(daAvviare(g, DATA, new Date('2026-10-20T19:20:00Z'), null), true);
  assert.equal(daAvviare(g, DATA, new Date('2026-10-20T18:20:00Z'), null), false);
  assert.equal(daAvviare(g, DATA, new Date('2026-10-20T19:20:00Z'), { avviatoAlle: '2026-10-20T21:20:05+02:00' }), false);
  // Orario superato e non avviato: si avvia comunque.
  assert.equal(daAvviare(g, DATA, new Date('2026-10-20T21:20:00Z'), {}), true);
  // Senza giocate NBA: mai.
  assert.equal(daAvviare(giornata([giocataC()]), DATA, new Date('2026-10-20T21:20:00Z'), null), false);
});

// --- quote ---

test('scaricaQuoteSerali: una chiamata, solo le partite delle giocate NBA', async () => {
  const chiamate = [];
  const fonti = { sportsgameodds: { async eventi(f, o) { chiamate.push({ f, o }); return [eventoCK(), eventoLW(), eventoAltro()]; } } };
  const r = await scaricaQuoteSerali({ data: DATA, adesso: ADESSO, fonti, chiavi: { sportsgameodds: 'k' }, giornata: giornata() });
  assert.equal(chiamate.length, 1);
  assert.equal(chiamate[0].o.chiave, 'k');
  assert.deepEqual(r.partite.map((p) => p.idPartita), [NBA1, NBA2]);
  assert.equal(r.data, DATA);
  assert.equal(r.scaricateAlle, isoRoma(ADESSO));
  assert.deepEqual(r.erroriGiro, []);
  const a = r.giocate.find((x) => x.idGiocata === ID_A);
  assert.ok(a.consensoFresco > 0.58 && a.consensoFresco < 0.59);
  assert.equal(a.quotaFresca, 1.65);
  // Linea diversa da quella della giocata: niente consenso fresco.
  assert.equal(r.giocate.find((x) => x.idGiocata === ID_B).consensoFresco, null);
});

test('scaricaQuoteSerali: chiave mancante o fonte in errore → erroriGiro, partite vuote', async () => {
  const senza = await scaricaQuoteSerali({ data: DATA, adesso: ADESSO, fonti: {}, chiavi: {}, giornata: giornata() });
  assert.deepEqual(senza.partite, []);
  assert.match(senza.erroriGiro[0], /SPORTSGAMEODDS_API_KEY/);
  const fonti = { sportsgameodds: { async eventi() { throw new Error('HTTP 503'); } } };
  const r = await scaricaQuoteSerali({ data: DATA, adesso: ADESSO, fonti, chiavi: { sportsgameodds: 'k' }, giornata: giornata() });
  assert.deepEqual(r.erroriGiro, ['SportsGameOdds alle 21:30: HTTP 503']);
});

// --- decisioni ---

test('validaDecisioni: formato, delta solo con modificata, ±0,08', () => {
  const g = giornata();
  assert.deepEqual(validaDecisioni(decisioni([decisione(ID_A, 'confermata'), decisione(ID_B, 'annullata')]), g, ADESSO), []);
  assert.deepEqual(validaDecisioni(decisioni([decisione(ID_A, 'modificata', { delta: -0.08 }), decisione(ID_B, 'confermata')]), g, ADESSO), []);
  const err = (lista) => validaDecisioni(decisioni(lista), g, ADESSO).join('\n');
  assert.match(err([decisione(ID_A, 'confermata', { delta: 0.02 }), decisione(ID_B, 'confermata')]), /delta solo con "modificata"/);
  assert.match(err([decisione(ID_A, 'modificata', { delta: 0.09 }), decisione(ID_B, 'confermata')]), /oltre il massimo/);
  assert.match(err([decisione(ID_A, 'boh'), decisione(ID_B, 'confermata')]), /stato non valido/);
  assert.match(err([decisione(ID_A, 'confermata', { motivo: '' }), decisione(ID_B, 'confermata')]), /motivo mancante/);
  assert.match(err([decisione(ID_A, 'confermata', { fonte: ' ' }), decisione(ID_B, 'confermata')]), /fonte mancante/);
  assert.match(err([decisione(ID_A, 'confermata'), decisione(ID_A, 'annullata'), decisione(ID_B, 'confermata')]), /più di una decisione/);
  assert.match(err([decisione(ID_A, 'confermata'), decisione(ID_B, 'confermata'), decisione(ID_C, 'confermata')]), /non è una giocata NBA/);
  assert.match(err([decisione(ID_A, 'modificata', { delta: 0.37 }), decisione(ID_B, 'confermata')]), /oltre il massimo/);
  const alta = giornata([giocata({ probModello: 0.95 }), giocataB()]);
  assert.match(validaDecisioni(decisioni([decisione(ID_A, 'modificata', { delta: 0.05 }), decisione(ID_B, 'confermata')]), alta, ADESSO).join('\n'), /fuori dall'intervallo/);
  assert.match(validaDecisioni({ decisioni: [] }, g, ADESSO).join('\n'), /controllateAlle/);
  assert.match(validaDecisioni(null, g, ADESSO).join('\n'), /oggetto/);
});

test('decisione mancante per una giocata non iniziata → errore, niente scritto', () => {
  const d = dirTemp({ dec: decisioni([decisione(ID_A, 'confermata')]) });
  const prima = testoGiornata(d);
  assert.throws(() => applicaSerale({ dirData: d, adesso: ADESSO }), /manca la decisione per .*totale-punti/);
  assert.equal(testoGiornata(d), prima);
  // Da riga di comando: uscita 1, file invariato.
  const r = spawnSync(process.execPath, [SERALE, '--applica'], { cwd: d, encoding: 'utf8', env: { ...process.env, SERALE_ADESSO: ADESSO.toISOString(), SERALE_DIR_DATA: d } });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /manca la decisione/);
  assert.equal(testoGiornata(d), prima);
});

// --- applicazione ---

test('applicaSerale cambia solo stato, motivoStato, oraUltimoControllo (e prob/quotaMinima se modificata)', () => {
  const d = dirTemp({ dec: decisioni([decisione(ID_A, 'modificata', { delta: -0.04 }), decisione(ID_B, 'annullata', { motivo: 'LeBron fuori', fonte: 'Lakers PR' })]) });
  const prima = leggiGiornata(d);
  const r = applicaSerale({ dirData: d, adesso: ADESSO });
  assert.equal(r.cambiate, 2);
  const dopo = leggiGiornata(d);
  const ora = isoRoma(ADESSO);

  // A: modificata, prob = 0.5·(0.62 − 0.04) + 0.5·consenso fresco.
  const q = 1 / 1.65 + 1 / 2.3;
  const consenso = (1 / 1.65) / q;
  const prob = 0.5 * 0.58 + 0.5 * consenso;
  const a = dopo.giocate[0];
  vicino(a.prob, prob);
  assert.equal(a.quotaMinima, quotaMinima({ prob }, 'singola'));
  assert.deepEqual(
    { ...a, prob: undefined, quotaMinima: undefined },
    { ...prima.giocate[0], prob: undefined, quotaMinima: undefined, stato: 'modificata', motivoStato: 'Tatum in dubbio (NBA injury report 21:00)', oraUltimoControllo: ora },
  );
  // B: annullata, prob e quotaMinima invariate.
  assert.deepEqual(dopo.giocate[1], { ...prima.giocate[1], stato: 'annullata', motivoStato: 'LeBron fuori (Lakers PR)', oraUltimoControllo: ora });
  // Calcio e resto del file intatti.
  assert.deepEqual(dopo.giocate[2], prima.giocate[2]);
  assert.deepEqual({ ...dopo, giocate: null }, { ...prima, giocate: null });
  assert.ok(testoGiornata(d).endsWith('}\n'));
});

test('modificata senza la linea nelle quote fresche: consenso del mattino; pesoModello dalla raccolta NBA', () => {
  const d = dirTemp({ dec: decisioni([decisione(ID_A, 'confermata'), decisione(ID_B, 'modificata', { delta: 0.03 })]) });
  fs.writeFileSync(path.join(d, 'raccolta', `${DATA}-nba.json`), JSON.stringify({ data: DATA, partite: [{ idPartita: NBA2, pesoModello: 0.25, mercati: [] }] }));
  applicaSerale({ dirData: d, adesso: ADESSO });
  const b = leggiGiornata(d).giocate[1];
  const prob = 0.25 * 0.59 + 0.75 * 0.54;
  vicino(b.prob, prob);
  assert.equal(b.quotaMinima, quotaMinima({ prob }, 'singola'));
});

test('applicare due volte non cambia il file', () => {
  const d = dirTemp({ dec: decisioni([decisione(ID_A, 'modificata', { delta: 0.02 }), decisione(ID_B, 'confermata')]) });
  applicaSerale({ dirData: d, adesso: ADESSO });
  const una = testoGiornata(d);
  const r = applicaSerale({ dirData: d, adesso: new Date(ADESSO.getTime() + 10 * 60000) });
  assert.equal(r.cambiate, 0);
  assert.equal(testoGiornata(d), una);
});

test('giocata già segnata e modificata: prob e quotaMinima invariate, stato aggiornato', () => {
  const segnatura = { idGiocata: ID_A, fatta: true, quotaReale: 1.8, puntataReale: 4, ora: '2026-10-20T10:00:00+02:00' };
  const d = dirTemp({ dec: decisioni([decisione(ID_A, 'modificata', { delta: -0.05 }), decisione(ID_B, 'confermata')]), segnature: [segnatura] });
  const prima = leggiGiornata(d).giocate[0];
  applicaSerale({ dirData: d, adesso: ADESSO });
  const a = leggiGiornata(d).giocate[0];
  assert.equal(a.prob, prima.prob);
  assert.equal(a.quotaMinima, prima.quotaMinima);
  assert.equal(a.stato, 'modificata');
  assert.equal(a.motivoStato, 'Tatum in dubbio (NBA injury report 21:00)');
});

test('multipla con gamba NBA: solo lo stato, mai prob e quotaMinima; delta non ammesso', () => {
  const multipla = {
    ...giocataC({ id: `M-${ID_A}+${ID_B}`, tipo: 'multipla', mercato: 'Multipla', sport: 'nba', inizio: '2026-10-21T01:30:00+02:00', prob: 0.33, quotaMinima: 3.19 }),
    gambe: [giocata(), giocataB()],
  };
  const g = giornata([giocata(), giocataB(), multipla]);
  const lista = [decisione(ID_A, 'confermata'), decisione(ID_B, 'confermata')];
  assert.match(validaDecisioni(decisioni(lista), g, ADESSO).join('\n'), /manca la decisione per M-/);
  assert.match(validaDecisioni(decisioni([...lista, decisione(multipla.id, 'modificata', { delta: 0.01 })]), g, ADESSO).join('\n'), /multipla/);
  const d = dirTemp({ g, dec: decisioni([...lista, decisione(multipla.id, 'annullata')]) });
  applicaSerale({ dirData: d, adesso: ADESSO });
  const m = leggiGiornata(d).giocate[2];
  assert.equal(m.stato, 'annullata');
  assert.equal(m.prob, 0.33);
  assert.equal(m.quotaMinima, 3.19);
  assert.deepEqual(m.gambe, multipla.gambe);
});

test('partita iniziata: nessuna modifica', () => {
  const g = giornata([giocata({ inizio: '2026-10-20T21:00:00+02:00' }), giocataB()]);
  // Nessuna decisione richiesta per la giocata iniziata; quella data viene ignorata.
  assert.deepEqual(validaDecisioni(decisioni([decisione(ID_B, 'confermata')]), g, ADESSO), []);
  const d = dirTemp({ g, dec: decisioni([decisione(ID_A, 'annullata'), decisione(ID_B, 'confermata')]) });
  const prima = leggiGiornata(d);
  const r = applicaSerale({ dirData: d, adesso: ADESSO });
  assert.equal(r.cambiate, 1);
  const dopo = leggiGiornata(d);
  assert.deepEqual(dopo.giocate[0], prima.giocate[0]);
  assert.equal(dopo.giocate[1].stato, 'confermata');
});

test('prob non valida dopo la modifica → errore, niente scritto', () => {
  const g = giornata([giocata({ probModello: 'x', probPinnacle: null }), giocataB()]);
  const d = dirTemp({ g, quote: quoteFresche([]), dec: decisioni([decisione(ID_A, 'modificata'), decisione(ID_B, 'confermata')]) });
  const prima = testoGiornata(d);
  assert.throws(() => applicaSerale({ dirData: d, adesso: ADESSO }), /probabilità non valida/);
  assert.equal(testoGiornata(d), prima);
});

// --- scaduto ---

test('scaduto: motivoStato "controllo serale non eseguito" dopo 2 ore senza decisioni', () => {
  // Orario 18:00 (partita alle 19:00): alle 19:59 nulla, alle 20:00 sì.
  const g = giornata([giocata({ inizio: '2026-10-21T01:30:00+02:00' }), giocataB({ inizio: '2026-10-20T19:00:00+02:00' }), giocataC()]);
  const d = dirTemp({ g });
  assert.equal(segnaScaduto({ dirData: d, adesso: new Date('2026-10-20T17:59:00Z') }).cambiate, 0);
  const prima = leggiGiornata(d);
  const r = segnaScaduto({ dirData: d, adesso: new Date('2026-10-20T18:00:00Z') });
  assert.equal(r.cambiate, 1);
  const dopo = leggiGiornata(d);
  assert.deepEqual(dopo.giocate[0], { ...prima.giocate[0], motivoStato: 'controllo serale non eseguito' });
  assert.deepEqual(dopo.giocate[1], prima.giocate[1]); // già iniziata
  assert.deepEqual(dopo.giocate[2], prima.giocate[2]); // calcio
  assert.equal(dopo.giocate[0].stato, 'in_attesa');
  // Ripetuto: nessun cambiamento.
  assert.equal(segnaScaduto({ dirData: d, adesso: new Date('2026-10-20T19:00:00Z') }).cambiate, 0);
  // Con il file decisioni: nulla.
  const d2 = dirTemp({ g, dec: decisioni([]) });
  assert.equal(segnaScaduto({ dirData: d2, adesso: new Date('2026-10-20T18:00:00Z') }).cambiate, 0);
});

// --- CLI ---

test('CLI --quando stampa avvia/attendi, esce con 0 e non scrive', () => {
  const d = dirTemp();
  const prima = fs.readdirSync(path.join(d, 'raccolta')).sort();
  const esegui = (adesso) => spawnSync(process.execPath, [SERALE, '--quando'], { encoding: 'utf8', env: { ...process.env, SERALE_ADESSO: adesso, SERALE_DIR_DATA: d } });
  const r1 = esegui('2026-10-20T19:20:00Z');
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r1.stdout.trim(), 'avvia');
  const r2 = esegui('2026-10-20T18:20:00Z');
  assert.equal(r2.stdout.trim(), 'attendi');
  assert.deepEqual(fs.readdirSync(path.join(d, 'raccolta')).sort(), prima);
  const d2 = dirTemp({ stato: { avviatoAlle: '2026-10-20T21:20:00+02:00' } });
  const r3 = spawnSync(process.execPath, [SERALE, '--quando'], { encoding: 'utf8', env: { ...process.env, SERALE_ADESSO: '2026-10-20T19:20:00Z', SERALE_DIR_DATA: d2 } });
  assert.equal(r3.stdout.trim(), 'attendi');
});

// --- build ---

test('la build legge la giornata dopo il giro serale senza erroriDati', () => {
  const d = dirTemp({ dec: decisioni([decisione(ID_A, 'modificata', { delta: 0.03 }), decisione(ID_B, 'annullata')]) });
  applicaSerale({ dirData: d, adesso: ADESSO });
  const dati = costruisciDati(d, ADESSO);
  assert.deepEqual(dati.erroriDati, []);
  assert.equal(dati.oggi.giornata.giocate.length, 3);
  assert.equal(dati.oggi.giornata.giocate[0].stato, 'modificata');
});

// --- workflow ---

test('serale-nba.yml: orari, permessi, passi e secrets', () => {
  const t = fs.readFileSync('.github/workflows/serale-nba.yml', 'utf8');
  for (const s of [
    "cron: '20 11-23 * * *'", 'workflow_dispatch', 'contents: write', 'actions: write', 'group: dati', 'node-version: 24',
    'npm test', 'npm run serale-nba -- --scaduto', 'npm run serale-nba -- --quando', 'npm run serale-nba -- --quote',
    '-serale-stato.json', 'avviatoAlle', 'for tentativo in 1 2 3', 'git pull --rebase', 'git rebase --abort',
    'curl -fsS -X POST "$ROUTINE_SERALE_URL"', 'Authorization: Bearer $ROUTINE_SERALE_TOKEN',
    'anthropic-beta: experimental-cc-routine-2026-04-01', 'anthropic-version: 2023-06-01', 'Content-Type: application/json',
    'Giro serale NBA', 'gh workflow run pubblica.yml',
    '${{ secrets.SPORTSGAMEODDS_API_KEY }}', '${{ secrets.ROUTINE_SERALE_URL }}', '${{ secrets.ROUTINE_SERALE_TOKEN }}',
  ]) assert.ok(t.includes(s), s);
  assert.ok(!t.includes('set -x'));
  // Ordine: quote salvate, poi /fire, poi lo stato (solo dopo l'avvio riuscito).
  const quote = t.indexOf('salva "Quote serali NBA');
  const fire = t.indexOf('curl -fsS');
  const stato = t.indexOf('-serale-stato.json"');
  assert.ok(quote > 0 && quote < fire && fire < stato, 'quote → curl → stato');
  assert.match(t, /doppio avvio/);
  assert.ok(!/echo[^\n]*\$ROUTINE_SERALE_(URL|TOKEN)/.test(t));
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['serale-nba'], 'node src/nba/serale.js');
});

// --- giocate già annullate ---

test('giocata già annullata: niente decisione richiesta, decisione rifiutata, nessuna modifica', () => {
  const g = giornata([giocata({ stato: 'annullata', motivoStato: 'annullata a mano' }), giocataB(), giocataC()]);
  assert.deepEqual(validaDecisioni(decisioni([decisione(ID_B, 'confermata')]), g, ADESSO), []);
  assert.match(validaDecisioni(decisioni([decisione(ID_A, 'confermata'), decisione(ID_B, 'confermata')]), g, ADESSO).join(' | '), /già annullata/);
  const d = dirTemp({ g, dec: decisioni([decisione(ID_B, 'confermata')]) });
  const prima = leggiGiornata(d);
  assert.equal(applicaSerale({ dirData: d, adesso: ADESSO }).cambiate, 1);
  assert.deepEqual(leggiGiornata(d).giocate[0], prima.giocate[0]);
  // Scaduto: la giocata annullata resta com'è.
  const d2 = dirTemp({ g });
  segnaScaduto({ dirData: d2, adesso: new Date('2026-10-20T22:00:00Z') });
  const dopo = leggiGiornata(d2);
  assert.deepEqual(dopo.giocate[0], prima.giocate[0]);
  assert.equal(dopo.giocate[1].motivoStato, 'controllo serale non eseguito');
});

test('annullata dal giro serale: riapplicare le stesse decisioni non cambia il file', () => {
  const d = dirTemp({ dec: decisioni([decisione(ID_A, 'annullata'), decisione(ID_B, 'confermata')]) });
  applicaSerale({ dirData: d, adesso: ADESSO });
  const una = testoGiornata(d);
  assert.equal(applicaSerale({ dirData: d, adesso: new Date(ADESSO.getTime() + 60000) }).cambiate, 0);
  assert.equal(testoGiornata(d), una);
});

// --- correzione del mattino + serale ---

test('correzione del mattino più quella serale entro ±0,08 dal modello senza correzioni', () => {
  // Mattino +0,05 (modello grezzo 0,57 → 0,62).
  const mattino = { delta: 0.05, motivo: 'Brown rientra', fonte: 'Celtics PR' };
  const g = giornata([giocata({ correzioneNotizie: mattino }), giocataB()]);
  const err = (delta) => validaDecisioni(decisioni([decisione(ID_A, 'modificata', { delta }), decisione(ID_B, 'confermata')]), g, ADESSO).join(' | ');
  assert.match(err(0.04), /correzione del mattino 0.05 più quella serale 0.04 = 0.09: oltre il massimo/);
  assert.equal(err(0.03), '');
  assert.equal(err(-0.08), '');
  const d = dirTemp({ g, quote: quoteFresche([]), dec: decisioni([decisione(ID_A, 'modificata', { delta: -0.06 }), decisione(ID_B, 'confermata')]) });
  applicaSerale({ dirData: d, adesso: ADESSO });
  // Modello = 0,57 + 0,05 − 0,06 = 0,56; mercato = consenso del mattino 0,60.
  vicino(leggiGiornata(d).giocate[0].prob, 0.5 * 0.56 + 0.5 * 0.6);
});
