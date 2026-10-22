// Pronostici sì/no: istantanea che si chiude da sola (A1), segnale "giocabile" prudente (A2),
// bilancio per partita e pronostici collegati (A3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  eGiocabile, pronosticiPartita, righeIstantanea, salvaIstantanea, leggiIstantanea, fileIstantanea,
  bilancioPronostici, avvisiPronosticiSenzaEsito,
} from '../../src/regole/pronostici.js';
import { aggiornaRegistro } from '../../src/registro/registro.js';
import { eseguiGiro } from '../../src/giro/giro.js';
import { testoPronostici, messaggiPronostici } from '../../src/notifiche/telegram.js';

const cartella = () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-pronostici-'));
  for (const s of ['raccolta', 'giornate', 'registro', 'segnature', 'taratura']) mkdirSync(join(d, s));
  return d;
};
const leggi = (file) => JSON.parse(readFileSync(file, 'utf8'));

const pr = (mercato, selezione, testo, extra = {}) => ({
  mercato, selezione, testo, probModello: 0.86, prob: 0.85, quotaMinima: 1.18, quota: null, giocabile: false, esito: null, ...extra,
});
const juve = {
  idPartita: 'calcio-2026-10-22-juventus-rennes', sport: 'calcio', competizione: 'Europa League', partita: 'Juventus - Rennes',
  inizio: '2026-10-22T18:45:00+02:00',
  pronostici: [pr('Under/Over casa 0.5', 'Over 0.5', 'Segna Juventus'), pr('Doppia chance', 'X2', 'Rennes non perde (X2)')],
};
const pafos = {
  idPartita: 'calcio-2026-10-22-pafos-riga-fc', sport: 'calcio', competizione: 'Conference League', partita: 'Pafos - Riga FC',
  inizio: '2026-10-22T18:45:00+02:00', pronostici: [pr('Under/Over casa 0.5', 'Over 0.5', 'Segna Pafos')],
};

// ESPN: Juventus - Rennes 2-0 a fine 90 minuti; Pafos - Riga FC non c'è.
function fontiEspn() {
  const summary = { header: { competitions: [{ status: { type: { name: 'STATUS_FULL_TIME' } }, competitors: [
    { homeAway: 'home', score: '2', linescores: [{ displayValue: '1' }] },
    { homeAway: 'away', score: '0', linescores: [{ displayValue: '0' }] },
  ] }] }, boxscore: { teams: [] } };
  return {
    espn: { partite: async (campionato) => (campionato === 'soccer/uefa.europa'
      ? [{ id: '501', casa: 'Juventus', trasferta: 'Rennes', inizio: '2026-10-22T16:45:00Z' }] : []) },
    eurolega: { giornata: async () => ({ partite: [] }) },
    thesportsdb: { round: async () => ({ partite: [] }) },
    footballDataUk: { partite: async () => [], partiteExtra: async () => [] },
    opz: { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(summary) }) },
  };
}

// ---------- A2: giocabile ----------

test('A2 giocabile: serve la probabilità di Pinnacle ≥ probMinima e la quota ≥ 1,05 × minima', () => {
  assert.equal(eGiocabile({ quota: 1.30, probMercato: 0.82, quotaMinima: 1.22 }), true);
  assert.equal(eGiocabile({ quota: 1.30, probMercato: null, quotaMinima: 1.22 }), false); // senza Pinnacle
  assert.equal(eGiocabile({ quota: null, probMercato: 0.85, quotaMinima: 1.22 }), false); // senza quota
  assert.equal(eGiocabile({ quota: 1.30, probMercato: 0.79, quotaMinima: 1.22 }), false); // il mercato non è d'accordo
  assert.equal(eGiocabile({ quota: 1.27, probMercato: 0.85, quotaMinima: 1.22 }), false); // 1,27 < 1,05 × 1,22 = 1,281
  assert.equal(eGiocabile({ quota: 1.29, probMercato: 0.85, quotaMinima: 1.22 }), true);
});

test('A2 pronosticiPartita: quota sopra la minima ma Pinnacle sotto l\'80% → nessun ✅; probMercato salvata', () => {
  const fasce = [{ da: 0.75, n: 4000, vera: 0.82 }];
  const cal = { calcio: { principali: { 'Under/Over 1.5|Over 1.5': fasce, 'Doppia chance|1X': fasce } } };
  const partita = { sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Lecce', casa: 'Inter', trasferta: 'Lecce', mercati: [
    { mercato: 'Under/Over 1.5', selezione: 'Over 1.5', probModello: 0.8, probPinnacle: 0.70, quota: 1.45 },
    { mercato: 'Doppia chance', selezione: '1X', probModello: 0.8, probPinnacle: 0.84, quota: 1.30 },
  ] };
  const p = pronosticiPartita(partita, cal);
  assert.deepEqual(p.map((x) => [x.selezione, x.probMercato, x.giocabile]), [['Over 1.5', 0.70, false], ['1X', 0.84, true]]);
});

test('A2 Telegram: ✅ solo se giocabile; senza quota o Pinnacle "solo da tenere d\'occhio"; niente più "almeno la minima"', () => {
  const g = { data: '2026-10-25', pronostici: [{ ...juve, pronostici: [
    pr('Under/Over casa 0.5', 'Over 0.5', 'Segna Juventus', { quota: 1.30, probMercato: 0.86, giocabile: true }),
    pr('Doppia chance', 'X2', 'Rennes non perde (X2)', { quota: 1.19, probMercato: 0.86, giocabile: false }),
    pr('Under/Over 1.5', 'Over 1.5', 'Almeno 2 gol (Over 1.5)'),
  ] }] };
  const t = testoPronostici(g, '2026-10-25');
  assert.doesNotMatch(t, /almeno la minima/);
  assert.match(t, /Segna Juventus .*\(ora 1,30 ✅\)/);
  assert.match(t, /Rennes non perde \(X2\) .*\(ora 1,19\)$/m);
  assert.match(t, /Almeno 2 gol \(Over 1\.5\) .*solo da tenere d'occhio: controlla la quota su bet365/);
  assert.match(t, /✅ = .*Pinnacle/);
});

// ---------- A3: pronostici collegati ----------

test('A3 bilancio per partita: tutte giuste, qualcuno sbagliato, aperte', () => {
  const g = { pronostici: [
    { partita: 'A - B', pronostici: [{ testo: 'x', esito: 'vinta' }, { testo: 'y', esito: 'vinta' }] },
    { partita: 'C - D', pronostici: [{ testo: 'x', esito: 'vinta' }, { testo: 'Segna D', esito: 'persa' }] },
    { partita: 'E - F', pronostici: [{ testo: 'x', esito: null }] },
  ] };
  const b = bilancioPronostici(g);
  assert.equal(b.giusti, 3);
  assert.equal(b.chiusi, 4);
  assert.equal(b.aperti, 1);
  assert.deepEqual(b.partite, { totale: 3, tutteGiuste: 1, conSbagliati: 1, aperte: 1 });
  assert.deepEqual(b.sbagliati, [{ partita: 'C - D', testo: 'Segna D' }]);
});

test('A3 Telegram: bilancio anche per partita e avviso che i pronostici della stessa partita sono collegati', () => {
  const g = { data: '2026-10-25', pronostici: [
    { partita: 'A - B', pronostici: [{ testo: 'x', esito: 'vinta' }, { testo: 'y', esito: 'vinta' }] },
    { partita: 'C - D', pronostici: [{ testo: 'x', esito: 'vinta' }, { testo: 'Segna D', esito: 'persa' }] },
  ] };
  const [m] = messaggiPronostici({ giornate: [g], inviate: new Set(), oggi: '2026-10-26' });
  assert.match(m.testo, /3 giusti su 4/);
  assert.match(m.testo, /Per partita: 1 su 2 tutti giusti, 1 con qualcuno sbagliato/);
  assert.match(m.testo, /stessa partita sono collegati/);
  assert.match(testoPronostici({ pronostici: [juve] }, '2026-10-25'), /stessa partita sono collegati/);
});

// ---------- A1: istantanea che si chiude da sola ----------

test('A1 righe dell\'istantanea: autosufficienti (partita, competizione, inizio, mercato, probabilità, quota minima)', () => {
  const [r] = righeIstantanea([juve]);
  assert.deepEqual(r, {
    idPartita: juve.idPartita, sport: 'calcio', competizione: 'Europa League', partita: 'Juventus - Rennes', inizio: juve.inizio,
    mercato: 'Under/Over casa 0.5', selezione: 'Over 0.5', testo: 'Segna Juventus', prob: 0.85, probModello: 0.86, quotaMinima: 1.18, esito: null,
  });
});

test('A1 istantanea mancante: si legge dal file della giornata (migrazione dei pronostici del 22/10)', () => {
  const d = cartella();
  assert.equal(leggiIstantanea(d, '2026-10-22'), null);
  writeFileSync(join(d, 'giornate', '2026-10-22.json'), JSON.stringify({ data: '2026-10-22', giocate: [], pronostici: [juve, pafos] }));
  const ist = leggiIstantanea(d, '2026-10-22');
  assert.equal(ist.data, '2026-10-22');
  assert.equal(ist.daGiornata, true);
  assert.equal(ist.pronostici.length, 3);
});

test('A1 salvaIstantanea: una nuova scrittura non perde i pronostici delle partite già iniziate', () => {
  const d = cartella();
  const iniziata = { ...pafos, inizio: '2026-10-23T08:00:00+02:00' };
  salvaIstantanea(d, '2026-10-23', [iniziata, { ...juve, inizio: '2026-10-23T21:00:00+02:00' }], new Date('2026-10-23T05:00:00Z'));
  salvaIstantanea(d, '2026-10-23', [], new Date('2026-10-23T07:00:00Z'));
  const ist = leggi(fileIstantanea(d, '2026-10-23'));
  assert.deepEqual(ist.pronostici.map((x) => x.partita), ['Pafos - Riga FC']);
});

test('A1 registro: i pronostici si chiudono dal risultato anche senza riga nella raccolta; guardia dopo 4 giorni', async () => {
  const d = cartella();
  writeFileSync(join(d, 'giornate', '2026-10-22.json'), JSON.stringify({ data: '2026-10-22', giocate: [], pronostici: [juve, pafos] }));
  const r = await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-23T05:40:00Z'), fonti: fontiEspn() });
  assert.deepEqual(r.pronostici, [{ data: '2026-10-22', n: 3, conEsito: 2, nuovi: 2 }]);
  // Istantanea scritta (migrata dalla giornata) con gli esiti.
  const ist = leggi(fileIstantanea(d, '2026-10-22'));
  assert.deepEqual(ist.pronostici.map((x) => [x.partita, x.selezione, x.esito]), [
    ['Juventus - Rennes', 'Over 0.5', 'vinta'], ['Juventus - Rennes', 'X2', 'persa'], ['Pafos - Riga FC', 'Over 0.5', null],
  ]);
  // Esiti riportati nella giornata.
  const g = leggi(join(d, 'giornate', '2026-10-22.json'));
  assert.deepEqual(g.pronostici[0].pronostici.map((x) => x.esito), ['vinta', 'persa']);
  assert.equal(g.pronostici[1].pronostici[0].esito, null);
  assert.ok(!r.errori.some((e) => /Pafos/.test(e)), 'nessuna guardia prima dei 4 giorni');
  assert.deepEqual(avvisiPronosticiSenzaEsito(d, '2026-10-23'), []);

  // Ultimo tentativo (4 giorni dopo): la partita non trovata diventa un errore visibile.
  const r4 = await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-26T05:40:00Z'), fonti: fontiEspn() });
  assert.ok(r4.errori.some((e) => /Pafos - Riga FC/.test(e) && /4 giorni/.test(e)), r4.errori.join(' | '));
  const avvisi = avvisiPronosticiSenzaEsito(d, '2026-10-26');
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0], /Pronostici del 22\/10.*senza esito dopo 4 giorni.*Pafos - Riga FC/);
  assert.doesNotMatch(avvisi[0], /Juventus/);
});

test('A1 giro: salva l\'istantanea dei pronostici pubblicati e mette in erroriGiro quelli senza esito dopo 4 giorni', () => {
  const d = cartella();
  const fasce = [{ da: 0.7, n: 500, vera: 0.86 }];
  writeFileSync(join(d, 'taratura', 'calibrazione.json'), JSON.stringify({ calcio: { principali: { '1X2|1': fasce, 'Doppia chance|1X': fasce } } }));
  const m = (mercato, selezione, probModello, probPinnacle, quota) => ({ mercato, selezione, probModello, probPinnacle, quota, fonteQuota: 'x', oraQuota: null, frequenzaCampionato: null });
  writeFileSync(join(d, 'raccolta', '2026-10-23.json'), JSON.stringify({
    data: '2026-10-23', generataAlle: '2026-10-23T07:35:00+02:00', crediti: {}, competizioniNonCoperte: [], erroriGiro: [],
    partite: [{
      idPartita: 'calcio-2026-10-23-inter-lecce', competizione: 'Serie A', partita: 'Inter - Lecce', casa: 'Inter', trasferta: 'Lecce',
      inizio: '2026-10-23T20:45:00+02:00', modello: 'dixon-coles', lambda: { casa: 2.2, trasferta: 0.6 }, ragionamentoBase: [],
      mercati: [m('1X2', '1', 0.78, 0.74, 1.45), m('1X2', 'X', 0.14, 0.17, 5), m('1X2', '2', 0.08, 0.09, 9), m('Doppia chance', '1X', 0.92, 0.9, 1.1), m('Under/Over 2.5', 'Over 2.5', 0.62, 0.58, 1.9), m('Under/Over 2.5', 'Under 2.5', 0.38, 0.42, 2.1)],
    }],
  }));
  // Istantanea di 4 giorni prima con un pronostico ancora senza esito.
  writeFileSync(fileIstantanea(d, '2026-10-19'), JSON.stringify({ data: '2026-10-19', pronostici: righeIstantanea([{ ...pafos, inizio: '2026-10-19T18:45:00+02:00' }]) }));
  const r = eseguiGiro({ dirData: d, adesso: new Date('2026-10-23T07:10:00Z'), modo: 'riserva' });
  assert.equal(r.scritto, true);
  const ist = leggi(fileIstantanea(d, '2026-10-23'));
  assert.ok(ist.pronostici.length >= 1);
  for (const x of ist.pronostici) {
    for (const k of ['idPartita', 'sport', 'competizione', 'partita', 'inizio', 'mercato', 'selezione', 'prob', 'probModello', 'quotaMinima']) assert.ok(x[k] !== undefined && x[k] !== null, k);
  }
  assert.ok(r.giornata.erroriGiro.some((e) => /Pronostici del 19\/10.*Pafos - Riga FC/.test(e)), r.giornata.erroriGiro.join(' | '));
  // A4: in prova ogni giocata ha prova: true.
  assert.ok(r.giornata.giocate.length > 0);
  assert.ok(r.giornata.giocate.every((x) => x.prova === true));
  assert.ok(existsSync(join(d, 'giornate', '2026-10-23.json')));
});
