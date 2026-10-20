import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validaNotizie, applicaCorrezioni } from '../../src/giro/notizie.js';

const P1 = 'calcio-2026-10-20-inter-lecce';
const P3 = 'calcio-2026-10-20-italia-norvegia';
const m = (mercato, selezione, probModello, probPinnacle = null, extra = {}) => ({
  mercato, selezione, probModello, probPinnacle, quota: null, fonteQuota: null, oraQuota: null, frequenzaCampionato: null, ...extra,
});

function raccolta() {
  return {
    data: '2026-10-20',
    partite: [
      {
        idPartita: P1, competizione: 'Serie A', partita: 'Inter - Lecce', casa: 'Inter', trasferta: 'Lecce',
        inizio: '2026-10-20T20:45:00+02:00', modello: 'dixon-coles', lambda: { casa: 1.9, trasferta: 0.8 },
        ragionamentoBase: ['Gol attesi: Inter 1,9 – Lecce 0,8'],
        mercati: [
          m('1X2', '1', 0.60, 0.56), m('1X2', 'X', 0.24, 0.26), m('1X2', '2', 0.16, 0.18),
          m('Under/Over 2.5', 'Over 2.5', 0.58, 0.54), m('Under/Over 2.5', 'Under 2.5', 0.42, 0.46),
          m('Under/Over casa 0.5', 'Over 0.5', 0.97), m('Under/Over casa 0.5', 'Under 0.5', 0.03),
          m('Risultato esatto', '2-1', 0.10),
          m('Doppia chance', '1X', 0.84),
        ],
      },
      {
        idPartita: P3, competizione: 'Qualificazioni Mondiali', partita: 'Italia - Norvegia', casa: 'Italia', trasferta: 'Norvegia',
        inizio: '2026-10-20T20:45:00+02:00', modello: 'solo-pinnacle', lambda: null, ragionamentoBase: [],
        mercati: [m('1X2', '1', null, 0.5), m('1X2', 'X', null, 0.3), m('1X2', '2', null, 0.2)],
      },
    ],
  };
}

const corr = (idPartita, mercato, selezione, delta, extra = {}) => ({ idPartita, mercato, selezione, delta, motivo: 'assente Lautaro', fonte: 'Gazzetta', ...extra });
const notizie = (correzioni = [], esclusioni = []) => ({
  controllateAlle: '2026-10-20T08:15:00+02:00', partiteControllate: [P1, P3], esclusioni, correzioni,
});

test('notizie valide → nessun errore', () => {
  assert.deepEqual(validaNotizie(notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.05), corr(P1, '1X2', '1', 0.03), corr(P1, '1X2', 'X', -0.02)],
    [{ idPartita: P3, motivo: 'turnover', fonte: 'Sky' }, { idPartita: P1, idCandidato: `${P1}-risultato-esatto-2-1`, motivo: 'x', fonte: 'y' }]), raccolta()), []);
});

test('correzione di 0.12 rifiutata con messaggio che cita mercato e partita', () => {
  const errori = validaNotizie(notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.12)]), raccolta());
  assert.equal(errori.length, 1);
  assert.match(errori[0], new RegExp(P1));
  assert.match(errori[0], /Under\/Over 2\.5/);
  assert.match(errori[0], /0\.08/);
});

test('correzione su Risultato esatto rifiutata: solo esclusione', () => {
  const errori = validaNotizie(notizie([corr(P1, 'Risultato esatto', '2-1', 0.02)]), raccolta());
  assert.equal(errori.length, 1);
  assert.match(errori[0], /Risultato esatto/);
  assert.match(errori[0], /non correggibile/);
  assert.match(errori[0], /escludere/);
  assert.equal(validaNotizie(notizie([corr(P1, 'Doppia chance', '1X', 0.02)]), raccolta()).length, 1);
});

test('1X2: correzioni -0.05 su "1" e -0.05 su "X" → "2" +0.10 rifiutata (oltre 0.08)', () => {
  const errori = validaNotizie(notizie([corr(P1, '1X2', '1', -0.05), corr(P1, '1X2', 'X', -0.05)]), raccolta());
  assert.equal(errori.length, 1);
  assert.match(errori[0], /1X2/);
  assert.match(errori[0], /"2"/);
  assert.match(errori[0], /0\.1/);
});

test('1X2: tre selezioni corrette rifiutate', () => {
  const errori = validaNotizie(notizie([corr(P1, '1X2', '1', -0.02), corr(P1, '1X2', 'X', 0.01), corr(P1, '1X2', '2', 0.01)]), raccolta());
  assert.equal(errori.length, 1);
  assert.match(errori[0], /al massimo 2/);
});

test('mercato o partita inesistente rifiutati', () => {
  const errori = validaNotizie(notizie([
    corr(P1, 'Angoli Under/Over 9.5', 'Over 9.5', 0.03),
    corr(P1, 'Under/Over 2.5', 'Over 3', 0.03),
    corr('calcio-2026-10-20-milan-roma', '1X2', '1', 0.03),
  ]), raccolta());
  assert.equal(errori.length, 3);
  assert.match(errori[0], /inesistente/);
  assert.match(errori[2], /partita inesistente/);
});

test('altre regole: solo-pinnacle, motivo e fonte, intervallo 0.02–0.98, doppioni, esclusioni', () => {
  const r = raccolta();
  assert.match(validaNotizie(notizie([corr(P3, '1X2', '1', 0.02)]), r)[0], /solo Pinnacle/);
  assert.match(validaNotizie(notizie([corr(P1, '1X2', '1', 0.02, { fonte: ' ' })]), r)[0], /fonte/);
  assert.match(validaNotizie(notizie([corr(P1, '1X2', '1', 0.02, { motivo: '' })]), r)[0], /motivo/);
  assert.match(validaNotizie(notizie([corr(P1, 'Under/Over casa 0.5', 'Over 0.5', 0.02)]), r)[0], /0\.98/);
  assert.match(validaNotizie(notizie([corr(P1, 'Under/Over casa 0.5', 'Under 0.5', -0.02)]), r)[0], /0\.02/);
  assert.equal(validaNotizie(notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.02), corr(P1, 'Under/Over 2.5', 'Under 2.5', 0.02)]), r).length, 1);
  assert.equal(validaNotizie(notizie([corr(P1, '1X2', '1', 'tanto')]), r).length, 1);
  assert.equal(validaNotizie(notizie([], [{ idPartita: 'boh', motivo: 'x', fonte: 'y' }]), r).length, 1);
  assert.equal(validaNotizie(notizie([], [{ idPartita: P1, idCandidato: `${P1}-1x2-7`, motivo: 'x', fonte: 'y' }]), r).length, 1);
  assert.equal(validaNotizie(notizie([], [{ idPartita: P1, motivo: 'x' }]), r).length, 1);
  assert.equal(validaNotizie({ ...notizie(), controllateAlle: 'ieri' }, r).length, 1);
});

test('Over 2.5 -0.05 → Under 2.5 +0.05, con il campo correzioneNotizie', () => {
  const p = raccolta().partite[0];
  const c = applicaCorrezioni(p, [corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.05)]);
  const over = c.mercati.find((x) => x.selezione === 'Over 2.5');
  const under = c.mercati.find((x) => x.selezione === 'Under 2.5');
  assert.ok(Math.abs(over.probModello - 0.53) < 1e-9);
  assert.ok(Math.abs(under.probModello - 0.47) < 1e-9);
  assert.deepEqual(over.correzioneNotizie, { delta: -0.05, motivo: 'assente Lautaro', fonte: 'Gazzetta' });
  assert.ok(Math.abs(under.correzioneNotizie.delta - 0.05) < 1e-9);
  assert.equal(c.mercati.find((x) => x.selezione === '1').correzioneNotizie, null);
  assert.equal(p.mercati[3].probModello, 0.58, 'la partita originale non cambia');
});

test('1X2: la terza selezione riceve −(d1+d2); con una sola correzione le altre due si dividono −d', () => {
  const p = raccolta().partite[0];
  const c = applicaCorrezioni(p, [corr(P1, '1X2', '1', 0.04), corr(P1, '1X2', 'X', -0.01)]);
  const pr = (s) => c.mercati.find((x) => x.mercato === '1X2' && x.selezione === s).probModello;
  assert.ok(Math.abs(pr('1') - 0.64) < 1e-9);
  assert.ok(Math.abs(pr('X') - 0.23) < 1e-9);
  assert.ok(Math.abs(pr('2') - 0.13) < 1e-9);
  const una = applicaCorrezioni(p, [corr(P1, '1X2', '1', -0.04)]);
  const q = (s) => una.mercati.find((x) => x.mercato === '1X2' && x.selezione === s).probModello;
  assert.ok(Math.abs(q('1') + q('X') + q('2') - 1) < 1e-9);
  assert.ok(Math.abs(q('X') - 0.264) < 1e-9); // 0.24 + 0.04·0.24/0.40
});

test('1X2: una sola correzione accettata; quota proporzionale fuori 0.02–0.98 rifiutata', () => {
  assert.deepEqual(validaNotizie(notizie([corr(P1, '1X2', '1', 0.05)]), raccolta()), []);
  const r = raccolta();
  r.partite[0].mercati.splice(0, 3, m('1X2', '1', 0.90, 0.88), m('1X2', 'X', 0.07, 0.08), m('1X2', '2', 0.03, 0.04));
  const errori = validaNotizie(notizie([corr(P1, '1X2', '1', 0.08)]), r); // "X" −0.056 → 0.014, "2" −0.024 → 0.006
  assert.equal(errori.length, 2);
  assert.match(errori[0], /"X"/);
  assert.match(errori[1], /"2"/);
  assert.match(errori[0], /0\.02/);
});

// --- NBA (Fase 4a) ---
import { correggibile } from '../../src/giro/notizie.js';
import { celticsKnicks, NBA1 } from './nba-prova.js';

const raccoltaMista = () => ({ data: '2026-10-20', partite: [...raccolta().partite, celticsKnicks()] });

test('mercati NBA correggibili: Vincente, Handicap <linea>, Totale punti <linea>', () => {
  for (const x of ['Vincente', 'Handicap -4.5', 'Handicap +3', 'Handicap 0', 'Totale punti 221.5', 'Totale punti 220']) assert.equal(correggibile(x), true, x);
  for (const x of ['Handicap asiatico -1', 'Handicap', 'Handicap -', 'Totale punti', 'Vincente finale']) assert.equal(correggibile(x), false, x);
});

test('correzione su Vincente: complementare automatica; su Handicap -4.5 casa → trasferta −delta', () => {
  const corrNba = [corr(NBA1, 'Vincente', 'New York Knicks', 0.04), corr(NBA1, 'Handicap -4.5', 'casa', -0.03)];
  assert.deepEqual(validaNotizie(notizie(corrNba), raccoltaMista()), []);
  const c = applicaCorrezioni(celticsKnicks(), corrNba);
  const pr = (mercato, sel) => c.mercati.find((x) => x.mercato === mercato && x.selezione === sel);
  assert.ok(Math.abs(pr('Vincente', 'New York Knicks').probModello - 0.42) < 1e-9);
  assert.ok(Math.abs(pr('Vincente', 'Boston Celtics').probModello - 0.58) < 1e-9);
  assert.ok(Math.abs(pr('Vincente', 'Boston Celtics').correzioneNotizie.delta + 0.04) < 1e-9);
  assert.ok(Math.abs(pr('Handicap -4.5', 'casa').probModello - 0.49) < 1e-9);
  assert.ok(Math.abs(pr('Handicap -4.5', 'trasferta').probModello - 0.51) < 1e-9);
  assert.ok(Math.abs(pr('Handicap -4.5', 'trasferta').correzioneNotizie.delta - 0.03) < 1e-9);
  assert.equal(pr('Totale punti 221.5', 'Over 221.5').correzioneNotizie, null);
});

test('notizie NBA validate sulla raccolta unita: limiti come nel calcio', () => {
  const r = raccoltaMista();
  // Vincente: una sola correzione per mercato, l'altra si ricava.
  assert.match(validaNotizie(notizie([corr(NBA1, 'Vincente', 'Boston Celtics', 0.02), corr(NBA1, 'Vincente', 'New York Knicks', -0.02)]), r)[0], /una sola correzione/);
  assert.match(validaNotizie(notizie([corr(NBA1, 'Totale punti 221.5', 'Over 221.5', 0.09)]), r)[0], /0\.08/);
  assert.match(validaNotizie(notizie([corr(NBA1, 'Handicap -5.5', 'casa', 0.02)]), r)[0], /inesistente/);
  assert.deepEqual(validaNotizie(notizie([], [{ idPartita: NBA1, idCandidato: `${NBA1}-handicap-meno-4-5-trasferta`, motivo: 'Brunson fuori', fonte: 'NBA injury report' }]), r), []);
  // Una correzione calcio e una NBA insieme.
  assert.deepEqual(validaNotizie(notizie([corr(P1, '1X2', '1', 0.02), corr(NBA1, 'Totale punti 221.5', 'Under 221.5', -0.02)]), r), []);
});
