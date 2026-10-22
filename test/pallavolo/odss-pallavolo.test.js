// odss-api fonte principale delle quote della pallavolo [utente, 22/10/2026]: una richiesta (moneyline e ou della
// giornata) se c'è almeno un campionato attivo; squadre abbinate con lo storico di un solo campionato (maschile o
// femminile), vincente = moneyline, totale set = ou 3.5 (le linee dei punti, 130+, mai). L'handicap di odss non si usa:
// il feed non distingue set e punti (odss-api lo dice: "safe_note"). Se odss non risponde, o non ha partite, OddsPapi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiRaccoltaPallavolo } from '../../src/pallavolo/raccolta.js';
import { leggiQuote } from '../../src/pallavolo/fonti/oddspapi.js';
import { fetchOdss, rigaOdss, bkOdss } from '../odss/aiuti.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const adesso = new Date('2026-10-21T05:40:00Z');
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'odss-pallavolo-')); mkdirSync(join(d, 'raccolta'), { recursive: true }); return d; };
const INIZIO = '2026-10-21T18:30:00.000Z';

function storicoSuperlega() {
  const sq = [['136630', 'Trentino Volley'], ['136629', 'Volley Perugia'], ['136632', 'Volley Lube'], ['137441', 'Verona Volley']];
  const out = { 2025: {}, 2026: {} };
  let k = 0;
  for (const [stagione, giri] of [[2025, 4], [2026, 2]]) {
    for (let g = 1; g <= giri; g++) {
      out[stagione][g] = [];
      for (let i = 0; i < sq.length; i++) for (let j = 0; j < sq.length; j++) {
        if (i === j) continue;
        k++;
        const [sc, st] = i < j ? [3, (k % 3)] : [(k % 3), 3];
        out[stagione][g].push({
          id: String(k), stagione, giornata: g, idCasa: sq[i][0], idTrasferta: sq[j][0], casa: sq[i][1], trasferta: sq[j][1],
          inizio: stagione === 2025 ? `2026-0${g}-1${i}T18:00:00.000Z` : `2026-10-${String(5 + g * 3 + i).padStart(2, '0')}T18:00:00.000Z`,
          puntiCasa: sc, puntiTrasferta: st, finita: true, postseason: false,
        });
      }
    }
  }
  return out;
}
function fonti({ fetch } = {}) {
  const st = storicoSuperlega();
  const chiamate = [];
  const b = { v: [1.3, 3.5] };
  return {
    chiamate,
    fetchOdss: fetch,
    thesportsdb: { round: async (s, g, opz, lega) => ({ partite: lega === 4544 ? st[s]?.[g] ?? [] : [], scartate: 0 }) },
    oddspapi: {
      conto: async () => ({ limite: 250, usate: 10 }),
      partite: async () => { chiamate.push('partite'); return [{ id: 'f1', torneo: 517, casa: 'Itas Trentino', trasferta: 'Rana Verona', inizio: INIZIO, stato: 0 }]; },
      quote: async (id) => {
        chiamate.push(`quote ${id}`);
        const o = (x, y) => ({ players: { 0: { price: x } } , y });
        const libro = { markets: { 231: { outcomes: { 231: o(b.v[0]), 232: o(b.v[1]) } } } };
        return leggiQuote({ bookmakerOdds: { pinnacle: libro, a: libro, c: libro } });
      },
    },
  };
}
const libri = ['pinnacle', 'snai', 'bwin', 'bet365'];
const RIGHE = () => [
  rigaOdss({ sport: 'volley', league: 'Italy, SuperLega', event_id: 'v1', home_team: 'Itas Trentino', away_team: 'Rana Verona', commence_time: INIZIO, market: 'moneyline',
    bookmakers: libri.map((k, i) => bkOdss(k, { HOME: 1.3 + i * 0.01, AWAY: 3.5 - i * 0.05 })) }),
  rigaOdss({ sport: 'volley', league: 'Italy, SuperLega', event_id: 'v1', home_team: 'Itas Trentino', away_team: 'Rana Verona', commence_time: INIZIO, market: 'ou', line: 3.5,
    bookmakers: libri.map((k) => bkOdss(k, { OVER: 1.75, UNDER: 2 })) }),
  // Totale punti: mai preso per un totale set.
  rigaOdss({ sport: 'volley', league: 'Italy, SuperLega', event_id: 'v1', home_team: 'Itas Trentino', away_team: 'Rana Verona', commence_time: INIZIO, market: 'ou', line: 180.5,
    bookmakers: libri.map((k) => bkOdss(k, { OVER: 1.9, UNDER: 1.9 })) }),
  // Partita femminile con nomi che somigliano a squadre maschili: fuori (la SuperLega è maschile).
  rigaOdss({ sport: 'volley', league: 'A1, Women', event_id: 'v2', home_team: 'Trentino Volley', away_team: 'Volley Perugia', commence_time: INIZIO, market: 'moneyline',
    bookmakers: libri.map((k) => bkOdss(k, { HOME: 1.5, AWAY: 2.5 })) }),
];

test('pallavolo con odss: una richiesta, vincente e totale set da odss, niente OddsPapi, bet365 accanto alla mediana', async () => {
  const dir = temp();
  const f = fetchOdss({ 'volley|moneyline,ou': [RIGHE()] });
  const fo = fonti({ fetch: f });
  const r = await eseguiRaccoltaPallavolo({ data: '2026-10-21', adesso, fonti: fo, chiavi: { oddspapi: 'K', odss: CHIAVE }, dirData: dir, pausaMs: 0 });
  assert.equal(f.chiamate.length, 1);
  assert.equal(new URL(f.chiamate[0].url).searchParams.get('market'), 'moneyline,ou');
  assert.deepEqual(fo.chiamate, []);
  assert.equal(r.partite.length, 1);
  const p = r.partite[0];
  assert.equal(p.partita, 'Itas Trentino - Rana Verona');
  assert.deepEqual(p.mercati.map((m) => `${m.mercato} | ${m.selezione}`), ['Vincente | Itas Trentino', 'Vincente | Rana Verona', 'Totale set 3.5 | Over 3.5', 'Totale set 3.5 | Under 3.5']);
  const v = p.mercati[0];
  assert.equal(v.quotaBet365, 1.33);
  assert.equal(v.fonteQuota, 'mediana di 4 bookmaker (odss-api)');
  assert.ok(Math.abs(v.probPinnacle - (1 / 1.3) / (1 / 1.3 + 1 / 3.5)) < 1e-9);
  assert.equal(p.mercati[2].quota, 1.75);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'stato', 'odss.json'), 'utf8')).perSport, { pallavolo: 1 });
});

test('pallavolo: odss in errore o senza partite → OddsPapi come prima, con una riga chiara', async () => {
  let fo = fonti({ fetch: fetchOdss({}, { status: 403 }) });
  let r = await eseguiRaccoltaPallavolo({ data: '2026-10-21', adesso, fonti: fo, chiavi: { oddspapi: 'K', odss: CHIAVE }, dirData: temp(), pausaMs: 0 });
  assert.deepEqual(fo.chiamate, ['partite', 'quote f1']);
  assert.ok(r.erroriGiro.some((e) => /odss-api.*chiave rifiutata/.test(e)));
  assert.ok(r.erroriGiro.some((e) => /pallavolo.*OddsPapi/.test(e)), r.erroriGiro.join(' | '));
  fo = fonti({ fetch: fetchOdss({ 'volley|moneyline,ou': [[]] }) });
  r = await eseguiRaccoltaPallavolo({ data: '2026-10-21', adesso, fonti: fo, chiavi: { oddspapi: 'K', odss: CHIAVE }, dirData: temp(), pausaMs: 0 });
  assert.deepEqual(fo.chiamate, ['partite', 'quote f1']);
  assert.equal(r.partite[0].mercati[0].fonteQuota, 'mediana di 3 bookmaker (OddsPapi)');
});

test('workflow: ODSS_API_KEY allo step della raccolta pallavolo', () => {
  const w = readFileSync('.github/workflows/raccolta.yml', 'utf8');
  const step = w.split('\n      - ').filter((s) => s.includes('ODSS_API_KEY')).map((s) => /run: (npm run [\w-]+)/.exec(s)?.[1]);
  assert.ok(step.includes('npm run raccolta-pallavolo'));
});
