// Controlli con odss per event_id [correzioni 24/10/2026, punto 4]. Il 24/10 il primo passaggio dei controlli
// chiedeva calcio e mercati di una finestra di ore attorno alle partite ("1x2,ou: quote incomplete (le altre pagine
// superano il budget di oggi)") e le 3 richieste del giorno finivano al mattino. Ora ogni passaggio fa al massimo una
// richiesta, solo per gli event_id delle partite da controllare in quel passaggio (tutti gli sport e i mercati
// insieme, senza finestra: una pagina), presi dalle raccolte del mattino (calcio: data/raccolta/<data>-odss.json;
// gli altri sport: `idOdss` delle partite in data/raccolta/<data>-<sport>.json). Tetto: 4 al giorno.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quoteFresche } from '../../src/controlli/quote.js';
import { eventiOdss } from '../../src/calcio/odss.js';
import { risposta, rigaOdss, bkOdss, RESET } from '../odss/aiuti.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const DATA = '2026-10-24';
const adesso = new Date('2026-10-24T17:30:00Z');
const finestra = { da: new Date('2026-10-24T06:00:00Z'), a: new Date('2026-10-25T06:00:00Z') };
const AGG = '2026-10-24T17:20:00+00:00';
const bk = (k, o) => bkOdss(k, o, { last_update: AGG });
const libri = ['pinnacle', 'snai', 'bwin', 'unibet'];

const RIGHE = [
  rigaOdss({ event_id: 'c1', home_team: 'Torino', away_team: 'Monza', commence_time: '2026-10-24T18:45:00Z', market: '1x2', bookmakers: libri.map((k) => bk(k, { HOME: 2.1, DRAW: 3.3, AWAY: 3.6 })) }),
  // Lo stesso Torino - Monza da un'altra fonte del feed (evento doppio, unito al mattino).
  rigaOdss({ event_id: 'c2', home_team: 'Torino FC', away_team: 'AC Monza', commence_time: '2026-10-24T18:45:00Z', market: '1x2', bookmakers: ['goldbet'].map((k) => bk(k, { HOME: 2.15, DRAW: 3.2, AWAY: 3.5 })) }),
  rigaOdss({ event_id: 'n1', sport: 'basket', league: 'NBA', home_team: 'Charlotte Hornets', away_team: 'Miami Heat', commence_time: '2026-10-24T22:00:00Z', market: 'moneyline', bookmakers: libri.map((k) => bk(k, { HOME: 2.3, AWAY: 1.65 })) }),
  rigaOdss({ event_id: 'zz', home_team: 'Altra', away_team: 'Partita', commence_time: '2026-10-24T18:45:00Z', market: '1x2', bookmakers: libri.map((k) => bk(k, { HOME: 2, DRAW: 3, AWAY: 4 })) }),
];
function fetchEventi(righe) {
  const chiamate = [];
  const f = async (url) => {
    chiamate.push(String(url));
    const u = new URL(String(url));
    const ids = u.searchParams.get('event_id')?.split(',') ?? null;
    const mercati = u.searchParams.get('market').split(',');
    const odds = righe.filter((r) => mercati.includes(r.market) && (!ids || ids.includes(r.event_id)));
    return risposta(200, { count: odds.length, offset: 0, returned: odds.length, odds }, { 'x-ratelimit-remaining': '400', 'x-ratelimit-limit': '500', 'x-ratelimit-reset': String(RESET) });
  };
  f.chiamate = chiamate;
  return f;
}
function cartella() {
  const d = mkdtempSync(join(tmpdir(), 'odss-eventi-'));
  mkdirSync(join(d, 'raccolta'), { recursive: true });
  // Mattino: calcio completato (il doppio c1,c2 unito), NBA con gli id dell'evento.
  writeFileSync(join(d, 'raccolta', `${DATA}-odss.json`), JSON.stringify({ data: DATA, eventi: [
    { ...eventiOdss([RIGHE[0]])[0], id: 'c1,c2' }, eventiOdss([RIGHE[3]])[0],
  ] }));
  writeFileSync(join(d, 'raccolta', `${DATA}-nba.json`), JSON.stringify({ data: DATA, partite: [
    { idPartita: 'nba-2026-10-24-charlotte-hornets-miami-heat', partita: 'Charlotte Hornets - Miami Heat', idOdss: ['n1'] },
  ] }));
  return d;
}
const voceCalcio = { id: 'v1', sport: 'calcio', competizione: 'Serie A', partita: 'Torino - Monza', idPartita: 'calcio-x', inizio: '2026-10-24T20:45:00+02:00', mercato: '1X2', selezione: '1' };
const voceNba = { id: 'v2', sport: 'nba', competizione: 'NBA', partita: 'Charlotte Hornets - Miami Heat', idPartita: 'nba-2026-10-24-charlotte-hornets-miami-heat', inizio: '2026-10-25T00:00:00+02:00', mercato: 'Vincente', selezione: 'Charlotte Hornets' };
const voceTennis = { id: 'v3', sport: 'tennis', competizione: 'ATP Vienna', partita: 'Jannik Sinner - Carlos Alcaraz', idPartita: 'tennis-x', inizio: '2026-10-24T19:00:00+02:00', mercato: 'Vincente', selezione: 'Jannik Sinner' };
const fonti = (fetch) => ({ fetchOdss: fetch, oddsTennis: { torneiAttivi: async () => [] }, sportsgameodds: { eventi: async () => [] } });
const opz = (fo, d, extra = {}) => ({ fonti: fo, chiavi: { odss: CHIAVE, oddsApi: 'K', sportsgameodds: 'S' }, finestra, errore: () => {}, dirData: d, data: DATA, adesso, ...extra });

test('controlli: una richiesta con i soli event_id delle partite del passaggio, tutti gli sport e i mercati, senza finestra', async () => {
  const d = cartella();
  const f = fetchEventi(RIGHE);
  const out = await quoteFresche([voceCalcio, voceNba, voceTennis], opz(fonti(f), d));
  assert.equal(f.chiamate.length, 1);
  const u = new URL(f.chiamate[0]);
  assert.deepEqual(u.searchParams.get('event_id').split(',').sort(), ['c1', 'c2', 'n1']);
  assert.equal(u.searchParams.get('sport'), 'calcio,basket');
  assert.equal(u.searchParams.get('market'), '1x2,dc,ou,moneyline,ah');
  assert.equal(u.searchParams.has('commence_from'), false);
  assert.ok(!f.chiamate[0].includes(CHIAVE));
  // Torino - Monza: i bookmaker dei due eventi uniti (4 + goldbet).
  assert.equal(out.get('v1').n, 5);
  assert.equal(out.get('v2').quota, 2.3);
  // Il tennis non ha id del mattino: alle fonti di prima (qui nessun torneo attivo → assente).
  assert.deepEqual(out.get('v3'), { assente: true });
  const stato = JSON.parse(readFileSync(join(d, 'stato', 'odss.json'), 'utf8'));
  assert.equal(stato.giornate[DATA].controlli, 1);
});

test('controlli: nessun event_id noto → nessuna richiesta a odss; tetto di 4 al giorno', async () => {
  const d = cartella();
  let f = fetchEventi(RIGHE);
  await quoteFresche([voceTennis], opz(fonti(f), d));
  assert.equal(f.chiamate.length, 0);
  for (let i = 0; i < 5; i++) {
    f = fetchEventi(RIGHE);
    await quoteFresche([voceNba], opz(fonti(f), d));
    assert.equal(f.chiamate.length, i < 4 ? 1 : 0, `passaggio ${i + 1}`);
  }
});
