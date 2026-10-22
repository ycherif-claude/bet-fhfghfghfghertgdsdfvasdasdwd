// odss-api fonte principale delle quote del tennis [utente, 22/10/2026]: una richiesta (moneyline della giornata)
// solo se ci sono partite, giocatori abbinati per cognome e iniziale (anche invertiti), mediana e Pinnacle come
// prima. Se odss non risponde, o non ha il torneo, il torneo torna a The Odds API con una riga in erroriGiro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiRaccoltaTennis } from '../../src/tennis/raccolta.js';
import { eventiOdssSport } from '../../src/odss/sport.js';
import { fetchOdss, rigaOdss, bkOdss } from '../odss/aiuti.js';

const DATA = '2026-10-20';
const adesso = new Date('2026-10-20T05:35:00Z');
const CHIAVE = 'CHIAVE-SEGRETA-123';
const INIZIO = '2026-10-20T12:00:00Z';
const PARIGI = { chiave: 'tennis_atp_paris_masters', titolo: 'ATP Paris Masters', circuito: 'atp' };

function storico() {
  const g = ['Sinner J.', 'Alcaraz C.', 'Zverev A.', 'Rune H.'];
  const out = [];
  let k = 0;
  for (let giro = 0; giro < 4; giro++) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    k++;
    out.push({ data: `2026-${String(1 + (k % 9)).padStart(2, '0')}-10`, torneo: 'Paris Masters', luogo: 'Paris', superficie: 'cemento', bestOf: 3, vincitore: g[i], perdente: g[j], setW: [6, 6], setL: [3, 4] });
  }
  out.at(-1).data = '2026-10-19';
  return out;
}

function fonti({ fetch } = {}) {
  const chiamate = { quote: [] };
  return {
    chiamate,
    fetchOdss: fetch,
    oddsTennis: {
      torneiAttivi: async () => [PARIGI],
      eventi: async () => ({ eventi: [{ id: 'x1', giocatore1: 'Jannik Sinner', giocatore2: 'Carlos Alcaraz', inizio: INIZIO }], rimasti: 294 }),
      quote: async (chiave) => {
        chiamate.quote.push(chiave);
        const b = (k, a, c) => ({ chiave: k, aggiornato: 'T', quote: { 'Jannik Sinner': a, 'Carlos Alcaraz': c } });
        return { eventi: [{ id: 'x1', giocatore1: 'Jannik Sinner', giocatore2: 'Carlos Alcaraz', inizio: INIZIO, bookmaker: [b('pinnacle', 1.8, 2.05), b('a', 1.83, 2), b('b', 1.85, 1.95)] }], rimasti: 293 };
      },
    },
    tennisData: { partite: async (anno) => (anno === 2026 ? storico() : []) },
  };
}
const dir = () => { const d = mkdtempSync(join(tmpdir(), 'odss-tennis-')); mkdirSync(join(d, 'raccolta'), { recursive: true }); return d; };
const ml = (k, h, a) => bkOdss(k, { HOME: h, AWAY: a });
// Evento odss con i giocatori invertiti e nel formato "Cognome I.".
const RIGHE = [rigaOdss({ sport: 'tennis', league: 'ATP Parigi', event: 'Alcaraz C. - Sinner J.', home_team: 'Alcaraz C.', away_team: 'Sinner J.', commence_time: INIZIO, market: 'moneyline',
  bookmakers: [ml('pinnacle', 2.1, 1.78), ml('snai', 2.05, 1.8), ml('bwin', 2, 1.82), ml('unibet', 2.02, 1.81)] })];

test('tennis con odss: una richiesta, quote per giocatore (evento invertito), mediana e Pinnacle, niente crediti', async () => {
  const d = dir();
  const f = fetchOdss({ 'tennis|moneyline': [RIGHE] });
  const fo = fonti({ fetch: f });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: fo, chiavi: { oddsApi: 'K', odss: CHIAVE }, dirData: d });
  assert.equal(f.chiamate.length, 1);
  const u = new URL(f.chiamate[0].url);
  assert.equal(u.searchParams.get('sport'), 'tennis');
  assert.equal(u.searchParams.get('market'), 'moneyline');
  assert.deepEqual(fo.chiamate.quote, []);
  assert.equal(r.crediti.usati, 0);
  const p = r.partite[0];
  const m = p.mercati.find((x) => x.selezione === 'Jannik Sinner');
  assert.equal(m.quota, 1.8);
  assert.equal(m.fonteQuota, 'mediana di 4 bookmaker (odss-api)');
  assert.ok(Math.abs(m.probPinnacle - (1 / 1.78) / (1 / 1.78 + 1 / 2.1)) < 1e-9);
  const stato = JSON.parse(readFileSync(join(d, 'stato', 'odss.json'), 'utf8'));
  assert.deepEqual(stato.giornate['2026-10-20'].perSport, { tennis: 1 });
  assert.ok(!JSON.stringify(r).includes(CHIAVE));
});

test('tennis: odss in errore (401) o senza il torneo → The Odds API come prima, con una riga chiara', async () => {
  let fo = fonti({ fetch: fetchOdss({}, { status: 401 }) });
  let r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: fo, chiavi: { oddsApi: 'K', odss: CHIAVE }, dirData: dir() });
  assert.deepEqual(fo.chiamate.quote, [PARIGI.chiave]);
  assert.equal(r.partite[0].mercati[0].fonteQuota, 'mediana di 3 bookmaker (The Odds API)');
  assert.ok(r.erroriGiro.some((e) => /odss-api.*chiave rifiutata/.test(e)), r.erroriGiro.join(' | '));
  assert.ok(r.erroriGiro.some((e) => /ATP Paris Masters.*The Odds API/.test(e)), r.erroriGiro.join(' | '));
  fo = fonti({ fetch: fetchOdss({ 'tennis|moneyline': [[{ ...RIGHE[0], home_team: 'Rune H.', away_team: 'Zverev A.' }]] }) });
  r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: fo, chiavi: { oddsApi: 'K', odss: CHIAVE }, dirData: dir() });
  assert.deepEqual(fo.chiamate.quote, [PARIGI.chiave]);
  // Senza la chiave odss (secret mancante): The Odds API e una riga.
  fo = fonti({ fetch: fetchOdss({}) });
  r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: fo, chiavi: { oddsApi: 'K', odss: undefined }, dirData: dir() });
  assert.deepEqual(fo.chiamate.quote, [PARIGI.chiave]);
  assert.ok(r.erroriGiro.some((e) => /ODSS_API_KEY/.test(e)));
});

test('sport senza partite oggi: nessuna richiesta a odss', async () => {
  const f = fetchOdss({});
  const r = await eventiOdssSport({ dirData: dir(), data: DATA, adesso, chiave: CHIAVE, sport: 'tennis', gruppi: ['moneyline'], finestra: { da: adesso, a: adesso }, fetch: f, partite: 0 });
  assert.equal(f.chiamate.length, 0);
  assert.deepEqual(r.eventi, []);
});

test('tennis: torneo coperto solo in parte da odss → The Odds API per le partite che mancano, mai sopra odss', async () => {
  const fo = fonti({ fetch: fetchOdss({ 'tennis|moneyline': [RIGHE] }) });
  const due = [{ id: 'x1', giocatore1: 'Jannik Sinner', giocatore2: 'Carlos Alcaraz', inizio: INIZIO }, { id: 'x2', giocatore1: 'Alexander Zverev', giocatore2: 'Holger Rune', inizio: INIZIO }];
  fo.oddsTennis.eventi = async () => ({ eventi: due, rimasti: 294 });
  fo.oddsTennis.quote = async (chiave) => {
    fo.chiamate.quote.push(chiave);
    const b = (k, e) => ({ chiave: k, aggiornato: 'T', quote: { [e.giocatore1]: 1.7, [e.giocatore2]: 2.2 } });
    return { eventi: due.map((e) => ({ ...e, bookmaker: [b('pinnacle', e), b('a', e), b('b', e)] })), rimasti: 293 };
  };
  const dir = mkdtempSync(join(tmpdir(), 'odss-tennis-'));
  mkdirSync(join(dir, 'raccolta'), { recursive: true });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: fo, chiavi: { oddsApi: 'K', odss: CHIAVE }, dirData: dir });
  assert.deepEqual(fo.chiamate.quote, [PARIGI.chiave]);
  const m = (g) => r.partite.flatMap((p) => p.mercati).find((x) => x.selezione === g);
  assert.equal(m('Jannik Sinner').fonteQuota, 'mediana di 4 bookmaker (odss-api)');
  assert.equal(m('Alexander Zverev').fonteQuota, 'mediana di 3 bookmaker (The Odds API)');
  assert.ok(r.erroriGiro.some((e) => /ATP Paris Masters: 1 partite su 2 non trovate su odss-api, quote da The Odds API/.test(e)), r.erroriGiro.join(' | '));
});
