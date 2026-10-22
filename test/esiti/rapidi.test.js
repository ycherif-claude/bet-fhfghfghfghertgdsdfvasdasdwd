import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiEsitiRapidi } from '../../src/esiti/rapidi.js';
import { statoBankroll } from '../../src/bankroll/bankroll.js';
import { CONFIG } from '../../src/config.js';

const OGGI = '2026-10-21';
const giocata = (id, extra = {}) => ({
  id, sport: 'basket', competizione: 'Eurolega', partita: 'Real Madrid - FC Barcelona', idPartita: 'p', inizio: '2026-10-21T20:45:00+02:00',
  tipo: 'singola', mercato: 'Vincente', selezione: 'Real Madrid', quota: 1.6, stato: 'confermata', esito: null, ...extra,
});

function cartella(giocate, segnate) {
  const d = mkdtempSync(join(tmpdir(), 'bet-rapidi-'));
  for (const s of ['giornate', 'segnature', 'storico']) mkdirSync(join(d, s));
  writeFileSync(join(d, 'giornate', `${OGGI}.json`), JSON.stringify({ data: OGGI, giocate }));
  for (const id of segnate) {
    writeFileSync(join(d, 'segnature', `${id}.json`), JSON.stringify({ idGiocata: id, fatta: true, quotaReale: 1.6, puntataReale: 2, ora: '2026-10-21T10:00:00Z' }));
  }
  writeFileSync(join(d, 'storico', 'eurolega.json'), JSON.stringify({ partite: [{ id: 'E2026_60', stagione: 2026, giornata: 6, data: '2026-10-16', casa: 'PAN', trasferta: 'HTA' }] }));
  writeFileSync(join(d, 'storico', 'pallavolo-superlega.json'), JSON.stringify({ partite: [
    { id: '1', stagione: 2026, giornata: 2, idCasa: '136630', casa: 'Trentino Volley', idTrasferta: '137441', trasferta: 'Verona Volley', inizio: '2026-10-12T18:00:00.000Z', puntiCasa: 3, puntiTrasferta: 0, finita: true },
  ] }));
  return d;
}
const leggi = (d) => JSON.parse(readFileSync(join(d, 'giornate', `${OGGI}.json`), 'utf8')).giocate;

const fonti = ({ giornata = [] } = {}) => {
  const chiamate = [];
  return {
    chiamate,
    opz: {},
    espn: { partite: async () => [] },
    eurolega: { giornata: async (s, g) => { chiamate.push(`eurolega ${s}/${g}`); return { partite: g === 7 ? giornata : [] }; } },
    thesportsdb: { round: async (s, g, o, lega) => ({ partite: lega === 4544 && g === 3 ? [
      { id: '9', idCasa: '136630', idTrasferta: '137441', inizio: '2026-10-21T18:30:00.000Z', puntiCasa: 3, puntiTrasferta: 2, finita: true },
    ] : [] }) },
  };
};

test('esiti rapidi: solo le giocate segnate come fatte, dopo la fine della partita', async () => {
  const d = cartella([giocata('fatta'), giocata('saltata')], ['fatta']);
  const f = fonti({ giornata: [{ id: 'E2026_70', giornata: 7, data: '2026-10-21', casa: 'MAD', trasferta: 'BAR', puntiCasa: 88, puntiTrasferta: 80 }] });
  // Troppo presto (un'ora dopo l'inizio): niente richieste.
  let r = await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T19:45:00Z'), fonti: f });
  assert.equal(r.aggiornate, 0);
  assert.deepEqual(f.chiamate, []);
  r = await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T20:50:00Z'), fonti: f });
  assert.equal(r.aggiornate, 1);
  assert.deepEqual(leggi(d).map((g) => g.esito), ['vinta', null]);
  assert.deepEqual(f.chiamate, ['eurolega 2026/6', 'eurolega 2026/7']);
});

test('esiti rapidi: partita non ancora nella fonte → niente esito (ci pensa il mattino)', async () => {
  const d = cartella([giocata('fatta')], ['fatta']);
  const r = await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T20:50:00Z'), fonti: fonti() });
  assert.equal(r.aggiornate, 0);
  assert.equal(leggi(d)[0].esito, null);
});

test('esiti rapidi: pallavolo dal risultato in set di TheSportsDB, squadre per id', async () => {
  const d = cartella([giocata('v', {
    sport: 'pallavolo', competizione: 'SuperLega', partita: 'Itas Trentino - Rana Verona', inizio: '2026-10-21T20:30:00+02:00',
    mercato: 'Totale set 3.5', selezione: 'Over 3.5',
  })], ['v']);
  const r = await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T20:30:00Z'), fonti: fonti() });
  assert.equal(r.aggiornate, 1);
  assert.equal(leggi(d)[0].esito, 'vinta');
});

test('esiti rapidi: cartellini e angoli restano al giro del mattino, i gol si chiudono subito', async () => {
  const levante = { sport: 'calcio', competizione: 'LaLiga', partita: 'Levante - Athletic Bilbao', inizio: '2026-10-21T20:00:00+02:00' };
  const d = cartella([
    giocata('cart', { ...levante, mercato: 'Cartellini Under/Over 3.5', selezione: 'Under 3.5' }),
    giocata('ang', { ...levante, mercato: 'Angoli Under/Over 9.5', selezione: 'Under 9.5' }),
    giocata('gol', { ...levante, mercato: 'Under/Over 2.5', selezione: 'Under 2.5' }),
  ], ['cart', 'ang', 'gol']);
  // ESPN: 2 gialli + doppio giallo (gialli 3, rosso 1) = 5 per ESPN, 3 per bet365/football-data.
  const squadra = (homeAway, gialli, rossi) => ({ homeAway, statistics: [
    { name: 'yellowCards', displayValue: String(gialli) }, { name: 'redCards', displayValue: String(rossi) },
    { name: 'wonCorners', displayValue: '4' },
  ] });
  const summary = {
    header: { competitions: [{ status: { type: { name: 'STATUS_FULL_TIME' } }, competitors: [
      { homeAway: 'home', score: '1', linescores: [{ displayValue: '0' }] },
      { homeAway: 'away', score: '0', linescores: [{ displayValue: '0' }] },
    ] }] },
    boxscore: { teams: [squadra('home', 3, 1), squadra('away', 1, 0)] },
  };
  const f = fonti();
  f.espn = { partite: async () => [{ id: '77', casa: 'Levante', trasferta: 'Athletic Club', inizio: '2026-10-21T18:00:00Z' }] };
  f.opz = { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(summary) }) };
  await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T20:30:00Z'), fonti: f });
  const per = Object.fromEntries(leggi(d).map((g) => [g.id, g.esito]));
  assert.equal(per.gol, 'vinta');
  assert.equal(per.cart, null);
  assert.equal(per.ang, null);
});

// Partita di calcio finita su ESPN, con cartellini e angoli nel boxscore (squadre in ordine inverso).
function fontiLevante() {
  const squadra = (homeAway, gialli, rossi, angoli) => ({ homeAway, statistics: [
    { name: 'yellowCards', displayValue: String(gialli) }, { name: 'redCards', displayValue: String(rossi) },
    { name: 'wonCorners', displayValue: String(angoli) },
  ] });
  const summary = {
    header: { competitions: [{ status: { type: { name: 'STATUS_FULL_TIME' } }, competitors: [
      { homeAway: 'home', score: '1', linescores: [{ displayValue: '0' }] },
      { homeAway: 'away', score: '0', linescores: [{ displayValue: '0' }] },
    ] }] },
    boxscore: { teams: [squadra('away', 1, 0, 3), squadra('home', 3, 1, 5)] },
  };
  const f = fonti();
  f.espn = { partite: async () => [{ id: '77', casa: 'Levante', trasferta: 'Athletic Club', inizio: '2026-10-21T18:00:00Z' }] };
  f.opz = { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(summary) }) };
  return f;
}
const levante = { sport: 'calcio', competizione: 'LaLiga', partita: 'Levante - Athletic Bilbao', inizio: '2026-10-21T20:00:00+02:00' };

test('esiti rapidi: cartellini e angoli hanno un esito provvisorio da ESPN, mai `esito`; il bankroll non cambia', async () => {
  const d = cartella([
    giocata('cart', { ...levante, mercato: 'Cartellini Under/Over 3.5', selezione: 'Under 3.5' }),
    giocata('ang', { ...levante, mercato: 'Angoli Under/Over 9.5', selezione: 'Under 9.5' }),
  ], ['cart', 'ang']);
  const r = await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T20:30:00Z'), fonti: fontiLevante() });
  assert.equal(r.aggiornate, 0);
  const [cart, ang] = leggi(d);
  assert.equal(cart.esito, null);
  assert.equal(ang.esito, null);
  // 3 gialli + 1 rosso + 1 giallo = 5 cartellini; 5 + 3 = 8 angoli.
  assert.deepEqual(cart.esitoProvvisorio, { esito: 'persa', dettaglio: '5 cartellini secondo ESPN, conteggio da confermare' });
  assert.deepEqual(ang.esitoProvvisorio, { esito: 'vinta', dettaglio: '8 angoli secondo ESPN, conteggio da confermare' });
  const segnature = ['cart', 'ang'].map((id) => ({ idGiocata: id, fatta: true, quotaReale: 1.6, puntataReale: 2, ora: '2026-10-21T10:00:00Z' }));
  const b = statoBankroll(leggi(d), segnature, new Date('2026-10-21T20:30:00Z'));
  assert.equal(b.bankroll, CONFIG.bankrollIniziale);
});

test('esiti rapidi: esito provvisorio anche sulla gamba di una multipla, la multipla resta aperta', async () => {
  const gambe = [
    { ...levante, mercato: 'Cartellini Under/Over 5.5', selezione: 'Under 5.5' },
    { ...levante, mercato: 'Under/Over 2.5', selezione: 'Under 2.5' },
  ];
  const d = cartella([giocata('m', { tipo: 'multipla', gambe })], ['m']);
  await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T20:30:00Z'), fonti: fontiLevante() });
  const g = leggi(d)[0];
  assert.equal(g.esito, null);
  assert.equal(g.gambe[0].esito ?? null, null);
  assert.deepEqual(g.gambe[0].esitoProvvisorio, { esito: 'vinta', dettaglio: '5 cartellini secondo ESPN, conteggio da confermare' });
  assert.equal(g.gambe[1].esito, 'vinta');
  assert.equal(g.gambe[1].esitoProvvisorio, undefined);
});

test('esiti rapidi: multipla chiusa solo quando tutte le gambe hanno un esito', async () => {
  const gambe = [
    { sport: 'basket', competizione: 'Eurolega', partita: 'Real Madrid - FC Barcelona', inizio: '2026-10-21T20:45:00+02:00', mercato: 'Vincente', selezione: 'Real Madrid' },
    { sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Roma', inizio: '2026-10-21T20:45:00+02:00', mercato: '1X2', selezione: '1' },
  ];
  const d = cartella([giocata('m', { tipo: 'multipla', gambe })], ['m']);
  const f = fonti({ giornata: [{ id: 'E2026_70', giornata: 7, data: '2026-10-21', casa: 'MAD', trasferta: 'BAR', puntiCasa: 88, puntiTrasferta: 80 }] });
  const r = await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T20:50:00Z'), fonti: f });
  assert.equal(r.aggiornate, 0);
  const g = leggi(d)[0];
  assert.equal(g.esito, null);
  assert.deepEqual(g.gambe.map((x) => x.esito ?? null), ['vinta', null]);
});

test('esiti rapidi NBA: solo con lo stato STATUS_FINAL, non basta "completed"', async () => {
  const partita = { sport: 'nba', competizione: 'NBA', partita: 'Boston Celtics - New York Knicks', inizio: '2026-10-21T19:30:00Z', mercato: 'Vincente', selezione: 'Boston Celtics' };
  const tabellone = (nome) => ({ events: [{ date: '2026-10-21T19:30Z', competitions: [{ status: { type: { name: nome, completed: true } }, competitors: [
    { homeAway: 'away', score: '99', team: { displayName: 'New York Knicks' } },
    { homeAway: 'home', score: '110', team: { displayName: 'Boston Celtics' } },
  ] }] }] });
  for (const [nome, atteso] of [['STATUS_POSTPONED', null], ['STATUS_FINAL', 'vinta']]) {
    const d = cartella([giocata('n', partita)], ['n']);
    const f = fonti();
    f.opz = { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(tabellone(nome)) }) };
    await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T22:30:00Z'), fonti: f });
    assert.equal(leggi(d)[0].esito, atteso, nome);
  }
});

// B3: coppe finite ai supplementari o ai rigori → risultato dei 90 minuti (primi due tempi di ESPN).
test('B3 esiti: partita finita ai supplementari o ai rigori → mercati dei 90 minuti dal risultato dei primi due tempi', async () => {
  const qarabag = { sport: 'calcio', competizione: 'Europa League', partita: 'Qarabag - Twente', inizio: '2026-10-21T20:00:00+02:00' };
  const ls = (...v) => v.map((x) => ({ displayValue: String(x) }));
  const casi = [
    // AET: 90 minuti 1-2 (finale 1-4).
    ['STATUS_FINAL_AET', ls(0, 1, 0, 0), ls(0, 2, 1, 1), '1', '4', { segno2: 'vinta', under25: 'persa', over35: 'persa' }],
    // Rigori: 90 minuti 1-1 (finale 1-1, rigori a parte).
    ['STATUS_FINAL_PEN', ls(1, 0, 0, 0), ls(0, 1, 0, 0), '1', '1', { segno2: 'persa', under25: 'vinta', over35: 'persa' }],
  ];
  for (const [stato, lsCasa, lsTrasferta, sc, st, atteso] of casi) {
    const d = cartella([
      giocata('segno2', { ...qarabag, mercato: '1X2', selezione: '2' }),
      giocata('under25', { ...qarabag, mercato: 'Under/Over 2.5', selezione: 'Under 2.5' }),
      giocata('over35', { ...qarabag, mercato: 'Under/Over 3.5', selezione: 'Over 3.5' }),
      giocata('cart', { ...qarabag, mercato: 'Cartellini Under/Over 3.5', selezione: 'Under 3.5' }),
    ], ['segno2', 'under25', 'over35', 'cart']);
    const summary = { header: { competitions: [{ status: { type: { name: stato } }, competitors: [
      { homeAway: 'home', score: sc, linescores: lsCasa }, { homeAway: 'away', score: st, linescores: lsTrasferta },
    ] }] }, boxscore: { teams: [] } };
    const f = fonti();
    f.espn = { partite: async () => [{ id: '88', casa: 'Qarabag', trasferta: 'Twente', inizio: '2026-10-21T18:00:00Z' }] };
    f.opz = { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(summary) }) };
    await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T21:30:00Z'), fonti: f });
    const per = Object.fromEntries(leggi(d).map((g) => [g.id, g.esito ?? null]));
    assert.deepEqual({ segno2: per.segno2, under25: per.under25, over35: per.over35 }, atteso, stato);
    // Cartellini e angoli dei supplementari non si separano: nessun esito.
    assert.equal(per.cart, null, stato);
  }
});

test('B3 esiti: supplementari senza il dettaglio dei due tempi → nessun esito', async () => {
  const d = cartella([giocata('g', { sport: 'calcio', competizione: 'Europa League', partita: 'Qarabag - Twente', inizio: '2026-10-21T20:00:00+02:00', mercato: '1X2', selezione: '2' })], ['g']);
  const summary = { header: { competitions: [{ status: { type: { name: 'STATUS_FINAL_AET' } }, competitors: [
    { homeAway: 'home', score: '1' }, { homeAway: 'away', score: '4' },
  ] }] }, boxscore: { teams: [] } };
  const f = fonti();
  f.espn = { partite: async () => [{ id: '88', casa: 'Qarabag', trasferta: 'Twente', inizio: '2026-10-21T18:00:00Z' }] };
  f.opz = { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(summary) }) };
  await eseguiEsitiRapidi({ dirData: d, adesso: new Date('2026-10-21T21:30:00Z'), fonti: f });
  assert.equal(leggi(d)[0].esito, null);
});
