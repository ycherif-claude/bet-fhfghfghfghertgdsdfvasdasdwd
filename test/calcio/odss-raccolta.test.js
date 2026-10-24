// odss-api fonte principale delle quote del calcio [utente, 22/10/2026]: la raccolta legge le quote di tutte le
// competizioni (principali, seconde serie, coppe, campionati extra) da data/raccolta/<data>-odss.json, scaricato
// prima dallo step della raccolta odss. probPinnacle = Pinnacle senza margine o il consenso senza margine dei
// bookmaker; quota = mediana dei bookmaker (exchange esclusi). Se odss manca, o non ha la competizione, la
// competizione torna a The Odds API, con una riga chiara in erroriGiro. Niente rete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eseguiRaccolta } from '../../src/calcio/raccolta.js';
import { riassuntoMercato, eventiOdss } from '../../src/calcio/odss.js';
import { CONFIG } from '../../src/config.js';
import { bkOdss, rigaOdss } from '../odss/aiuti.js';

const adesso = new Date('2026-10-20T05:35:40Z');
const DENTRO = '2026-10-20T18:45:00Z';
const x12 = (h, d, a) => ({ HOME: h, DRAW: d, AWAY: a });

test('riassunto odss: quota mediana per esito (exchange e sospesi fuori, almeno 3 bookmaker, per difetto al centesimo)', () => {
  const r = riassuntoMercato(rigaOdss({ bookmakers: [
    bkOdss('bwin', x12(2.0, 3.5, 4.0)), bkOdss('unibet', x12(2.1, 3.4, 3.8)), bkOdss('william', x12(1.95, 3.6, 4.2)),
    bkOdss('snai', x12(2.05, 3.4, 3.9), { suspended: ['AWAY'] }), bkOdss('betfair_ex_eu', x12(9, 9, 9)),
  ] }));
  assert.deepEqual(r.mediana.HOME, { quota: 2.02, n: 4 });
  assert.deepEqual(r.mediana.AWAY, { quota: 4, n: 3 });
  const pochi = riassuntoMercato(rigaOdss({ bookmakers: [bkOdss('bwin', x12(2, 3, 4)), bkOdss('snai', x12(2, 3, 4))] }));
  assert.equal(pochi.mediana.HOME, undefined);
  // Un evento con la sola mediana (niente miei, niente probabilità) resta nel file.
  const ev = eventiOdss([rigaOdss({ bookmakers: [bkOdss('bwin', x12(2, 3, 4)), bkOdss('unibet', x12(2, 3, 4)), bkOdss('william', x12(2, 3, 4))] })]);
  assert.equal(ev.length, 1);
});

// Righe CSV per il modello di Serie A (come test/calcio/raccolta.test.js).
const SQUADRE_CSV = ['Inter', 'Lecce', 'Milan', 'Roma'];
function righeCsv(stagione) {
  const base = { 2627: '2026-09', 2526: '2026-03', 2425: '2025-03' }[stagione];
  const righe = [];
  let k = 0;
  SQUADRE_CSV.forEach((a, i) => SQUADRE_CSV.forEach((b, j) => {
    if (a === b) return;
    k++;
    righe.push({
      data: `${base}-${String(1 + (k % 27)).padStart(2, '0')}`, casa: a, trasferta: b,
      gc: (i + 2 * j + k) % 4, gt: (j + k) % 3, gcPT: k % 2, gtPT: (k + i) % 2, xgC: null, xgT: null,
      angoliC: 4, angoliT: 3, cartC: 1, cartT: 2, arbitro: null,
    });
  }));
  return righe;
}
const BOOK_ODDS_API = (chiave, q) => ({ chiave, aggiornato: '2026-10-20T05:00:00Z', mercati: { h2h: { casa: q[0], pareggio: q[1], trasferta: q[2] }, totals: {} } });
function fonti({ eventiPer, odss }) {
  const chiamate = { quote: [] };
  return {
    chiamate,
    odss,
    oddsApi: {
      async eventi(sport) { return { eventi: eventiPer[sport] ?? [], rimasti: 412 }; },
      async quote(sport) {
        chiamate.quote.push(sport);
        return { eventi: (eventiPer[sport] ?? []).map((e) => ({ ...e, bookmaker: [BOOK_ODDS_API('pinnacle', [1.6, 4, 5.5]), BOOK_ODDS_API('a', [1.62, 3.9, 5.4]), BOOK_ODDS_API('b', [1.65, 3.8, 5.3])] })), rimasti: 410, usati: 90 };
      },
    },
    footballDataUk: { async partite(codice, stagioni) { return stagioni.flatMap(righeCsv); } },
  };
}

// Evento compatto di data/raccolta/<data>-odss.json (nomi di odss-api, diversi da quelli di The Odds API).
function eventoOdss({ conPinnacle = true, casa = 'Inter', trasferta = 'Lecce' } = {}) {
  const libri = [bkOdss('bwin', x12(1.6, 4.1, 5.6)), bkOdss('unibet', x12(1.62, 4, 5.5)), bkOdss('william', x12(1.58, 4.2, 5.8)), bkOdss('sportium', x12(1.63, 3.9, 5.2))];
  if (conPinnacle) libri.push(bkOdss('pinnacle', x12(1.6, 4.2, 6)));
  const righe = [
    rigaOdss({ home_team: casa, away_team: trasferta, event: `${casa} - ${trasferta}`, commence_time: DENTRO, bookmakers: libri }),
    rigaOdss({ home_team: casa, away_team: trasferta, event: `${casa} - ${trasferta}`, commence_time: DENTRO, market: 'ou', line: 2.5, bookmakers: ['bwin', 'unibet', 'william', 'pinnacle'].map((k) => bkOdss(k, { OVER: 1.9, UNDER: 1.95 })) }),
    rigaOdss({ home_team: casa, away_team: trasferta, event: `${casa} - ${trasferta}`, commence_time: DENTRO, market: 'dc', bookmakers: ['bwin', 'unibet', 'william'].map((k) => bkOdss(k, { '1X': 1.12, 12: 1.2, X2: 2.6 })) }),
  ];
  return eventiOdss(righe)[0];
}
const SERIE_A = { soccer_italy_serie_a: [{ id: '1', casa: 'Inter Milan', trasferta: 'Lecce', inizio: DENTRO }] };
const lancia = (f) => eseguiRaccolta({ data: '2026-10-20', adesso, fonti: f, chiavi: { oddsApi: 'K' } });

test('raccolta calcio con odss: quota mediana e Pinnacle da odss, doppia chance con quota, nessun credito di The Odds API', async () => {
  const f = fonti({ eventiPer: SERIE_A, odss: { eventi: [eventoOdss()], errori: [] } });
  const r = await lancia(f);
  assert.deepEqual(f.chiamate.quote, []);
  assert.deepEqual(r.crediti, { usati: 0, rimasti: 412 });
  const p = r.partite[0];
  const m1 = p.mercati.find((m) => m.mercato === '1X2' && m.selezione === '1');
  assert.equal(m1.quota, 1.6);
  assert.equal(m1.fonteQuota, 'mediana di 5 bookmaker (odss-api)');
  assert.ok(Math.abs(m1.probPinnacle - (1 / 1.6) / (1 / 1.6 + 1 / 4.2 + 1 / 6)) < 1e-4);
  assert.equal(m1.etichettaMercato, undefined);
  const o25 = p.mercati.find((m) => m.mercato === 'Under/Over 2.5' && m.selezione === 'Over 2.5');
  assert.equal(o25.quota, 1.9);
  const dc = p.mercati.find((m) => m.mercato === 'Doppia chance' && m.selezione === 'X2');
  assert.equal(dc.quota, 2.6);
  assert.ok(dc.probPinnacle > 0.3 && dc.probPinnacle < 0.45);
  assert.equal(dc.etichettaMercato, 'Consenso bookmaker');
  assert.ok(!r.erroriGiro.some((e) => /odss/.test(e)), r.erroriGiro.join(' | '));
});

test('raccolta calcio con odss senza Pinnacle: consenso senza margine dei bookmaker come probabilità di mercato', async () => {
  const f = fonti({ eventiPer: SERIE_A, odss: { eventi: [eventoOdss({ conPinnacle: false })], errori: [] } });
  const m1 = (await lancia(f)).partite[0].mercati.find((m) => m.mercato === '1X2' && m.selezione === '1');
  assert.equal(m1.etichettaMercato, 'Consenso bookmaker');
  assert.ok(m1.probPinnacle > 0.55 && m1.probPinnacle < 0.65);
  assert.equal(m1.fonteQuota, 'mediana di 4 bookmaker (odss-api)');
});

test('riserva: odss mancante → The Odds API come prima, con una riga chiara; competizione senza eventi odss → The Odds API', async () => {
  let f = fonti({ eventiPer: SERIE_A, odss: { eventi: null, errori: ['Quote dei bookmaker italiani (odss-api) mancanti: data/raccolta/2026-10-20-odss.json'] } });
  let r = await lancia(f);
  assert.deepEqual(f.chiamate.quote, ['soccer_italy_serie_a']);
  assert.equal(r.partite[0].mercati.find((m) => m.mercato === '1X2').fonteQuota, 'mediana di 3 bookmaker (The Odds API)');
  assert.ok(r.erroriGiro.some((e) => /odss-api non disponibile.*The Odds API/.test(e)), r.erroriGiro.join(' | '));
  // odss c'è ma non ha la Serie A di oggi (nomi diversi o partita mancante): solo la Serie A torna a The Odds API.
  f = fonti({ eventiPer: SERIE_A, odss: { eventi: [eventoOdss({ casa: 'Juventus', trasferta: 'Torino' })], errori: [] } });
  r = await lancia(f);
  assert.deepEqual(f.chiamate.quote, ['soccer_italy_serie_a']);
  assert.ok(r.erroriGiro.some((e) => /Serie A.*nessuna partita su odss-api.*The Odds API/.test(e)), r.erroriGiro.join(' | '));
});

test('campionato extra con le quote di odss: niente più soloPronostici, quota dalla mediana', async () => {
  const storico = [];
  for (let i = 0; i < 40; i++) {
    const giorno = new Date(Date.UTC(2026, 3, 1) + i * 3 * 86400000).toISOString().slice(0, 10);
    storico.push({ data: giorno, casa: i % 2 ? 'Tromso' : 'Molde', trasferta: i % 2 ? 'Molde' : 'Tromso', gc: i % 3, gt: 1, gcPT: null, gtPT: null, xgC: null, xgT: null, stagione: '2526' });
  }
  const inizio = '2026-10-24T16:00:00Z';
  const odssEv = eventiOdss([rigaOdss({ event_id: 'n1', league: 'Eliteserien', home_team: 'Molde', away_team: 'Tromso', commence_time: inizio, bookmakers: ['bwin', 'unibet', 'william'].map((k) => bkOdss(k, x12(1.7, 3.9, 4.6))) })]);
  const f = {
    odss: { eventi: odssEv, errori: [] },
    oddsApi: { eventi: async () => ({ eventi: [], rimasti: 400 }), quote: async () => ({ eventi: [] }) },
    espn: { partite: async (c, g) => (c === 'soccer/nor.1' && g === '2026-10-24' ? [{ id: '1', casa: 'Molde', trasferta: 'Tromsø', inizio }] : []) },
    footballDataUk: { partite: async () => [], partiteExtra: async (codice) => (codice === 'NOR' ? storico : []), calendario: async () => [] },
  };
  const r = await eseguiRaccolta({ data: '2026-10-24', adesso: new Date('2026-10-24T05:00:00Z'), fonti: f, chiavi: {} });
  const p = r.partite.find((x) => x.competizione === 'Eliteserien (Norvegia)');
  assert.equal(p.soloPronostici, undefined);
  const m = p.mercati.find((x) => x.mercato === '1X2' && x.selezione === '1');
  assert.equal(m.quota, 1.7);
  assert.ok(m.probModello > 0);
});

test('workflow: la raccolta odss (1x2) gira prima della raccolta del calcio, che completa dc e ou con la chiave odss', () => {
  const w = readFileSync('.github/workflows/raccolta.yml', 'utf8');
  assert.ok(w.indexOf('npm run raccolta-odss') < w.indexOf('npm run raccolta\n'));
  const step = w.split('\n      - ').find((s) => s.includes('npm run raccolta\n'));
  assert.ok(step.includes('ODSS_API_KEY: ${{ secrets.ODSS_API_KEY }}'));
  assert.equal(CONFIG.odss.tetti.calcio, 4);
});
