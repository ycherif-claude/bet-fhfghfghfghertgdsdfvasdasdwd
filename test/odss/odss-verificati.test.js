// Mapping verificati sul feed vero di odss-api per basket, tennis e pallavolo (data/collaudo/odss-sport.json,
// 23/10/2026): nomi dei campionati esatti (le sottostringhe portano femminili e altri paesi), linee alternative con
// prezzi assurdi o da un lato solo, handicap dal lato della casa, tennis "Cognome, Nome" senza doppi né ITF,
// handicap set della pallavolo da "other:set_handicap" solo con esiti HOME/AWAY. Niente rete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eventiDaRighe, inFormatoNba, legaAmmessa, tennisSingolare } from '../../src/odss/eventi.js';
import { CAMPIONATI } from '../../src/basket/raccolta.js';
import { eseguiRaccoltaBasket } from '../../src/basket/raccolta.js';
import { LEGHE_NBA } from '../../src/nba/raccolta.js';
import { CAMPIONATI_PALLAVOLO } from '../../src/pallavolo/campionati.js';
import { normalizzaGiocatore } from '../../src/tennis/giocatori.js';
import { stessoGiocatore } from '../../src/tennis/raccolta.js';
import { abbinaEventiOdss } from '../../src/calcio/odss.js';
import { aggiornaEsitiPallavolo } from '../../src/pallavolo/esiti.js';
import { fetchOdss, rigaOdss, bkOdss } from './aiuti.js';

const COLLAUDO = JSON.parse(readFileSync('data/collaudo/odss-sport.json', 'utf8')).sport;
const CHIAVE = 'CHIAVE-SEGRETA-123';
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'odss-ver-')); mkdirSync(join(d, 'raccolta'), { recursive: true }); return d; };

test('collaudo: le righe principali di basket, tennis e pallavolo sono scope "match", period "full_time"', () => {
  for (const s of ['basket NBA', 'basket Eurolega', 'basket NBL', 'tennis', 'volley']) {
    assert.ok(COLLAUDO[s].mercatiPeriodi.includes('moneyline|match|full_time'), s);
  }
  // Basket: moneyline/ah/ou a tempo intero senza pareggio, e a parte il 1x2 dei tempi regolamentari: supplementari compresi.
  assert.ok(COLLAUDO['basket Eurolega'].mercatiPeriodi.includes('other:1x2_tempi_reg|match|full_time'));
  assert.ok(!COLLAUDO['basket Eurolega'].chiaviEsiti.includes('moneyline:DRAW'));
});

test('campionati: solo i nomi esatti ammessi (maschili, del paese giusto), maiuscole a parte', () => {
  const el = CAMPIONATI.find((c) => c.id === 'eurolega').legheOdss;
  const nbl = CAMPIONATI.find((c) => c.id === 'nbl').legheOdss;
  for (const l of COLLAUDO['basket Eurolega'].leghe) assert.ok(legaAmmessa(l, el), l);
  assert.ok(!legaAmmessa('Euroleague Women', el));
  assert.ok(!legaAmmessa('Eurolega - Donne', el));
  const leghe = COLLAUDO['basket NBL'].leghe.filter((l) => legaAmmessa(l, nbl));
  // "NBL" è anche il campionato ceco: lo distinguono le squadre (tabelle del basket), non il nome.
  assert.deepEqual(leghe, ['NBL']);
  assert.ok(legaAmmessa('NBA', LEGHE_NBA) && !legaAmmessa('WNBA', LEGHE_NBA) && !legaAmmessa('NBA - Fantasy Matches', LEGHE_NBA));
  const superlega = CAMPIONATI_PALLAVOLO.find((c) => c.id === 'superlega').legheOdss;
  const ammesse = COLLAUDO.volley.leghe.filter((l) => CAMPIONATI_PALLAVOLO.some((c) => legaAmmessa(l, c.legheOdss)));
  assert.ok(legaAmmessa('Superlega', superlega));
  for (const l of ['SV League, Women', 'Superliga, Women', 'Superliga (F)', 'Mestaruusliiga, Women', 'Pro League', 'Superliga']) assert.ok(!ammesse.includes(l), l);
  assert.ok(ammesse.includes('PlusLiga') && ammesse.includes('Serie A1 (F)') && ammesse.includes('1. Bundesliga'));
});

test('linee alternative: solo linee con entrambi i prezzi fra 1,01 e 20; linea principale = prezzi più vicini', () => {
  // NBA reale: Snai dà UNDER 195.5 a 33 e nessun OVER su molte linee.
  const nba = COLLAUDO['basket NBA'].esempi[0];
  // Una riga per linea con tutti i bookmaker (come il feed): Snai dal collaudo, gli altri inventati.
  const perLinea = new Map(nba.righe.filter((r) => r.market === 'ou').map((r) => [r.line, [bkOdss(r.mio.key, r.mio.outcomes)]]));
  const aggiungi = (k, linee) => { for (const [l, o, u] of linee) perLinea.set(l, [...(perLinea.get(l) ?? []), bkOdss(k, { OVER: o, UNDER: u })]); };
  aggiungi('bwin', [[218.5, 1.6, 2.3], [220.5, 1.9, 1.9], [222.5, 2.3, 1.6], [240.5, 25, 1.005]]);
  aggiungi('unibet', [[218.5, 1.62, 2.25], [220.5, 1.88, 1.92], [222.5, 2.25, 1.62]]);
  aggiungi('pinnacle', [[218.5, 1.63, 2.3], [220.5, 1.91, 1.93], [222.5, 2.3, 1.63]]);
  const base = { event_id: 'n1', sport: 'basket', league: nba.lega, home_team: nba.casa, away_team: nba.trasferta, commence_time: nba.inizio };
  const righe = [...perLinea].map(([line, bookmakers]) => rigaOdss({ ...base, market: 'ou', line, bookmakers }));
  const ml = nba.righe.find((r) => r.market === 'moneyline');
  righe.push(rigaOdss({ ...base, market: 'moneyline', bookmakers: [bkOdss('snai', ml.mio.outcomes), bkOdss('pinnacle', ml.pinnacle)] }));
  const [ev] = eventiDaRighe(righe);
  const f = inFormatoNba(ev);
  const totali = f.bookmaker.filter((b) => b.mercati.totale).map((b) => Object.keys(b.mercati.totale));
  assert.ok(totali.every((l) => l.length === 1 && l[0] === '220.5'), JSON.stringify(totali));
  assert.ok(!f.bookmaker.find((b) => b.chiave === 'snai')?.mercati.totale);
});

test('handicap dal lato della casa: Zalgiris -9.5 favorito in casa (collaudo) resta, con le quote giuste', () => {
  const z = COLLAUDO['basket Eurolega'].esempi.find((e) => e.casa.startsWith('Zalgiris'));
  const ml = z.righe.find((r) => r.market === 'moneyline' && r.period === 'full_time');
  const ah = z.righe.find((r) => r.market === 'ah' && r.line === -9.5);
  const base = { event_id: 'z1', sport: 'basket', league: z.lega, home_team: z.casa, away_team: z.trasferta, commence_time: z.inizio };
  const libri = ['daznbet', 'bwin', 'unibet'];
  const [ev] = eventiDaRighe([
    rigaOdss({ ...base, market: 'moneyline', bookmakers: libri.map((k) => bkOdss(k, ml.mio.outcomes)) }),
    rigaOdss({ ...base, market: 'ah', line: -9.5, bookmakers: libri.map((k) => bkOdss(k, ah.mio.outcomes)) }),
  ]);
  const f = inFormatoNba(ev);
  assert.equal(f.handicapScartato, false);
  assert.deepEqual(f.bookmaker[0].mercati.handicap, { '-9.5': { casa: 1.88, trasferta: 1.82 } });
});

test('Eurolega senza Pinnacle: consenso senza margine (almeno 3 bookmaker, exchange fuori), etichetta "Consenso bookmaker"', async () => {
  const p = COLLAUDO['basket Eurolega'].esempi.find((e) => e.casa === 'Paris Basketball');
  const inizio = p.inizio;
  const base = { event_id: 'p1', sport: 'basket', league: 'Košarka EUROLEAGUE', home_team: p.casa, away_team: p.trasferta, commence_time: inizio };
  const ml = [['snai', 2.6, 1.48], ['bwin', 2.55, 1.5], ['unibet', 2.5, 1.52], ['betfair_ex_eu', 4, 1.2]];
  const f = fetchOdss({ 'basket|moneyline,ah,ou': [[
    rigaOdss({ ...base, market: 'moneyline', bookmakers: ml.map(([k, h, a]) => bkOdss(k, { HOME: h, AWAY: a }, k.includes('betfair') ? { is_exchange: true } : {})) }),
    // Stessa ora, Eurolega femminile: mai.
    rigaOdss({ ...base, event_id: 'p2', league: 'Euroleague Women', market: 'moneyline', bookmakers: ml.map(([k]) => bkOdss(k, { HOME: 9, AWAY: 1.05 })) }),
  ]] });
  const fonti = {
    fetchOdss: f,
    eurolega: { giornata: async () => ({ partite: [], scartate: 0 }) },
    thesportsdb: { round: async () => ({ partite: [], scartate: 0 }) },
    oddsBasket: { eventi: async (c) => ({ eventi: c === 'basketball_euroleague' ? [{ id: 'x', casa: 'Paris Basketball', trasferta: 'Valencia Basket', inizio }] : [], rimasti: 300 }), quote: async () => { throw new Error('non deve servire'); } },
  };
  const r = await eseguiRaccoltaBasket({ data: '2026-10-23', adesso: new Date('2026-10-23T05:40:00Z'), fonti, chiavi: { oddsApi: 'K', odss: CHIAVE }, dirData: temp(), pausaMs: 0 });
  const v = r.partite[0].mercati.find((m) => m.selezione === 'Paris Basketball');
  assert.equal(v.etichettaMercato, 'Consenso bookmaker');
  assert.equal(v.fonteQuota, 'mediana di 3 bookmaker (odss-api)');
  const pr = (h, a) => (1 / h) / (1 / h + 1 / a);
  assert.ok(Math.abs(v.probPinnacle - (pr(2.6, 1.48) + pr(2.55, 1.5) + pr(2.5, 1.52)) / 3) < 1e-9);
});

test('tennis: "Cognome, Nome" come "Nome Cognome"; doppi, ITF, M25 e W15 fuori; campionato assente ammesso', () => {
  assert.deepEqual(normalizzaGiocatore('Khomutsianskaya, Daria'), { cognome: 'khomutsianskaya', iniziale: 'd' });
  assert.ok(stessoGiocatore('Sinner, Jannik', 'Jannik Sinner'));
  assert.ok(stessoGiocatore('Junhan Zhang', 'Zhang, Junhan'));
  const e = (campionato, casa = 'Sinner, Jannik', trasferta = 'Alcaraz, Carlos') => ({ campionato, casa, trasferta });
  assert.ok(tennisSingolare(e(null)));
  assert.ok(tennisSingolare(e('ATP Almaty, Kazakhstan Men Singles')));
  for (const l of ['WTA Ningbo, China, Women Doubles', 'ATP Almaty, Kazakhstan, Men Doubles', 'ITF Cina', 'M25 Mumbai', 'ITF W15 Sharm El Sheikh 2026', 'Doppio maschile']) assert.ok(!tennisSingolare(e(l)), l);
  assert.ok(!tennisSingolare(e(null, 'Bolelli S. / Vavassori A.', 'Granollers M. / Zeballos H.')));
});

test('pallavolo: handicap set da "other:set_handicap" solo con esiti HOME/AWAY e linea ±1.5; "ah" (punti) mai', () => {
  const base = { event_id: 'v1', sport: 'volley', league: 'Superlega', home_team: 'Itas Trentino', away_team: 'Rana Verona', commence_time: '2026-10-23T18:30:00Z' };
  const righe = (sh) => eventiDaRighe([
    rigaOdss({ ...base, market: 'moneyline', bookmakers: [bkOdss('snai', { HOME: 1.3, AWAY: 3.5 })] }),
    rigaOdss({ ...base, market: 'other:set_handicap', line: -1.5, bookmakers: [bkOdss('snai', sh)] }),
    rigaOdss({ ...base, market: 'ah', line: -1.5, bookmakers: [bkOdss('snai', { HOME: 1.9, AWAY: 1.9 })] }),
  ])[0];
  let f = inFormatoNba(righe({ HOME: 1.8, AWAY: 2 }), { handicap: false, handicapSet: true, totali: (l) => l === 3.5 });
  assert.deepEqual(f.bookmaker[0].mercati.handicap, { '-1.5': { casa: 1.8, trasferta: 2 } });
  f = inFormatoNba(righe({ 'Itas Trentino -1.5': 1.8, 'Rana Verona +1.5': 2 }), { handicap: false, handicapSet: true, totali: (l) => l === 3.5 });
  assert.equal(f.bookmaker[0].mercati.handicap, undefined);
});

test('pallavolo: i nomi di odss si chiudono con lo storico (esiti)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'odss-ver-esiti-'));
  writeFileSync(join(dir, '2026-10-20.json'), JSON.stringify({ data: '2026-10-20', giocate: [{
    id: 'a', sport: 'pallavolo', competizione: 'SuperLega', partita: 'Itas Trentino - Rana Verona', idPartita: 'pallavolo-2026-10-20-itas-trentino-rana-verona',
    inizio: '2026-10-20T20:30:00+02:00', tipo: 'singola', mercato: 'Vincente', selezione: 'Itas Trentino', quota: 1.9, esito: null,
  }] }));
  const storici = new Map([['superlega', [
    { id: '9', stagione: 2026, giornata: 3, idCasa: '136630', idTrasferta: '137441', casa: 'Trentino Volley', trasferta: 'Verona Volley', inizio: '2026-10-20T18:30:00.000Z', puntiCasa: 3, puntiTrasferta: 1, finita: true },
  ]]]);
  const out = aggiornaEsitiPallavolo({ dirData: dir, adesso: new Date('2026-10-21T05:40:00Z'), storici, raccolta: { erroriGiro: [] } });
  assert.equal(out.aggiornate, 1);
});

test('calcio: un evento di un campionato femminile non va mai a una partita maschile', () => {
  const p = [{ idPartita: 'p1', sport: 'calcio', casa: 'Juventus', trasferta: 'Roma', partita: 'Juventus - Roma', inizio: '2026-10-23T18:45:00Z' }];
  const ev = (campionato) => ({ id: 'e', campionato, casa: 'Juventus', trasferta: 'Roma', inizio: '2026-10-23T18:45:00Z', mercati: {} });
  assert.equal(abbinaEventiOdss(p, [ev('Serie A Femminile')]).size, 0);
  assert.equal(abbinaEventiOdss(p, [ev('Serie A (W)')]).size, 0);
  assert.equal(abbinaEventiOdss(p, [ev('Serie A')]).size, 1);
});
