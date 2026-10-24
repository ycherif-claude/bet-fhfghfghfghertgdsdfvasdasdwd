// odss-api fonte principale delle quote di basket (Eurolega, NBL) e NBA [utente, 22/10/2026]: una richiesta per
// campionato con partite (filtro league), vincente = moneyline, handicap = ah (linea della casa), totale = ou,
// solo partita intera, squadre femminili fuori, Pinnacle preferito per la probabilità di mercato. Se odss non
// risponde, o non ha il campionato, si torna a The Odds API (basket) o SportsGameOdds (NBA) con una riga chiara.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiRaccoltaBasket } from '../../src/basket/raccolta.js';
import { eseguiRaccoltaNba } from '../../src/nba/raccolta.js';
import { fetchOdss, rigaOdss, bkOdss } from '../odss/aiuti.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const adesso = new Date('2026-10-21T05:07:00Z');
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'odss-basket-')); mkdirSync(join(d, 'raccolta'), { recursive: true }); return d; };

// Righe odss di una partita: moneyline, handicap della casa e totale per 4 bookmaker (Pinnacle compreso).
function righe({ casa, trasferta, inizio, league, event_id = 'b1', ml = [1.6, 2.4], ah = -4.5, ou = 162.5 }) {
  const base = { sport: 'basket', league, event_id, event: `${casa} - ${trasferta}`, home_team: casa, away_team: trasferta, commence_time: inizio };
  const libri = ['pinnacle', 'snai', 'bwin', 'unibet'];
  return [
    rigaOdss({ ...base, market: 'moneyline', bookmakers: libri.map((k, i) => bkOdss(k, { HOME: ml[0] + i * 0.01, AWAY: ml[1] - i * 0.01 })) }),
    rigaOdss({ ...base, market: 'ah', line: ah, bookmakers: libri.map((k) => bkOdss(k, { HOME: 1.9, AWAY: 1.9 })) }),
    rigaOdss({ ...base, market: 'ou', line: ou, bookmakers: libri.map((k) => bkOdss(k, { OVER: 1.88, UNDER: 1.92 })) }),
    // Primo tempo: ignorato.
    rigaOdss({ ...base, market: 'moneyline', period: '1st_half', bookmakers: libri.map((k) => bkOdss(k, { HOME: 3, AWAY: 1.3 })) }),
  ];
}

function fontiBasket({ fetch, eventi = {} } = {}) {
  const chiamate = [];
  return {
    chiamate,
    fetchOdss: fetch,
    eurolega: { giornata: async () => ({ partite: [], scartate: 0 }) },
    thesportsdb: { round: async () => ({ partite: [], scartate: 0 }) },
    oddsBasket: {
      eventi: async (chiave) => { chiamate.push(`eventi ${chiave}`); return { eventi: eventi[chiave] ?? [], rimasti: 300 }; },
      quote: async (chiave) => {
        chiamate.push(`quote ${chiave}`);
        const b = (k) => ({ chiave: k, mercati: { vincente: { casa: 1.6, trasferta: 2.4 } } });
        return { eventi: (eventi[chiave] ?? []).map((e) => ({ ...e, bookmaker: [b('pinnacle'), b('a'), b('b')] })), rimasti: 297 };
      },
    },
  };
}
const EL = { basketball_euroleague: [{ id: 'x', casa: 'Real Madrid', trasferta: 'FC Barcelona', inizio: '2026-10-21T18:45:00Z' }] };

test('basket con odss: una richiesta per l\'Eurolega (league "eurol"), mercati da odss, niente crediti; NBL senza partite non costa', async () => {
  const dir = temp();
  const f = fetchOdss({ 'basket|moneyline,ah,ou': [[
    ...righe({ casa: 'Real Madrid', trasferta: 'Barcelona', inizio: '2026-10-21T18:45:00Z', league: 'Euroleague' }),
    // Partita femminile alla stessa ora con le stesse città: mai abbinata.
    ...righe({ casa: 'Real Madrid', trasferta: 'Barcelona', inizio: '2026-10-21T18:45:00Z', league: 'Euroleague Women', event_id: 'w1', ml: [5, 1.1] }),
  ]] });
  const fo = fontiBasket({ fetch: f, eventi: EL });
  const r = await eseguiRaccoltaBasket({ data: '2026-10-21', adesso, fonti: fo, chiavi: { oddsApi: 'K', odss: CHIAVE }, dirData: dir, pausaMs: 0 });
  assert.equal(f.chiamate.length, 1);
  const u = new URL(f.chiamate[0].url);
  assert.equal(u.searchParams.get('league'), 'eurol');
  assert.equal(u.searchParams.get('market'), 'moneyline,ah,ou');
  assert.ok(!fo.chiamate.some((c) => c.startsWith('quote')));
  assert.equal(r.crediti.usati, 0);
  const p = r.partite[0];
  assert.deepEqual(p.mercati.map((m) => `${m.mercato} | ${m.selezione}`), [
    'Vincente | Real Madrid', 'Vincente | FC Barcelona', 'Handicap -4.5 | casa', 'Handicap -4.5 | trasferta',
    'Totale punti 162.5 | Over 162.5', 'Totale punti 162.5 | Under 162.5',
  ]);
  assert.equal(p.mercati[0].fonteQuota, 'mediana di 4 bookmaker (odss-api)');
  assert.ok(Array.isArray(p.idOdss) && p.idOdss.length, 'event_id di odss per i controlli');
  assert.equal(p.mercati[0].quota, 1.61);
  assert.ok(Math.abs(p.mercati[0].probPinnacle - (1 / 1.6) / (1 / 1.6 + 1 / 2.4)) < 1e-9);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'stato', 'odss.json'), 'utf8')).giornate['2026-10-21'].perSport, { basket: 1 });
});

test('basket: odss in 429 → The Odds API come prima, con una riga chiara', async () => {
  const fo = fontiBasket({ fetch: fetchOdss({}, { status: 429 }), eventi: EL });
  const r = await eseguiRaccoltaBasket({ data: '2026-10-21', adesso, fonti: fo, chiavi: { oddsApi: 'K', odss: CHIAVE }, dirData: temp(), pausaMs: 0 });
  assert.ok(fo.chiamate.includes('quote basketball_euroleague'));
  assert.equal(r.partite[0].mercati[0].fonteQuota, 'mediana di 3 bookmaker (The Odds API)');
  assert.ok(r.erroriGiro.some((e) => /odss-api.*HTTP 429/.test(e)));
  assert.ok(r.erroriGiro.some((e) => /Eurolega.*The Odds API/.test(e)));
});

// ---- NBA ----

const SQ = ['Boston Celtics', 'New York Knicks', 'Miami Heat', 'Chicago Bulls'];
function storico() {
  const out = [];
  let k = 0;
  for (const s of [2025, 2026]) {
    SQ.forEach((a, i) => SQ.forEach((b, j) => {
      if (a === b) return;
      k++;
      const giorno = s === 2026 ? 1 + (k % 15) : 1 + (k % 27);
      out.push({ id: k, dataUsa: s === 2026 ? `2026-10-${String(giorno).padStart(2, '0')}` : `2026-03-${String(giorno).padStart(2, '0')}`, inizio: null, casa: a, trasferta: b, puntiCasa: 105 + ((i + k) % 12), puntiTrasferta: 100 + ((j + 2 * k) % 12), finita: true, stagione: s, postseason: false });
    }));
  }
  // Partita di oggi non ancora giocata: il calendario della giornata con cui si controlla la copertura di odss.
  out.push({ id: 999, dataUsa: '2026-10-20', inizio: '2026-10-21T01:30:00+02:00', casa: 'Boston Celtics', trasferta: 'New York Knicks', puntiCasa: null, puntiTrasferta: null, finita: false, stagione: 2026, postseason: false });
  return out;
}
const conMeta = (arr) => {
  Object.defineProperty(arr, 'nonRiconosciute', { value: [], enumerable: false });
  Object.defineProperty(arr, 'diagnostica', { value: { lineaMancante: { handicap: 0, totale: 0 }, quoteNonConvertibili: 0, handicapAsimmetrico: 0 }, enumerable: false });
  return arr;
};
function fontiNba({ fetch } = {}) {
  const chiamate = { sgo: 0 };
  const b = (k) => ({ chiave: k, mercati: { vincente: { casa: 1.55, trasferta: 2.5 }, handicap: { '-4.5': { casa: 1.91, trasferta: 1.91 } }, totale: { '221.5': { over: 1.9, under: 1.92 } } } });
  return {
    chiamate,
    fetchOdss: fetch,
    sportsgameodds: { eventi: async () => { chiamate.sgo++; return conMeta([{ id: 's1', casa: 'Boston Celtics', trasferta: 'New York Knicks', inizio: '2026-10-21T01:30:00+02:00', bookmaker: [b('a'), b('b'), b('c')] }]); } },
    balldontlie: { partite: async (x) => conMeta(storico().filter((p) => p.stagione === x.stagioni[0])) },
  };
}
const NBA_ODSS = () => [[
  ...righe({ casa: 'Boston Celtics', trasferta: 'New York Knicks', inizio: '2026-10-20T23:30:00Z', league: 'NBA', ml: [1.55, 2.5], ou: 221.5 }),
  // Stessa partita da un'altra fonte del feed (altro event_id, altro nome del campionato): bookmaker uniti.
  rigaOdss({ sport: 'basket', league: 'USA ~ NBA', event_id: 'b2', home_team: 'Boston Celtics', away_team: 'New York Knicks', commence_time: '2026-10-20T23:30:00Z', market: 'moneyline', bookmakers: [bkOdss('goldbet', { HOME: 1.57, AWAY: 2.45 })] }),
  // WNBA: squadre non NBA, ignorata.
  ...righe({ casa: 'Las Vegas Aces', trasferta: 'New York Liberty', inizio: '2026-10-20T23:30:00Z', league: 'WNBA', event_id: 'w9' }),
]];

test('NBA con odss: partite e quote da odss (league "nba"), Pinnacle per la probabilità, SportsGameOdds non chiamato', async () => {
  const dir = temp();
  const f = fetchOdss({ 'basket|moneyline,ah,ou': NBA_ODSS() });
  const fo = fontiNba({ fetch: f });
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso: new Date('2026-10-20T05:07:00Z'), fonti: fo, chiavi: { balldontlie: 'B', sportsgameodds: 'S', odss: CHIAVE }, dirData: dir });
  assert.equal(f.chiamate.length, 1);
  assert.equal(new URL(f.chiamate[0].url).searchParams.get('league'), 'nba');
  assert.equal(fo.chiamate.sgo, 0);
  assert.equal(r.partite.length, 1);
  const p = r.partite[0];
  assert.equal(p.partita, 'Boston Celtics - New York Knicks');
  const v = p.mercati.find((m) => m.mercato === 'Vincente' && m.selezione === 'Boston Celtics');
  assert.equal(v.fonteQuota, 'mediana di 5 bookmaker (odss-api)');
  assert.ok(Math.abs(v.probPinnacle - (1 / 1.55) / (1 / 1.55 + 1 / 2.5)) < 1e-9);
  assert.equal(v.etichettaMercato, undefined);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'stato', 'odss.json'), 'utf8')).giornate['2026-10-20'].perSport, { nba: 1 });
});

test('NBA: odss senza partite NBA → SportsGameOdds come prima; nessuna partita nel calendario (fuori stagione) → nessuna richiesta a odss', async () => {
  let f = fetchOdss({ 'basket|moneyline,ah,ou': [[]] });
  let fo = fontiNba({ fetch: f });
  let r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso: new Date('2026-10-20T05:07:00Z'), fonti: fo, chiavi: { balldontlie: 'B', sportsgameodds: 'S', odss: CHIAVE }, dirData: temp() });
  assert.equal(fo.chiamate.sgo, 1);
  assert.equal(r.partite[0].mercati[0].fonteQuota, 'mediana di 3 bookmaker (SportsGameOdds)');
  assert.ok(r.erroriGiro.some((e) => /nessuna partita NBA su odss-api.*SportsGameOdds/.test(e)), r.erroriGiro.join(' | '));
  f = fetchOdss({});
  fo = fontiNba({ fetch: f });
  r = await eseguiRaccoltaNba({ data: '2026-08-10', adesso: new Date('2026-08-10T05:07:00Z'), fonti: fo, chiavi: { balldontlie: 'B', sportsgameodds: 'S', odss: CHIAVE }, dirData: temp() });
  assert.equal(f.chiamate.length, 0);
});

test('workflow: ODSS_API_KEY agli step della raccolta NBA e basket', () => {
  const w = readFileSync('.github/workflows/raccolta.yml', 'utf8');
  const step = w.split('\n      - ').filter((s) => s.includes('ODSS_API_KEY')).map((s) => /run: (npm run [\w-]+)/.exec(s)?.[1]);
  assert.ok(step.includes('npm run raccolta-nba'));
  assert.ok(step.includes('npm run raccolta-basket'));
});

test('basket: campionato coperto solo in parte da odss → The Odds API per le partite che mancano, mai sopra odss', async () => {
  const f = fetchOdss({ 'basket|moneyline,ah,ou': [righe({ casa: 'Real Madrid', trasferta: 'Barcelona', inizio: '2026-10-21T18:45:00Z', league: 'Euroleague' })] });
  const due = { basketball_euroleague: [...EL.basketball_euroleague, { id: 'y', casa: 'Olimpia Milano', trasferta: 'Virtus Bologna', inizio: '2026-10-21T19:00:00Z' }] };
  const fo = fontiBasket({ fetch: f, eventi: due });
  const r = await eseguiRaccoltaBasket({ data: '2026-10-21', adesso, fonti: fo, chiavi: { oddsApi: 'K', odss: CHIAVE }, dirData: temp(), pausaMs: 0 });
  assert.ok(fo.chiamate.includes('quote basketball_euroleague'));
  const v = (p) => r.partite.find((x) => x.partita === p).mercati[0];
  assert.equal(v('Real Madrid - FC Barcelona').fonteQuota, 'mediana di 4 bookmaker (odss-api)');
  assert.equal(v('Olimpia Milano - Virtus Bologna').fonteQuota, 'mediana di 3 bookmaker (The Odds API)');
  assert.equal(r.partite.length, 2);
  assert.ok(r.erroriGiro.some((e) => /Eurolega: 1 partite su 2 non trovate su odss-api, quote da The Odds API/.test(e)), r.erroriGiro.join(' | '));
});
