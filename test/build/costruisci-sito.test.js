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
