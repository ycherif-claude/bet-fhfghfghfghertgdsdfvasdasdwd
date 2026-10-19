import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetCrediti, scegliCompetizioni, eseguiRaccolta } from '../../src/calcio/raccolta.js';
import { COMPETIZIONI } from '../../src/calcio/competizioni.js';

const adesso = new Date('2026-10-20T05:35:40Z'); // 07:35:40 a Roma
const DENTRO = '2026-10-20T18:45:00Z';
const FUORI = '2026-10-21T10:00:00Z';
const comp = (nome) => COMPETIZIONI.find((c) => c.nome === nome);

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
      angoliC: 4 + ((i + k) % 5), angoliT: 3 + ((j + k) % 5), cartC: 1 + (k % 3), cartT: 1 + ((k + 1) % 3), arbitro: null,
    });
  }));
  return righe;
}

function bookmaker(chiave, q) {
  return {
    chiave, aggiornato: '2026-10-20T05:00:00Z',
    mercati: {
      h2h: { casa: q[0], pareggio: q[1], trasferta: q[2] },
      totals: { 1.5: { over: 1.3, under: 3.4 }, 2.5: { over: q[3], under: q[4] }, 3.5: { over: 2.6, under: 1.5 } },
    },
  };
}
const BOOKS = [
  bookmaker('pinnacle', [1.6, 4.0, 5.5, 1.9, 1.95]),
  bookmaker('a', [1.62, 3.9, 5.4, 1.88, 1.97]),
  bookmaker('b', [1.65, 3.8, 5.3, 1.9, 1.93]),
  bookmaker('c', [1.61, 4.0, 5.6, 1.92, 1.9]),
];

// Fonti finte: nessuna rete. `eventiPer` = { chiaveSport: [eventi] }.
function fonti({ eventiPer, rimasti = 412, rimastiQuote = 410, csvKo = [], tutteCsvKo = false, righe = righeCsv } = {}) {
  const chiamate = { eventi: [], quote: [], csv: [] };
  return {
    chiamate,
    oddsApi: {
      async eventi(sport) { chiamate.eventi.push(sport); return { eventi: eventiPer[sport] ?? [], rimasti }; },
      async quote(sport) {
        chiamate.quote.push(sport);
        return {
          eventi: (eventiPer[sport] ?? []).map((e) => ({ ...e, bookmaker: BOOKS })),
          rimasti: rimastiQuote, usati: 90,
        };
      },
    },
    footballDataUk: {
      async partite(codice, stagioni) {
        chiamate.csv.push(`${codice}/${stagioni.join(',')}`);
        if (tutteCsvKo || csvKo.includes(stagioni[0])) throw new Error('HTTP 503');
        return stagioni.flatMap(righe);
      },
    },
  };
}
const ev = (id, casa, trasferta, inizio = DENTRO) => ({ id, casa, trasferta, inizio });
const SERIE_A = { soccer_italy_serie_a: [ev('1', 'Inter Milan', 'Lecce')] };
const chiavi = { oddsApi: 'K' };
const lancia = (f, data = '2026-10-20') => eseguiRaccolta({ data, adesso, fonti: f, chiavi });

test('budget: 412 rimasti il 20 ottobre → floor((412−100)/12) = 26', () => assert.equal(budgetCrediti(412, '2026-10-20'), 26));
test('budget sotto la riserva → 0', () => assert.equal(budgetCrediti(90, '2026-10-20'), 0));

test('budget 4 con Serie A, Serie B, Eredivisie: prese Serie A ed Eredivisie, Serie B scoperta', () => {
  const { scelte, scoperte } = scegliCompetizioni([comp('Serie B'), comp('Serie A'), comp('Eredivisie')], 4);
  assert.deepEqual(scelte.map((c) => c.nome), ['Serie A', 'Eredivisie']);
  assert.deepEqual(scoperte.map((c) => c.nome), ['Serie B']);
});

test('crediti quasi finiti: 6 rimasti il 20 → nessuna quota, tutte scoperte, nessuna chiamata a quote()', async () => {
  const f = fonti({ eventiPer: SERIE_A, rimasti: 6 });
  const r = await lancia(f);
  assert.equal(f.chiamate.quote.length, 0);
  assert.deepEqual(r.competizioniNonCoperte, ['Serie A: crediti insufficienti']);
  assert.equal(r.crediti.rimasti, 6);
  assert.ok(r.partite.length > 0);
  assert.ok(r.partite.every((p) => p.mercati.every((m) => m.quota === null && m.fonteQuota === null && m.oraQuota === null)));
});

test('crediti rimasti sconosciuti: nessuna quota e un errore in erroriGiro', async () => {
  const f = fonti({ eventiPer: SERIE_A, rimasti: null });
  const r = await lancia(f);
  assert.equal(f.chiamate.quote.length, 0);
  assert.ok(r.erroriGiro.some((e) => e.includes('The Odds API alle 07:35') && e.includes('crediti rimasti sconosciuti')));
});

test('eseguiRaccolta con fonti finte: idPartita stabile e 1X2 con probModello e probPinnacle', async () => {
  const f = fonti({ eventiPer: SERIE_A });
  const r = await lancia(f);
  assert.equal(r.data, '2026-10-20');
  assert.equal(r.generataAlle, '2026-10-20T07:35:40+02:00');
  assert.deepEqual(r.crediti, { usati: 2, rimasti: 410 });
  assert.deepEqual(f.chiamate.quote, ['soccer_italy_serie_a']);
  assert.equal(r.partite.length, 1);
  const p = r.partite[0];
  assert.equal(p.idPartita, 'calcio-2026-10-20-inter-milan-lecce');
  assert.equal(p.partita, 'Inter Milan - Lecce');
  assert.equal(p.competizione, 'Serie A');
  assert.equal(p.inizio, '2026-10-20T20:45:00+02:00');
  assert.equal(p.modello, 'dixon-coles');
  assert.ok(p.lambda.casa > 0 && p.lambda.trasferta > 0);
  assert.match(p.ragionamentoBase[0], /^Gol attesi: Inter Milan \d,\d – Lecce \d,\d \(gol e xG, ultime 2 stagioni\)$/);
  const m1 = p.mercati.find((m) => m.mercato === '1X2' && m.selezione === '1');
  assert.ok(m1.probModello > 0 && m1.probModello < 1);
  assert.ok(Math.abs(m1.probPinnacle - (1 / 1.6) / (1 / 1.6 + 1 / 4 + 1 / 5.5)) < 1e-9);
  assert.equal(m1.quota, 1.61);
  assert.equal(m1.fonteQuota, 'mediana di 4 bookmaker (The Odds API)');
  assert.equal(m1.oraQuota, '2026-10-20T07:35:40+02:00');
  assert.ok(m1.frequenzaCampionato > 0);
  const o25 = p.mercati.find((m) => m.mercato === 'Under/Over 2.5' && m.selezione === 'Over 2.5');
  assert.ok(o25.quota > 1 && o25.probPinnacle > 0);
  const dc = p.mercati.find((m) => m.mercato === 'Doppia chance');
  assert.equal(dc.quota, null);
  assert.equal(dc.probPinnacle, null);
  assert.equal(dc.fonteQuota, null);
  assert.ok(p.mercati.some((m) => m.mercato.startsWith('Angoli')));
  assert.ok(p.mercati.some((m) => m.mercato.startsWith('Cartellini')));
});

test('ogni CSV è scaricato una volta sola, stagione per stagione', async () => {
  const f = fonti({ eventiPer: { soccer_italy_serie_a: [ev('1', 'Inter Milan', 'Lecce'), ev('2', 'Milan', 'Roma')] } });
  const r = await lancia(f);
  assert.equal(r.partite.length, 2);
  assert.deepEqual(f.chiamate.csv, ['I1/2627', 'I1/2526', 'I1/2425']);
});

test('fonte CSV che fallisce: partita senza modello, errore con nome fonte e ora', async () => {
  const f = fonti({ eventiPer: SERIE_A, tutteCsvKo: true });
  const r = await lancia(f);
  assert.ok(r.erroriGiro.some((e) => /^football-data\.co\.uk I1.* alle 07:35: HTTP 503$/.test(e)));
  const p = r.partite[0];
  assert.equal(p.lambda, null);
  assert.deepEqual(p.ragionamentoBase, []);
  assert.ok(p.mercati.length > 0);
  assert.ok(p.mercati.every((m) => m.probModello === null && m.probPinnacle !== null));
});

test('una stagione che fallisce non fa perdere le altre', async () => {
  const f = fonti({ eventiPer: SERIE_A, csvKo: ['2425'] });
  const r = await lancia(f);
  assert.equal(r.erroriGiro.filter((e) => e.includes('2425')).length, 1);
  assert.ok(r.partite[0].lambda);
});

test('stagione corrente che fallisce: nessun modello per la lega', async () => {
  const f = fonti({ eventiPer: SERIE_A, csvKo: ['2627'] });
  const r = await lancia(f);
  assert.ok(r.erroriGiro.some((e) => e.includes('2627')));
  assert.equal(r.partite[0].lambda, null);
});

test('squadre non riconosciute: nessuna partita e errore', async () => {
  const f = fonti({ eventiPer: { soccer_italy_serie_a: [ev('1', 'Pippo', 'Lecce')] } });
  const r = await lancia(f);
  assert.equal(r.partite.length, 0);
  assert.ok(r.erroriGiro.some((e) => e === 'Squadre non riconosciute: Pippo (Serie A)'));
});

test('Champions League: solo-pinnacle, probModello null, niente angoli', async () => {
  const f = fonti({ eventiPer: { soccer_uefa_champs_league: [ev('9', 'Inter Milan', 'Real Madrid')] } });
  const r = await lancia(f);
  assert.deepEqual(f.chiamate.csv, []);
  const p = r.partite[0];
  assert.equal(p.modello, 'solo-pinnacle');
  assert.equal(p.lambda, null);
  assert.deepEqual(p.ragionamentoBase, ['Coppa o nazionale: probabilità solo da Pinnacle (nessun modello tra campionati diversi)']);
  assert.equal(p.mercati.length, 9);
  assert.ok(p.mercati.every((m) => m.probModello === null && m.probPinnacle > 0));
  assert.ok(p.mercati.every((m) => m.mercato === '1X2' || m.mercato.startsWith('Under/Over')));
});

test('partite fuori dalla finestra 08:00–08:00 escluse', async () => {
  const f = fonti({ eventiPer: { soccer_italy_serie_a: [ev('1', 'Inter Milan', 'Lecce'), ev('2', 'Milan', 'Roma', FUORI)] } });
  const r = await lancia(f);
  assert.deepEqual(r.partite.map((p) => p.idPartita), ['calcio-2026-10-20-inter-milan-lecce']);
});

test('errore di una sola competizione negli eventi: registrato, le altre proseguono', async () => {
  const f = fonti({ eventiPer: SERIE_A });
  const originale = f.oddsApi.eventi;
  f.oddsApi.eventi = async (sport, ...r) => {
    if (sport === 'soccer_epl') throw new Error('HTTP 500');
    return originale(sport, ...r);
  };
  const r = await lancia(f);
  assert.ok(r.erroriGiro.some((e) => e.startsWith('The Odds API (Premier League) alle 07:35: HTTP 500')));
  assert.equal(r.partite.length, 1);
});

test("usati = spesa di questa raccolta: 2 per ogni quote() riuscita, anche se l'intestazione dà il conteggio mensile", async () => {
  const f = fonti({ eventiPer: { ...SERIE_A, soccer_epl: [ev('3', 'Arsenal', 'Chelsea')] } });
  const r = await lancia(f);
  assert.equal(f.chiamate.quote.length, 2);
  assert.equal(r.crediti.usati, 4);
});

test('casa e trasferta sullo stesso nome del CSV: partita non riconosciuta', async () => {
  const f = fonti({ eventiPer: { soccer_italy_serie_a: [ev('1', 'Lecce', 'US Lecce')] } });
  const r = await lancia(f);
  assert.equal(r.partite.length, 0);
  assert.ok(r.erroriGiro.some((e) => e === 'Squadre non riconosciute: Lecce, US Lecce (Serie A)'));
});

test("squadre ignote: l'errore nomina quella giusta, o entrambe", async () => {
  let r = await lancia(fonti({ eventiPer: { soccer_italy_serie_a: [ev('1', 'Inter Milan', 'Pippo')] } }));
  assert.ok(r.erroriGiro.includes('Squadre non riconosciute: Pippo (Serie A)'));
  r = await lancia(fonti({ eventiPer: { soccer_italy_serie_a: [ev('1', 'Pippo', 'Pluto')] } }));
  assert.ok(r.erroriGiro.includes('Squadre non riconosciute: Pippo, Pluto (Serie A)'));
});

test('lambda non finito: errore in erroriGiro e nessuna partita', async () => {
  const f = fonti({ eventiPer: SERIE_A, righe: (s) => righeCsv(s).map((x) => ({ ...x, gc: NaN, gt: NaN })) });
  const r = await lancia(f);
  assert.equal(r.partite.length, 0);
  assert.ok(r.erroriGiro.some((e) => e === 'Gol attesi non validi per Inter Milan - Lecce (Serie A)'));
});
