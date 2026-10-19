import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costruisciCandidati } from '../../src/giro/candidati.js';

const P1 = 'calcio-2026-10-20-inter-lecce';
const P2 = 'calcio-2026-10-20-milan-roma';
const P3 = 'calcio-2026-10-20-italia-norvegia';
const ORA = '2026-10-20T07:35:40+02:00';
const FONTE = 'mediana di 9 bookmaker (The Odds API)';
const m = (mercato, selezione, probModello, probPinnacle, quota, frequenzaCampionato = null) => ({
  mercato, selezione, probModello, probPinnacle, quota,
  fonteQuota: quota === null ? null : FONTE, oraQuota: quota === null ? null : ORA, frequenzaCampionato,
});
const partita = (idPartita, nome, modello, mercati, extra = {}) => ({
  idPartita, competizione: 'Serie A', partita: nome, casa: nome.split(' - ')[0], trasferta: nome.split(' - ')[1],
  inizio: '2026-10-20T20:45:00+02:00', modello, lambda: modello === 'dixon-coles' ? { casa: 1.9, trasferta: 0.8 } : null,
  ragionamentoBase: modello === 'dixon-coles' ? ['Gol attesi: Inter 1,9 – Lecce 0,8 (gol e xG, ultime 2 stagioni)'] : [], mercati, ...extra,
});

function raccolta() {
  return {
    data: '2026-10-20', generataAlle: ORA, competizioniNonCoperte: [], erroriGiro: [],
    partite: [
      partita(P1, 'Inter - Lecce', 'dixon-coles', [
        m('1X2', '1', 0.60, 0.56, 1.95), m('1X2', 'X', 0.24, 0.26, 3.8), m('1X2', '2', 0.16, 0.18, 5.0),
        m('Under/Over 2.5', 'Over 2.5', 0.58, 0.54, 1.80), m('Under/Over 2.5', 'Under 2.5', 0.42, 0.46, 2.20),
        m('Risultato esatto', '2-1', 0.10, null, null),
        m('Angoli Under/Over 9.5', 'Over 9.5', 0.55, null, null, 0.42),
        m('Angoli Under/Over 9.5', 'Under 9.5', 0.45, null, null, 0.60),
        m('Under/Over casa 1.5', 'Over 1.5', 0.30, null, null, 0.50),
        m('Under/Over casa 1.5', 'Under 1.5', 0.70, null, null, 0.50),
      ]),
      partita(P2, 'Milan - Roma', 'dixon-coles', [
        m('1X2', '1', 0.50, 0.46, 2.30), m('1X2', 'X', 0.27, 0.28, 3.4), m('1X2', '2', 0.23, 0.26, 3.3),
        m('Cartellini Under/Over 4.5', 'Over 4.5', 0.62, null, null, 0.48),
        m('Cartellini Under/Over 4.5', 'Under 4.5', 0.38, null, null, 0.45),
        m('Gol/No gol', 'Gol', 0.50, null, null, 0.41),
      ], { inizio: '2026-10-20T18:00:00+02:00' }),
      partita(P3, 'Italia - Norvegia', 'solo-pinnacle', [
        m('1X2', '1', null, 0.45, 2.10), m('1X2', 'X', null, 0.30, null, 0.20), m('1X2', '2', null, 0.25, 4.2),
      ]),
    ],
  };
}
const notizie = (correzioni = [], esclusioni = [], partiteControllate = [P1, P2, P3]) => ({
  controllateAlle: '2026-10-20T08:15:00+02:00', partiteControllate, esclusioni, correzioni,
});
const corr = (idPartita, mercato, selezione, delta) => ({ idPartita, mercato, selezione, delta, motivo: 'assente Lautaro', fonte: 'Gazzetta' });
const trova = (r, id) => r.candidati.find((c) => c.id === id);

test('candidato con quota: campi, id, prob media 50/50 e ragionamento', () => {
  const r = costruisciCandidati(raccolta(), notizie());
  const c = trova(r, `${P1}-1x2-1`);
  assert.deepEqual(Object.keys(c).sort(), ['competizione', 'correzioneNotizie', 'fonteQuota', 'id', 'idPartita', 'inizio', 'mercato',
    'oraQuota', 'partita', 'prob', 'probModello', 'probPinnacle', 'quota', 'quotaDaVerificare', 'ragionamento', 'selezione', 'sport', 'tipo'].sort());
  assert.equal(c.sport, 'calcio');
  assert.equal(c.tipo, 'singola');
  assert.ok(Math.abs(c.prob - 0.58) < 1e-9);
  assert.equal(c.quota, 1.95);
  assert.equal(c.quotaDaVerificare, false);
  assert.equal(c.correzioneNotizie, null);
  assert.deepEqual(c.ragionamento, [
    'Gol attesi: Inter 1,9 – Lecce 0,8 (gol e xG, ultime 2 stagioni)',
    'Modello 60%, Pinnacle 56%, probabilità usata 58%',
    'Quota mediana 1,95 su 9 bookmaker alle 07:35',
    'Notizie controllate alle 08:15: nessuna correzione',
  ]);
  const pin = trova(r, `${P3}-1x2-2`);
  assert.equal(pin.prob, 0.25);
  assert.equal(pin.ragionamento.length, 3);
  assert.equal(pin.ragionamento[0], 'Solo Pinnacle, probabilità usata 25%');
});

test('Over 2.5 -0.05 → Under 2.5 +0.05; con Pinnacle la finale scende di 0.025', () => {
  const prima = trova(costruisciCandidati(raccolta(), notizie()), `${P1}-under-over-2-5-over-2-5`);
  const r = costruisciCandidati(raccolta(), notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.05)]));
  const over = r.candidati.find((c) => c.selezione === 'Over 2.5');
  // Over 2.5 ora ha value negativo: non è più candidato, ma lo era prima.
  assert.ok(prima);
  assert.equal(over, undefined);
  const under = trova(r, `${P1}-under-over-2-5-under-2-5`);
  assert.ok(Math.abs(under.probModello - 0.47) < 1e-9);
  assert.ok(Math.abs(under.prob - (0.44 + 0.025)) < 1e-9);
  assert.ok(Math.abs(under.correzioneNotizie.delta - 0.05) < 1e-9);
  assert.equal(under.ragionamento[3], 'Notizie: assente Lautaro (Gazzetta, 08:15) → Under 2.5: modello da 42% a 47%, finale 47%');
});

test('correzione che porta oltre 10 punti da Pinnacle → pre-scarto "stima troppo lontana dal mercato"', () => {
  const r = costruisciCandidati(raccolta(), notizie([corr(P1, '1X2', '1', 0.08), corr(P1, '1X2', 'X', -0.04)]));
  const id = `${P1}-1x2-1`;
  assert.ok(trova(r, id), 'resta tra i candidati');
  assert.deepEqual(r.preScartate.filter((s) => s.idCandidato === id), [{ idCandidato: id, motivo: 'stima troppo lontana dal mercato' }]);
  // Senza correzione lo scarto è 4 punti: nessun pre-scarto.
  assert.equal(costruisciCandidati(raccolta(), notizie()).preScartate.length, 0);
});

test('correzione che porta un mercato sopra soglia lo fa entrare', () => {
  const id = `${P1}-under-over-2-5-under-2-5`;
  assert.equal(trova(costruisciCandidati(raccolta(), notizie()), id), undefined); // value 0.44·2.20−1 < 0
  const c = trova(costruisciCandidati(raccolta(), notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.08)])), id);
  assert.ok(c);
  assert.ok(c.prob * c.quota - 1 > 0.05);
});

test('esclusione per partita: tutti i candidati con motivo "notizia: …"', () => {
  const r = costruisciCandidati(raccolta(), notizie([], [
    { idPartita: P1, motivo: 'partita a rischio rinvio', fonte: 'ANSA' },
    { idPartita: P2, idCandidato: `${P2}-1x2-1`, motivo: 'Leao squalificato', fonte: 'Sky' },
  ]));
  const diP1 = r.candidati.filter((c) => c.idPartita === P1);
  assert.ok(diP1.length >= 2);
  for (const c of diP1) assert.ok(r.preScartate.some((s) => s.idCandidato === c.id && s.motivo === 'notizia: partita a rischio rinvio'));
  assert.deepEqual(r.preScartate.filter((s) => s.idCandidato.startsWith(P2)), [{ idCandidato: `${P2}-1x2-1`, motivo: 'notizia: Leao squalificato' }]);
  assert.equal(r.preScartate.length, diP1.length + 1);
});

test('senza quota: al massimo 2 al giorno, solo con scostamento ≥ 10 punti', () => {
  const r = costruisciCandidati(raccolta(), null);
  const senza = r.candidati.filter((c) => c.quota === null);
  // Angoli Under 9.5 (15 punti) e Cartellini Over 4.5 (14 punti); fuori Angoli Over 9.5 (13),
  // Cartellini Under 4.5 (7), Gol (9), Under/Over casa 1.5 (quota giusta fuori 1.60–3.00), solo-pinnacle.
  assert.deepEqual(senza.map((c) => c.id).sort(), [`${P1}-angoli-under-over-9-5-under-9-5`, `${P2}-cartellini-under-over-4-5-over-4-5`].sort());
  for (const c of senza) {
    assert.equal(c.quotaDaVerificare, true);
    assert.equal(c.fonteQuota, null);
    assert.equal(c.oraQuota, null);
    assert.equal(c.ragionamento[c.ragionamento.length - 2], 'Quota da verificare su bet365');
    assert.equal(c.ragionamento[c.ragionamento.length - 1], 'Notizie non controllate: giro di Claude non eseguito');
  }
  assert.equal(trova(r, `${P1}-angoli-under-over-9-5-under-9-5`).ragionamento[1], 'Solo modello, probabilità usata 45%');
});

test('al massimo 5 mercati con quota per partita, solo value > 0', () => {
  const mercati = [];
  [2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7].forEach((q, i) => mercati.push(m(`Under/Over ${i}.5`, `Over ${i}.5`, 0.5, null, q))); // value 0.05 … 0.35
  mercati.push(m('1X2', '1', 0.5, null, 1.9)); // value −0.05
  mercati.push(m('1X2', 'X', 0.5, null, 2.0)); // value 0
  const r = costruisciCandidati({ data: '2026-10-20', partite: [partita(P1, 'Inter - Lecce', 'dixon-coles', mercati)] }, null);
  assert.deepEqual(r.candidati.map((c) => c.quota).sort(), [2.3, 2.4, 2.5, 2.6, 2.7]);
});

test('mercati senza probabilità utilizzabile non producono candidati', () => {
  const r = costruisciCandidati({ data: '2026-10-20', partite: [partita(P1, 'Inter - Lecce', 'dixon-coles', [
    m('1X2', '1', null, null, 3.0), m('Angoli Under/Over 9.5', 'Over 9.5', null, null, null, 0.3),
  ], { ragionamentoBase: [], lambda: null })] }, null);
  assert.deepEqual(r.candidati, []);
});

test('partita non controllata da Claude: la riga lo dice', () => {
  const r = costruisciCandidati(raccolta(), notizie([], [], [P1]));
  assert.equal(trova(r, `${P2}-1x2-1`).ragionamento.at(-1), 'Notizie non controllate per questa partita');
});

test('stesso input due volte → stessi id', () => {
  const a = costruisciCandidati(raccolta(), notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.03)]));
  const b = costruisciCandidati(raccolta(), notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.03)]));
  assert.deepEqual(a, b);
  assert.equal(new Set(a.candidati.map((c) => c.id)).size, a.candidati.length);
});
