// Controlli pre-partita con odss-api [utente, 22/10/2026]: una sola richiesta per passaggio (tutti gli sport e i
// mercati delle giocate da controllare, finestra stretta attorno agli inizi), con il tetto dei controlli del budget
// unico (CONFIG.odss.tetti.controlli al giorno). Le voci senza quota odss (partita non trovata, mercato che odss
// non ha, budget finito, errore) tornano alle fonti di prima, con le loro soglie di crediti.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quoteFresche } from '../../src/controlli/quote.js';
import { fetchOdss, rigaOdss, bkOdss, mattinoOdss } from '../odss/aiuti.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const DATA = '2026-10-23';
const adesso = new Date('2026-10-23T17:30:00Z');
const finestra = { da: new Date('2026-10-23T06:00:00Z'), a: new Date('2026-10-24T06:00:00Z') };
// Le raccolte del mattino danno gli event_id (correzioni 24/10/2026): Torino - Monza = c1, Boston - New York = n1.
const temp = () => mattinoOdss(mkdtempSync(join(tmpdir(), 'odss-controlli-')), DATA, {
  calcio: [{ id: 'c1', casa: 'Torino', trasferta: 'Monza', inizio: '2026-10-23T18:45:00Z', campionato: 'Serie A', mercati: {} }],
  partite: { nba: [{ idPartita: 'nba-bos-nyk', idOdss: ['n1'] }], pallavolo: [{ idPartita: 'pal-1', idOdss: ['m'] }] },
});

const voceCalcio = { id: 'v1', sport: 'calcio', competizione: 'Serie A', partita: 'Torino - Monza', inizio: '2026-10-23T20:45:00+02:00', mercato: '1X2', selezione: '1' };
const voceNba = { id: 'v2', idPartita: 'nba-bos-nyk', sport: 'nba', competizione: 'NBA', partita: 'Boston Celtics - New York Knicks', inizio: '2026-10-24T01:30:00+02:00', mercato: 'Vincente', selezione: 'Boston Celtics' };
const libri = ['pinnacle', 'snai', 'bwin', 'unibet'];
const RIGHE = [
  rigaOdss({ event_id: 'c1', home_team: 'Torino', away_team: 'Monza', commence_time: '2026-10-23T18:45:00Z', market: '1x2', bookmakers: libri.map((k) => bkOdss(k, { HOME: 2.1, DRAW: 3.3, AWAY: 3.6 })) }),
  rigaOdss({ event_id: 'n1', sport: 'basket', league: 'NBA', home_team: 'Boston Celtics', away_team: 'New York Knicks', commence_time: '2026-10-23T23:30:00Z', market: 'moneyline', bookmakers: libri.map((k) => bkOdss(k, { HOME: 1.55, AWAY: 2.5 })) }),
];
function fonti(fetch) {
  const chiamate = [];
  return {
    chiamate,
    fetchOdss: fetch,
    oddsApi: { eventi: async () => { chiamate.push('odds eventi'); return { eventi: [], rimasti: 200 }; }, quote: async () => { chiamate.push('odds quote'); return { eventi: [] }; } },
    sportsgameodds: { eventi: async () => { chiamate.push('sgo'); return []; } },
  };
}
const opz = (f, extra = {}) => ({ fonti: f, chiavi: { oddsApi: 'K', sportsgameodds: 'S', odss: CHIAVE }, finestra, errore: () => {}, dirData: extra.dirData ?? temp(), data: DATA, adesso, ...extra });

test('controlli con odss: una richiesta per calcio e NBA, quote e probabilità da odss, fonti di prima non chiamate', async () => {
  const d = temp();
  const f = fetchOdss({ 'calcio,basket|1x2,ou,moneyline,ah': [RIGHE] });
  const fo = fonti(f);
  const registrate = [];
  const out = await quoteFresche([voceCalcio, voceNba], opz(fo, { dirData: d, registra: (s, c, e) => registrate.push(`${s}|${c}|${e.length}`) }));
  assert.equal(f.chiamate.length, 1);
  const u = new URL(f.chiamate[0].url);
  assert.equal(u.searchParams.get('sport'), 'calcio,basket');
  assert.equal(u.searchParams.get('market'), '1x2,ou,moneyline,ah');
  // Solo gli event_id delle voci, senza finestra (correzioni 24/10/2026).
  assert.equal(u.searchParams.get('event_id'), 'c1,n1');
  assert.equal(u.searchParams.has('commence_from'), false);
  assert.deepEqual(fo.chiamate, []);
  // snai (bookmaker dell'utente) ha la quota delle 07:40: più vecchia di 6 ore alle 19:30, fuori.
  assert.deepEqual(out.get('v1'), { quota: 2.1, n: 3, prob: (1 / 2.1) / (1 / 2.1 + 1 / 3.3 + 1 / 3.6) });
  assert.equal(out.get('v2').quota, 1.55);
  assert.deepEqual(registrate.sort(), ['calcio|Serie A|1', 'nba|NBA|1']);
  const stato = JSON.parse(readFileSync(join(d, 'stato', 'odss.json'), 'utf8'));
  assert.equal(stato.giornate[DATA].controlli, 1);
  assert.equal(stato.giornate[DATA].usate, 0);
});

test('controlli: tetto dei controlli raggiunto → nessuna richiesta a odss, fonti di prima; partita non su odss → fonti di prima', async () => {
  const d = temp();
  mkdirSync(join(d, 'stato'), { recursive: true });
  writeFileSync(join(d, 'stato', 'odss.json'), JSON.stringify({ giorno: DATA, rimaste: 300, controlliOggi: 4 }));
  let f = fetchOdss({ 'calcio|1x2,ou': [RIGHE] });
  let fo = fonti(f);
  const errori = [];
  await quoteFresche([voceCalcio], opz(fo, { dirData: d, errore: (a, b) => errori.push(`${a}: ${b?.message ?? b}`) }));
  assert.equal(f.chiamate.length, 0);
  assert.ok(fo.chiamate.includes('odds eventi'));
  assert.ok(errori.some((e) => /odss-api.*tetto di 4 richieste al giorno per i controlli/.test(e)), errori.join(' | '));
  f = fetchOdss({ 'calcio|1x2,ou': [[RIGHE[1]]] });
  fo = fonti(f);
  await quoteFresche([voceCalcio], opz(fo));
  assert.equal(f.chiamate.length, 1);
  assert.ok(fo.chiamate.includes('odds eventi'));
});

test('workflow: ODSS_API_KEY allo step dei controlli', () => {
  const w = readFileSync('.github/workflows/controlli.yml', 'utf8');
  const step = w.split('\n      - ').find((s) => s.includes('name: Controlli\n'));
  assert.ok(step.includes('ODSS_API_KEY: ${{ secrets.ODSS_API_KEY }}'));
});

test('controlli pallavolo: stessi filtri della raccolta (nome esatto del campionato, niente femminili, squadre dallo storico)', async () => {
  const d = temp();
  mkdirSync(join(d, 'storico'), { recursive: true });
  writeFileSync(join(d, 'storico', 'pallavolo-superlega.json'), JSON.stringify({ partite: [
    { id: '1', stagione: 2026, giornata: 1, idCasa: '136630', idTrasferta: '137441', casa: 'Trentino Volley', trasferta: 'Verona Volley', inizio: '2026-10-10T18:00:00.000Z', puntiCasa: 3, puntiTrasferta: 1, finita: true },
  ] }));
  const voce = { id: 'p1', idPartita: 'pal-1', sport: 'pallavolo', competizione: 'SuperLega', partita: 'Itas Trentino - Rana Verona', inizio: '2026-10-23T20:30:00+02:00', mercato: 'Vincente', selezione: 'Itas Trentino' };
  const riga = (id, league, h) => rigaOdss({ event_id: id, sport: 'volley', league, home_team: 'Trentino Itas', away_team: 'Verona Rana', commence_time: '2026-10-23T18:30:00Z', market: 'moneyline', bookmakers: ['pinnacle', 'bwin', 'unibet'].map((k) => bkOdss(k, { HOME: h, AWAY: 3.2 })) });
  const chiamate = [];
  const fo = (fetch) => ({ fetchOdss: fetch, oddspapi: { conto: async () => { chiamate.push('conto'); return null; } } });
  let out = await quoteFresche([voce], opz(fo(fetchOdss({ 'volley|moneyline,ou': [[riga('w', 'Superliga, Women', 1.1), riga('m', 'Superlega', 1.35)]] })), { dirData: d, chiavi: { odss: CHIAVE, oddspapi: 'P' } }));
  assert.equal(out.get('p1').quota, 1.35);
  out = await quoteFresche([voce], opz(fo(fetchOdss({ 'volley|moneyline,ou': [[riga('w', 'Superliga, Women', 1.1)]] })), { dirData: d, chiavi: { odss: CHIAVE, oddspapi: 'P' } }));
  assert.ok(!Number.isFinite(out.get('p1')?.quota));
  assert.ok(chiamate.includes('conto'));
});
