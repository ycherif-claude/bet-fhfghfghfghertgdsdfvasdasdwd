import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { esitoNba, aggiornaEsitiNba, aggiornaEsitiGiroNba } from '../../src/nba/esiti.js';

const r = (puntiCasa, puntiTrasferta) => ({ puntiCasa, puntiTrasferta, casa: 'Boston Celtics', trasferta: 'New York Knicks' });

test('esiti: Handicap -5 su 110-105 rimborsata, Totale 221.5 su 112-110 Over vinta, supplementari compresi', () => {
  assert.equal(esitoNba('Handicap -5', 'casa', r(110, 105)), 'rimborsata');
  assert.equal(esitoNba('Handicap -5', 'trasferta', r(110, 105)), 'rimborsata');
  assert.equal(esitoNba('Handicap -4.5', 'casa', r(110, 105)), 'vinta');
  assert.equal(esitoNba('Handicap -4.5', 'trasferta', r(110, 105)), 'persa');
  assert.equal(esitoNba('Handicap +3', 'casa', r(100, 105)), 'persa');
  assert.equal(esitoNba('Handicap 0', 'casa', r(100, 105)), 'persa');
  assert.equal(esitoNba('Totale punti 221.5', 'Over 221.5', r(112, 110)), 'vinta');
  assert.equal(esitoNba('Totale punti 221.5', 'Under 221.5', r(112, 110)), 'persa');
  assert.equal(esitoNba('Totale punti 222', 'Over 222', r(112, 110)), 'rimborsata');
  assert.equal(esitoNba('Totale punti 221.5', 'Over 220.5', r(112, 110)), null);
});

test('esiti: Vincente per nome completo e dati mancanti', () => {
  assert.equal(esitoNba('Vincente', 'Boston Celtics', r(110, 105)), 'vinta');
  assert.equal(esitoNba('Vincente', 'New York Knicks', r(110, 105)), 'persa');
  assert.equal(esitoNba('Vincente', 'Miami Heat', r(110, 105)), null);
  assert.equal(esitoNba('Vincente', 'Boston Celtics', r(null, 105)), null);
  assert.equal(esitoNba('Altro', 'x', r(1, 2)), null);
});

const adesso = new Date('2026-10-22T05:07:00Z');
const gamba = (mercato, selezione, extra = {}) => ({
  sport: 'nba', competizione: 'NBA', partita: 'Boston Celtics - New York Knicks', idPartita: 'nba-x',
  inizio: '2026-10-21T01:30:00+02:00', mercato, selezione, ...extra,
});
const finita = (extra = {}) => ({
  id: 1, dataUsa: '2026-10-20', inizio: '2026-10-21T01:30:00+02:00', casa: 'Boston Celtics', trasferta: 'New York Knicks',
  puntiCasa: 110, puntiTrasferta: 105, finita: true, stagione: 2026, postseason: false, ...extra,
});
function dir(giocate) {
  const d = mkdtempSync(join(tmpdir(), 'es-'));
  writeFileSync(join(d, '2026-10-20.json'), JSON.stringify({ data: '2026-10-20', giocate }, null, 2));
  return d;
}
const leggi = (d) => JSON.parse(readFileSync(join(d, '2026-10-20.json'), 'utf8')).giocate;

test('esiti: abbinamento con il giorno di New York, non quello di Roma', () => {
  // Inizio 01:30 di Roma del 21/10 = 19:30 del 20/10 a New York.
  const d = dir([{ id: 'g1', ...gamba('Handicap -4.5', 'casa'), esito: null }]);
  const sbagliata = aggiornaEsitiNba(d, [finita({ dataUsa: '2026-10-21' })], adesso);
  assert.equal(sbagliata.aggiornate, 0);
  const out = aggiornaEsitiNba(d, [finita()], adesso);
  assert.equal(out.aggiornate, 1);
  assert.equal(leggi(d)[0].esito, 'vinta');
  assert.equal(out.file.length, 1);
});

test('esiti: chiude anche le annullate; salta chiuse, calcio, multipla mista e partite da meno di 4 ore; cambia solo esito', () => {
  const calcio = { id: 'c', sport: 'calcio', partita: 'A - B', inizio: '2026-10-19T20:00:00+02:00', mercato: '1X2', selezione: '1', esito: null };
  const fresca = { id: 'f', ...gamba('Vincente', 'Boston Celtics', { inizio: '2026-10-21T22:00:00Z' }), esito: null };
  const giocate = [
    { id: 'a', ...gamba('Vincente', 'Boston Celtics'), esito: null, stato: 'annullata' },
    { id: 'b', ...gamba('Vincente', 'Boston Celtics'), esito: 'persa' },
    calcio,
    { id: 'm', sport: 'calcio + nba', tipo: 'multipla', esito: null, gambe: [calcio, gamba('Vincente', 'Boston Celtics')] },
    fresca,
    { id: 'ok', ...gamba('Totale punti 221.5', 'Under 221.5'), extra: 7, esito: null },
  ];
  const d = dir(giocate);
  const out = aggiornaEsitiNba(d, [finita()], new Date('2026-10-22T00:00:00Z'));
  assert.equal(out.aggiornate, 2);
  const dopo = leggi(d);
  assert.deepEqual(dopo.map((g) => g.esito), ['vinta', 'persa', null, null, null, 'vinta']);
  assert.equal(dopo[0].stato, 'annullata');
  assert.equal(dopo[5].extra, 7);
});

test('esiti: multipla di sole gambe NBA, si chiude con tutte le gambe', () => {
  const g2 = gamba('Totale punti 221.5', 'Over 221.5', { partita: 'Miami Heat - Chicago Bulls', idPartita: 'nba-y' });
  const d = dir([{ id: 'm', sport: 'nba', tipo: 'multipla', esito: null, gambe: [gamba('Vincente', 'Boston Celtics'), g2] }]);
  assert.equal(aggiornaEsitiNba(d, [finita()], adesso).aggiornate, 0);
  const heat = finita({ id: 2, casa: 'Miami Heat', trasferta: 'Chicago Bulls', puntiCasa: 100, puntiTrasferta: 100 });
  assert.equal(aggiornaEsitiNba(d, [finita(), heat], adesso).aggiornate, 1);
  assert.equal(leggi(d)[0].esito, 'persa');
});

test('esiti: avviso dopo 7 giorni senza esito', () => {
  const d = dir([{ id: 'vecchia', ...gamba('Vincente', 'Boston Celtics'), esito: null }]);
  const out = aggiornaEsitiNba(d, [], new Date('2026-10-28T05:00:00Z'));
  assert.deepEqual(out.errori, ['Giocata vecchia senza esito da 7 giorni']);
});

test('esiti: passo della CLI scarica le date e registra gli errori della fonte', async () => {
  const d = dir([{ id: 'g1', ...gamba('Handicap -4.5', 'casa'), esito: null }]);
  let filtri;
  const raccolta = { erroriGiro: [] };
  const fonti = { balldontlie: { partite: async (f) => { filtri = f; return [finita()]; } } };
  const out = await aggiornaEsitiGiroNba({ dirData: d, adesso, fonti, chiavi: { balldontlie: 'B' }, raccolta });
  assert.deepEqual(filtri, { date: ['2026-10-20'] });
  assert.equal(out.aggiornate, 1);
  const d2 = dir([{ id: 'g2', ...gamba('Handicap -4.5', 'casa'), esito: null }]);
  const giu = { balldontlie: { partite: async () => { throw new Error('HTTP 429'); } } };
  await aggiornaEsitiGiroNba({ dirData: d2, adesso, fonti: giu, chiavi: { balldontlie: 'B' }, raccolta });
  assert.deepEqual(raccolta.erroriGiro, ['balldontlie (esiti) alle 07:07: HTTP 429']);
});

// Multipla mista calcio + NBA: ogni modulo scrive l'esito delle proprie gambe.
const gCalcio = (extra = {}) => ({
  sport: 'calcio', competizione: 'Serie A', partita: 'Inter Milan - Monza', idPartita: 'calcio-x',
  inizio: '2026-10-20T20:45:00+02:00', mercato: '1X2', selezione: '1', ...extra,
});
const mista = (extra = {}) => ({ id: 'mx', sport: 'calcio + nba', tipo: 'multipla', esito: null, gambe: [gCalcio(), gamba('Vincente', 'Boston Celtics')], ...extra });

test('mista: gamba NBA vinta e calcio aperto → multipla aperta, esito scritto sulla gamba', () => {
  const d = dir([mista()]);
  const out = aggiornaEsitiNba(d, [finita()], adesso);
  const g = leggi(d)[0];
  assert.equal(g.gambe[1].esito, 'vinta');
  assert.equal(g.gambe[0].esito, undefined);
  assert.equal(g.esito, null);
  assert.equal(out.aggiornate, 0);
  assert.equal(out.file.length, 1);
});

test('mista: calcio già vinto → il passo NBA chiude la multipla vinta', () => {
  const d = dir([mista({ gambe: [gCalcio({ esito: 'vinta' }), gamba('Vincente', 'Boston Celtics')] })]);
  assert.equal(aggiornaEsitiNba(d, [finita()], adesso).aggiornate, 1);
  assert.equal(leggi(d)[0].esito, 'vinta');
});

test('mista: gamba NBA persa → multipla persa subito, anche con il calcio aperto', () => {
  const d = dir([mista({ gambe: [gCalcio(), gamba('Vincente', 'New York Knicks')] })]);
  aggiornaEsitiNba(d, [finita()], adesso);
  const g = leggi(d)[0];
  assert.equal(g.esito, 'persa');
  assert.equal(g.gambe[1].esito, 'persa');
});

test('mista: avviso dopo 7 giorni se la gamba NBA resta senza esito', () => {
  const d = dir([mista()]);
  const out = aggiornaEsitiNba(d, [], new Date('2026-10-28T05:00:00Z'));
  assert.deepEqual(out.errori, ['Giocata mx senza esito da 7 giorni']);
});

test('passo della CLI: giornata illeggibile in erroriGiro anche senza giocate in attesa', async () => {
  const d = mkdtempSync(join(tmpdir(), 'es-'));
  writeFileSync(join(d, '2026-10-19.json'), '{ rotto');
  const raccolta = { erroriGiro: [] };
  await aggiornaEsitiGiroNba({ dirData: d, adesso, fonti: {}, chiavi: {}, raccolta });
  assert.equal(raccolta.erroriGiro.length, 1);
  assert.match(raccolta.erroriGiro[0], /^Esiti NBA alle 07:07: 2026-10-19\.json: file non leggibile/);
});

// Cartella dati completa (giornate + segnature) per l'avviso sulle annullate.
function dati(giocate, segnature = []) {
  const root = mkdtempSync(join(tmpdir(), 'es-dati-'));
  mkdirSync(join(root, 'giornate'));
  mkdirSync(join(root, 'segnature'));
  writeFileSync(join(root, 'giornate', '2026-10-20.json'), JSON.stringify({ data: '2026-10-20', giocate }, null, 2));
  for (const s of segnature) writeFileSync(join(root, 'segnature', `${s.idGiocata}.json`), JSON.stringify(s));
  return join(root, 'giornate');
}
const sig = (idGiocata, fatta, ora = '2026-10-20T18:00:00+02:00') => ({ idGiocata, fatta, quotaReale: 1.8, puntataReale: 4, ora });

test('esiti: avviso dei 7 giorni sulle annullate solo se segnate come giocate (ultima segnatura)', () => {
  const a = (id) => ({ id, ...gamba('Vincente', 'Boston Celtics'), esito: null, stato: 'annullata' });
  const d = dati([a('libera'), a('giocata'), a('saltata'), a('ripensata')], [
    sig('giocata', true),
    sig('saltata', false),
    sig('ripensata', true, '2026-10-20T18:00:00+02:00'), sig('ripensata', false, '2026-10-20T19:00:00+02:00'),
  ]);
  const out = aggiornaEsitiNba(d, [], new Date('2026-10-28T05:00:00Z'));
  assert.deepEqual(out.errori, ['Giocata giocata senza esito da 7 giorni']);
});

test('esiti: multipla mista annullata, gamba NBA chiusa comunque', () => {
  const d = dir([mista({ stato: 'annullata', gambe: [gCalcio(), gamba('Vincente', 'New York Knicks')] })]);
  aggiornaEsitiNba(d, [finita()], adesso);
  assert.equal(leggi(d)[0].esito, 'persa');
});

const AVVISO_RIMBORSATA = (id) => `Multipla ${id} con gamba rimborsata: bet365 paga una quota ridotta, controlla l'importo`;

test('esiti: multipla NBA vinta con una gamba rimborsata → esito vinta e avviso; mista chiusa dal passo NBA anche', () => {
  const d = dir([
    { id: 'm', sport: 'nba', tipo: 'multipla', esito: null, gambe: [gamba('Vincente', 'Boston Celtics'), gamba('Handicap -5', 'casa')] },
    { id: 'n', sport: 'nba', tipo: 'multipla', esito: null, gambe: [gamba('Vincente', 'Boston Celtics'), gamba('Handicap -4.5', 'casa')] },
    mista({ gambe: [gCalcio({ esito: 'rimborsata' }), gamba('Vincente', 'Boston Celtics')] }),
  ]);
  const out = aggiornaEsitiNba(d, [finita()], adesso);
  assert.deepEqual(leggi(d).map((g) => g.esito), ['vinta', 'vinta', 'vinta']);
  assert.deepEqual(out.errori, [AVVISO_RIMBORSATA('m'), AVVISO_RIMBORSATA('mx')]);
});
