import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { costruisciDati } from '../../src/build/costruisci-sito.js';

function dirTemp(giornate = [], segnature = []) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bet-'));
  fs.mkdirSync(path.join(d, 'giornate'));
  fs.mkdirSync(path.join(d, 'segnature'));
  fs.writeFileSync(path.join(d, 'giornate', '.gitkeep'), '');
  for (const g of giornate) fs.writeFileSync(path.join(d, 'giornate', `${g.data}.json`), JSON.stringify(g));
  for (const s of segnature) fs.writeFileSync(path.join(d, 'segnature', `${s.idGiocata}.json`), JSON.stringify(s));
  return d;
}
const cand = (id, extra = {}) => ({ id, sport: 'calcio', competizione: 'Serie A', partita: 'A-B', idPartita: 'p' + id,
  inizio: '2026-10-19T20:45:00+02:00', tipo: 'singola', mercato: '1X2', selezione: 'A', prob: 0.55, quota: 2.0,
  fonteQuota: 'x', oraQuota: null, quotaDaVerificare: false, ragionamento: ['ok'], ...extra });
const giocata = (id, inizio, esito, extra = {}) => ({ ...cand(id, { inizio }), tipo: 'singola', value: 0.1, quotaMinima: 1.9,
  puntata: { euro: 10, percentuale: 5 }, stato: 'confermata', motivoStato: null, oraUltimoControllo: null, esito, ...extra });

test('costruisciDati con cartella temporanea: oggi.disponibile false se manca il file di oggi', () => {
  const d = dirTemp([{ data: '2026-10-18', candidati: [], giocate: [] }]);
  const r = costruisciDati(d, new Date('2026-10-19T10:00:00Z'));
  assert.equal(r.oggi.data, '2026-10-19');
  assert.equal(r.oggi.disponibile, false);
  assert.equal(r.oggi.giornata, null);
  assert.equal(r.bankroll.bankroll, 200);
});

test('prima delle 08:00 oggi punta al giorno prima', () => {
  const d = dirTemp([{ data: '2026-10-18', candidati: [], giocate: [] }]);
  const r = costruisciDati(d, new Date('2026-10-19T04:00:00Z')); // 06:00 Roma
  assert.equal(r.oggi.data, '2026-10-18');
  assert.equal(r.oggi.disponibile, true);
});

test('costruisciDati: se la giornata non ha "giocate", applica selezionaGiocate ai candidati con lo stato bankroll corrente', () => {
  const d = dirTemp([{ data: '2026-10-19', candidati: [cand('c1'), cand('c2', { quota: 9 })] }]);
  const prima = fs.readFileSync(path.join(d, 'giornate', '2026-10-19.json'), 'utf8');
  const r = costruisciDati(d, new Date('2026-10-19T10:00:00Z'));
  assert.equal(r.oggi.disponibile, true);
  assert.deepEqual(r.oggi.giornata.giocate.map((g) => g.id), ['c1']);
  assert.deepEqual(r.oggi.giornata.scartate, [{ idCandidato: 'c2', motivo: 'quota fuori range' }]);
  assert.equal(fs.readFileSync(path.join(d, 'giornate', '2026-10-19.json'), 'utf8'), prima);
});

test('andamento: un punto per giorno con giocate chiuse', () => {
  const g1 = giocata('a', '2026-10-13T20:00:00+02:00', 'vinta');
  const g2 = giocata('b', '2026-10-13T21:00:00+02:00', 'persa');
  const g3 = giocata('c', '2026-10-14T20:00:00+02:00', 'vinta');
  const g4 = giocata('d', '2026-10-15T20:00:00+02:00', null);
  const d = dirTemp(
    [{ data: '2026-10-13', candidati: [], giocate: [g1, g2] }, { data: '2026-10-14', candidati: [], giocate: [g3, g4] }],
    ['a', 'b', 'c', 'd'].map((id) => ({ idGiocata: id, fatta: true, quotaReale: 2, puntataReale: 10, ora: '2026-10-13T09:00:00+02:00' })));
  const r = costruisciDati(d, new Date('2026-10-20T10:00:00Z'));
  assert.deepEqual(r.storico.andamento, [
    { data: '2026-10-13', bankroll: 200 },
    { data: '2026-10-14', bankroll: 210 },
  ]);
  assert.equal(r.storico.righe.length, 4);
  assert.equal(r.storico.righe[0].giocata.id, 'd');
  assert.equal(r.segnature.length, 4);
  assert.equal(r.storico.riepiloghi.fatte.sport[0].n, 3);
});

test('build: stop settimanale tolto, con la settimana a −45 le puntate di oggi non si fermano a 5 €', () => {
  const persa = giocata('p', '2026-10-19T09:00:00+02:00', 'persa');
  const cands = Array.from({ length: 6 }, (_, i) => cand(`k${i}`, { prob: 0.56 + i * 0.01, quota: 1.92 }));
  const d = dirTemp(
    [{ data: '2026-10-19', candidati: [], giocate: [persa] }, { data: '2026-10-20', candidati: cands }],
    [{ idGiocata: 'p', fatta: true, quotaReale: 2, puntataReale: 45, ora: '2026-10-19T09:00:00+02:00' }]);
  const r = costruisciDati(d, new Date('2026-10-20T10:00:00Z'));
  const somma = r.oggi.giornata.giocate.reduce((a, g) => a + g.puntata.euro, 0);
  assert.ok(r.oggi.giornata.giocate.length >= 6);
  assert.ok(somma > 5, `somma ${somma}`);
  assert.ok(!r.oggi.giornata.scartate.some((s) => /stop/.test(s.motivo)));
  assert.ok(!('stopRaggiunto' in r.bankroll) && !('distanzaStop' in r.bankroll));
});

const errori = (r) => r.erroriDati.map((e) => `${e.file}: ${e.errore}`);

test('dati validi: erroriDati vuoto', () => {
  const d = dirTemp([{ data: '2026-10-18', candidati: [], giocate: [giocata('a', '2026-10-18T20:00:00+02:00', null)] }],
    [{ idGiocata: 'a', fatta: true, quotaReale: 2, puntataReale: 5, ora: '2026-10-18T19:00:00+02:00' }]);
  assert.deepEqual(costruisciDati(d, new Date('2026-10-19T10:00:00Z')).erroriDati, []);
});

test('file JSON non valido: build non fallisce, errore con nome del file', () => {
  const d = dirTemp([{ data: '2026-10-19', candidati: [cand('c1')] }]);
  fs.writeFileSync(path.join(d, 'giornate', '2026-10-17.json'), '{ rotto');
  fs.writeFileSync(path.join(d, 'segnature', 'x.json'), 'nope');
  const r = costruisciDati(d, new Date('2026-10-19T10:00:00Z'));
  assert.equal(r.oggi.disponibile, true);
  assert.equal(r.erroriDati.length, 2);
  assert.equal(r.erroriDati[0].file, 'giornate/2026-10-17.json');
  assert.match(r.erroriDati[0].errore, /^JSON non valido/);
  assert.equal(r.erroriDati[1].file, 'segnature/x.json');
});

test('giocata con inizio o prob non validi: saltata e segnalata', () => {
  const buona = giocata('a', '2026-10-18T20:00:00+02:00', null);
  const data = giocata('b', 'domani sera', null);
  const prob = giocata('c', '2026-10-18T20:00:00+02:00', null, { prob: 1.2 });
  const d = dirTemp([{ data: '2026-10-18', candidati: [], giocate: [buona, data, prob] }],
    [{ idGiocata: 'b', fatta: true, quotaReale: 2, puntataReale: 5, ora: '2026-10-18T19:00:00+02:00' }]);
  const r = costruisciDati(d, new Date('2026-10-19T10:00:00Z'));
  assert.deepEqual(r.storico.righe.map((x) => x.giocata.id), ['a']);
  assert.ok(errori(r).includes('giornate/2026-10-18.json: giocata b: inizio non valido'));
  assert.ok(errori(r).includes('giornate/2026-10-18.json: giocata c: probabilità non valida'));
  assert.ok(errori(r).includes('segnature/b.json: Segnatura senza giocata: b'));
});

test('segnatura fatta con puntata o quota non valide: saltata e segnalata', () => {
  const gs = ['a', 'b', 'c'].map((id) => giocata(id, '2026-10-18T20:00:00+02:00', 'persa'));
  const d = dirTemp([{ data: '2026-10-18', candidati: [], giocate: gs }], [
    { idGiocata: 'a', fatta: true, quotaReale: 2, puntataReale: 0, ora: '2026-10-18T19:00:00+02:00' },
    { idGiocata: 'b', fatta: true, quotaReale: 1, puntataReale: 5, ora: '2026-10-18T19:00:00+02:00' },
    { idGiocata: 'c', fatta: true, quotaReale: 2, puntataReale: 'cinque', ora: '2026-10-18T19:00:00+02:00' },
  ]);
  const r = costruisciDati(d, new Date('2026-10-19T10:00:00Z'));
  assert.equal(r.bankroll.bankroll, 200);
  assert.equal(r.segnature.length, 0);
  assert.ok(errori(r).includes('segnature/a.json: puntata reale non valida'));
  assert.ok(errori(r).includes('segnature/b.json: quota reale non valida'));
  assert.ok(errori(r).includes('segnature/c.json: puntata reale non valida'));
});

test('giornata passata senza giocate: errore visibile, le puntate segnate non spariscono in silenzio', () => {
  const d = dirTemp([{ data: '2026-10-18', candidati: [cand('c1', { inizio: '2026-10-18T20:00:00+02:00' })] }],
    [{ idGiocata: 'c1', fatta: true, quotaReale: 2, puntataReale: 5, ora: '2026-10-18T19:00:00+02:00' }]);
  const r = costruisciDati(d, new Date('2026-10-19T10:00:00Z'));
  assert.ok(errori(r).includes('giornate/2026-10-18.json: Giornata 2026-10-18 senza giocate: il giro del mattino deve scriverle'));
  assert.ok(errori(r).includes('segnature/c1.json: Segnatura senza giocata: c1'));
});

test('candidato di oggi con prob non valida: scartato con motivo "dati non validi"', () => {
  const d = dirTemp([{ data: '2026-10-19', candidati: [cand('c1'), cand('c2', { prob: 0 }), cand('c3', { prob: 1, quota: null })] }]);
  const r = costruisciDati(d, new Date('2026-10-19T10:00:00Z'));
  assert.deepEqual(r.oggi.giornata.giocate.map((g) => g.id), ['c1']);
  assert.deepEqual(r.oggi.giornata.scartate, [
    { idCandidato: 'c2', motivo: 'dati non validi' }, { idCandidato: 'c3', motivo: 'dati non validi' }]);
});

test('multipla mista con esito nelle gambe: nessun erroriDati', () => {
  const m = { ...giocata('mm', '2026-10-18T20:00:00+02:00', 'vinta'), sport: 'calcio + nba', tipo: 'multipla',
    gambe: [{ sport: 'calcio', esito: 'vinta', inizio: '2026-10-18T18:00:00+02:00' }, { sport: 'nba', esito: 'vinta', inizio: '2026-10-18T20:00:00+02:00' }] };
  const d = dirTemp([{ data: '2026-10-18', candidati: [], giocate: [m] }],
    [{ idGiocata: 'mm', fatta: true, quotaReale: 2, puntataReale: 5, ora: '2026-10-18T19:00:00+02:00' }]);
  assert.deepEqual(costruisciDati(d, new Date('2026-10-19T10:00:00Z')).erroriDati, []);
});
