// Idea 5 [utente, 22/10/2026]: numeri pronti per la revisione del lunedì, dal registro dei pronostici
// (istantanee data/registro/<data>-pronostici.json, o il file della giornata se manca).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bilancioPronosticiPeriodo } from '../../src/registro/bilancio-pronostici.js';
import { righeIstantanea } from '../../src/regole/pronostici.js';

const riga = (idPartita, selezione, esito, extra = {}) => ({
  idPartita, sport: 'calcio', competizione: 'Serie A', partita: `${idPartita} - X`, inizio: '2026-10-20T18:00:00Z',
  mercato: '1X2', selezione, testo: selezione, prob: 0.85, probModello: 0.86, n: 500, limite: 0.82, quotaMinima: 1.18, esito, ...extra,
});
const gamba = (idPartita, esito, quota = 1.25) => ({ idPartita, mercato: '1X2', selezione: '1', partita: `${idPartita} - X`, quota, quotaDaVerificare: true, esito });

function cartella() {
  const d = mkdtempSync(join(tmpdir(), 'bet-bilancio-'));
  for (const s of ['registro', 'giornate']) mkdirSync(join(d, s));
  // 20/10: istantanea. Partita a: migliore giusto + altro sbagliato; b: migliore ✅ giusto; c: aperta.
  writeFileSync(join(d, 'registro', '2026-10-20-pronostici.json'), JSON.stringify({ data: '2026-10-20', pronostici: [
    riga('a', '1', 'vinta', { migliore: true }), riga('a', '1X', 'persa', { migliore: false, prob: 0.9, limite: 0.88 }),
    riga('b', '1', 'vinta', { migliore: true, giocabile: true, quota: 1.3 }),
    riga('c', '1', null, { migliore: true }),
  ], schedine: [
    { id: 's1', tipo: 'doppia', quota: 1.56, esito: 'vinta', quotaFinale: 1.56, quotaDaVerificare: true, gambe: [gamba('a', 'vinta'), gamba('b', 'vinta')] },
    { id: 's2', tipo: 'tripla', quota: 1.9, esito: 'persa', quotaFinale: 0, quotaDaVerificare: true, gambe: [gamba('d', 'persa'), gamba('e', 'vinta'), gamba('f', 'vinta', 1.22)] },
  ] }));
  // 21/10: solo la giornata (niente istantanea), con una schedina salvata ancora aperta ma con una gamba
  // sbagliata: l'esito si ricalcola dalle gambe (persa).
  writeFileSync(join(d, 'giornate', '2026-10-21.json'), JSON.stringify({ data: '2026-10-21', giocate: [], pronostici: [
    { idPartita: 'g', sport: 'calcio', competizione: 'Serie A', partita: 'G - H', inizio: '2026-10-21T18:00:00Z', pronostici: [
      { mercato: '1X2', selezione: '1', testo: 'Vince G', prob: 0.8, limite: 0.8, n: 500, quotaMinima: 1.25, esito: 'persa', migliore: true, giocabile: true, quota: 1.4 },
    ] },
  ], schedinePronostici: [{ id: 's3', tipo: 'doppia', quota: 1.6, esito: null, quotaFinale: null, gambe: [gamba('g', 'persa'), gamba('h', null)] }] }));
  // Fuori periodo.
  writeFileSync(join(d, 'registro', '2026-10-25-pronostici.json'), JSON.stringify({ data: '2026-10-25', pronostici: [riga('z', '1', 'vinta', { migliore: true })] }));
  return d;
}

test('bilancio del periodo: tutti, migliori, ✅, per partita e doppie/triple', () => {
  const b = bilancioPronosticiPeriodo(cartella(), '2026-10-19', '2026-10-24');
  assert.deepEqual(b.giornate, ['2026-10-20', '2026-10-21']);
  assert.equal(b.tutti.pronostici, 5);
  assert.equal(b.tutti.giusti, 2);
  assert.equal(b.tutti.sbagliati, 2);
  assert.equal(b.tutti.aperti, 1);
  assert.equal(b.tutti.percentuale, 0.5);
  // Promessa: media delle probabilità (e dei limiti prudenti) dei chiusi.
  assert.ok(Math.abs(b.tutti.promessa - (0.85 + 0.9 + 0.85 + 0.8) / 4) < 1e-9);
  assert.ok(Math.abs(b.tutti.promessaPrudente - (0.82 + 0.88 + 0.82 + 0.8) / 4) < 1e-9);
  assert.deepEqual([b.migliori.pronostici, b.migliori.giusti, b.migliori.sbagliati, b.migliori.aperti], [4, 2, 1, 1]);
  assert.deepEqual([b.giocabili.pronostici, b.giocabili.giusti, b.giocabili.sbagliati], [2, 1, 1]);
  assert.deepEqual(b.perPartita, { partite: 4, tutteGiuste: 1, conSbagliati: 2, aperte: 1 });
  const s = b.schedine;
  assert.deepEqual([s.totale, s.vinte, s.perse, s.rimborsate, s.aperte], [3, 1, 2, 0, 0]);
  // 1 € a schedina: +0,56, −1 e −1 → −1,44 su 3 chiuse.
  assert.ok(Math.abs(s.profitto - -1.44) < 1e-9);
  assert.ok(Math.abs(s.rendimento - -0.48) < 1e-9);
  assert.equal(s.perTipo.doppia.vinte, 1);
  assert.equal(s.perTipo.doppia.perse, 1);
  assert.equal(s.perTipo.tripla.perse, 1);
});

test('istantanea: salva anche giocabile (solo se ✅) e la quota del mattino', () => {
  const p = { idPartita: 'x', sport: 'calcio', competizione: 'Serie A', partita: 'A - B', inizio: '2026-10-25T18:00:00Z', pronostici: [
    { mercato: '1X2', selezione: '1', prob: 0.85, quotaMinima: 1.18, quota: 1.3, giocabile: true, migliore: true },
    { mercato: '1X2', selezione: 'X2', prob: 0.85, quotaMinima: 1.18, quota: null, giocabile: false, migliore: false },
  ] };
  const [a, b] = righeIstantanea([p]);
  assert.equal(a.giocabile, true);
  assert.equal(a.quota, 1.3);
  assert.ok(!('giocabile' in b) && !('quota' in b));
});

test('npm run bilancio-pronostici: JSON sullo standard output; date sbagliate → uso ed errore', () => {
  const d = cartella();
  const r = spawnSync(process.execPath, ['src/registro/bilancio-pronostici.js', '2026-10-19', '2026-10-24'], { encoding: 'utf8', env: { ...process.env, BET_DIR_DATA: d } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).tutti.pronostici, 5);
  const male = spawnSync(process.execPath, ['src/registro/bilancio-pronostici.js', 'ieri'], { encoding: 'utf8' });
  assert.equal(male.status, 1);
  assert.match(male.stderr, /Uso: npm run bilancio-pronostici -- <da> <a>/);
  assert.match(JSON.parse(readFileSync('package.json', 'utf8')).scripts['bilancio-pronostici'], /bilancio-pronostici\.js/);
});

test('la revisione del lunedì legge i numeri dei pronostici già pronti', () => {
  const t = readFileSync('docs/routine/revisione-settimanale.md', 'utf8');
  for (const s of ['npm run bilancio-pronostici --', 'Pronostici ✅', 'Migliori e tutti', 'Per partita', 'Doppie e triple', 'percentuale promessa']) assert.ok(t.includes(s), s);
});
