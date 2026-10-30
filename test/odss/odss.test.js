// odss-api come fonte di quote per tutti gli sport [utente, 22/10/2026]: budget unico (giro del mattino, controlli,
// riserva), download generico per sport/mercati/campionato con paginazione, eventi a tempo intero con i bookmaker
// (sospesi, exchange, orari diversi, quote vecchie), abbinamento rigoroso e formati dei vari sport.
// Niente rete: fetch finto con i formati del feed vero (collaudo del 22/10/2026) e del mock pubblico.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../../src/config.js';
import { creaBudgetOdss } from '../../src/odss/budget.js';
import { scaricaOdss } from '../../src/odss/scarica.js';
import { eventiDaRighe, abbinaEventi, inFormatoNba, inFormatoTennis, inFormatoCalcio } from '../../src/odss/eventi.js';
import { fetchOdss, rigaOdss, bkOdss, AGG } from './aiuti.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const DATA = '2026-10-23';
const ADESSO = new Date('2026-10-23T05:36:00Z');
const FINESTRA = { da: new Date('2026-10-23T06:00:00Z'), a: new Date('2026-10-24T06:00:00Z') };
const MOCK = JSON.parse(readFileSync('test/fixtures/odss/mock-odds.json', 'utf8'));
// Il mock pubblico ha scope e period null: nel feed vero la partita intera è scope "match", period "full_time".
const intere = MOCK.odds.map((r) => ({ ...r, scope: 'match', period: 'full_time' }));

// ---- Budget unico ----

test('budget: tetto del mattino fra tutti gli sport, tetto per sport, controlli a parte, riserva fissa', () => {
  const O = CONFIG.odss;
  assert.equal(O.riserva, 60);
  assert.equal(O.richiesteGiorno, 16);
  assert.equal(O.tetti.calcio, 4);
  assert.equal(O.tetti.controlli, 7);
  // Al massimo 480 richieste in 30 giorni anche usando tutti i tetti (la riserva protegge la fine del mese).
  assert.ok(O.richiesteGiorno * 30 <= 500);
  // 7 richieste già fatte oggi dalle altre raccolte: il tennis ne può fare una sola (il suo tetto).
  let b = creaBudgetOdss({ stato: { rimaste: 300, giorno: DATA, usateOggi: 7, perSport: { calcio: 4, nba: 2, basket: 1 } }, data: DATA, adesso: ADESSO, sport: 'tennis' });
  assert.equal(b.puo(0), true);
  assert.equal(b.puo(1), false);
  b.conta();
  assert.equal(b.puo(0), false);
  assert.match(b.motivo(), /tetto di 1 richieste al giorno per tennis/);
  assert.deepEqual(b.stato().giornate[DATA].perSport, { calcio: 4, nba: 2, basket: 1, tennis: 1 });
  // Il calcio da solo non va oltre il suo tetto.
  b = creaBudgetOdss({ stato: { rimaste: 300, giorno: DATA, usateOggi: 4, perSport: { calcio: 4 } }, data: DATA, adesso: ADESSO, sport: 'calcio' });
  assert.equal(b.puo(0), false);
  assert.match(b.motivo(), /per calcio/);
  // I controlli hanno il loro tetto e non toccano quello del mattino.
  // (alle 12:00 la giornata in corso dei controlli è quella del 23, la stessa della raccolta del 23).
  const MEZZOGIORNO = new Date('2026-10-23T10:00:00Z');
  b = creaBudgetOdss({ stato: { rimaste: 300, giornate: { [DATA]: { usate: 9, controlli: 6 } } }, data: DATA, adesso: MEZZOGIORNO, tipo: 'controlli' });
  assert.equal(b.puo(0), true);
  b.conta();
  assert.equal(b.puo(0), false);
  assert.equal(b.stato().giornate[DATA].usate, 9);
  assert.equal(b.stato().giornate[DATA].controlli, 7);
  // Riserva: con 61 rimaste nessuna richiesta che lasci meno di 60.
  b = creaBudgetOdss({ stato: { rimaste: 61, giorno: DATA }, data: DATA, adesso: ADESSO, sport: 'nba' });
  assert.equal(b.puo(0), true);
  b.conta();
  b.aggiorna({ rimaste: 60 });
  assert.equal(b.puo(0), false);
  assert.match(b.motivo(), /riserva di 60/);
  // Giorno nuovo: i conteggi ripartono; un reset passato rende sconosciute le rimaste.
  b = creaBudgetOdss({ stato: { rimaste: 10, reset: '2026-10-01T00:00:00Z', giorno: '2026-10-22', usateOggi: 10, controlliOggi: 3, perSport: { calcio: 6 } }, data: DATA, adesso: ADESSO, sport: 'calcio' });
  assert.equal(b.puo(3), true);
  assert.deepEqual(b.stato(), { aggiornatoAlle: ADESSO.toISOString(), rimaste: null, limite: null, reset: null, limiteRaggiuntoFino: null, giornate: {
    '2026-10-22': { usate: 10, controlli: 3, perSport: { calcio: 6 }, avvisi: [] }, [DATA]: { usate: 0, controlli: 0, perSport: {}, avvisi: [] },
  } });
});

// ---- Download generico ----

test('download: sport, mercati separati da virgola, campionato, solo righe di partita, paginazione e budget', async () => {
  const f = fetchOdss({ 'basket|moneyline,ah,ou': [[rigaOdss({ sport: 'basket', market: 'moneyline' })], [rigaOdss({ sport: 'basket', market: 'ou', line: 215.5 })]] });
  const budget = creaBudgetOdss({ stato: null, data: DATA, adesso: ADESSO, sport: 'nba' });
  const errori = [];
  const r = await scaricaOdss({ chiave: CHIAVE, budget, sport: 'basket', gruppi: ['moneyline,ah,ou'], league: 'nba', finestra: FINESTRA, fetch: f, errore: (m) => errori.push(m), attesaMs: 0 });
  assert.equal(f.chiamate.length, 2);
  const u = new URL(f.chiamate[0].url);
  assert.equal(u.searchParams.get('sport'), 'basket');
  assert.equal(u.searchParams.get('market'), 'moneyline,ah,ou');
  assert.equal(u.searchParams.get('league'), 'nba');
  assert.equal(u.searchParams.get('content'), 'match');
  assert.equal(u.searchParams.get('state'), 'prematch');
  assert.ok(!f.chiamate[0].url.includes(CHIAVE));
  assert.equal(f.chiamate[0].init.headers['x-api-key'], CHIAVE);
  assert.equal(f.chiamate[0].init.headers['User-Agent'], 'analisi-giocate (progetto personale)');
  assert.equal(r.righe.length, 2);
  assert.equal(r.richieste, 2);
  assert.equal(r.ok, true);
  assert.equal(r.fermo, null);
  assert.deepEqual(errori, []);
  assert.equal(budget.stato().giornate[DATA].perSport.nba, 2);
});

test('download: 401/403 e 429 fermano tutto (fermo), un 5xx si riprova una volta, budget finito → niente richieste', async () => {
  for (const [status, fermo, testo] of [[401, 'chiave', /chiave rifiutata/], [403, 'chiave', /chiave rifiutata/], [429, 'limite', /limite di richieste/]]) {
    const f = fetchOdss({}, { status, corpo: `chiave ${CHIAVE}` });
    const errori = [];
    const r = await scaricaOdss({ chiave: CHIAVE, budget: creaBudgetOdss({ stato: null, data: DATA, adesso: ADESSO, sport: 'tennis' }), sport: 'tennis', gruppi: ['moneyline'], finestra: FINESTRA, fetch: f, errore: (m) => errori.push(m), attesaMs: 0 });
    assert.equal(f.chiamate.length, 1);
    assert.equal(r.fermo, fermo);
    assert.equal(r.ok, false);
    assert.match(errori.join(' '), testo);
    assert.ok(!errori.join(' ').includes(CHIAVE));
  }
  let f = fetchOdss({}, { status: 503 });
  let r = await scaricaOdss({ chiave: CHIAVE, budget: creaBudgetOdss({ stato: null, data: DATA, adesso: ADESSO, sport: 'nba' }), sport: 'tennis', gruppi: ['moneyline'], finestra: FINESTRA, fetch: f, errore: () => {}, attesaMs: 0 });
  assert.equal(f.chiamate.length, 2);
  assert.equal(r.ok, false);
  f = fetchOdss({});
  const errori = [];
  r = await scaricaOdss({ chiave: CHIAVE, budget: creaBudgetOdss({ stato: { rimaste: 60, giorno: DATA }, data: DATA, adesso: ADESSO, sport: 'tennis' }), sport: 'tennis', gruppi: ['moneyline'], finestra: FINESTRA, fetch: f, errore: (m) => errori.push(m), attesaMs: 0 });
  assert.equal(f.chiamate.length, 0);
  assert.equal(r.fermo, 'budget');
  assert.match(errori[0], /budget insufficiente.*rimaste 60.*riserva 60/);
});

// ---- Eventi a tempo intero ----

test('eventi: dal mock pubblico, mercati per linea; sospesi, exchange, orari diversi e quote vecchie dei miei', () => {
  const ev = eventiDaRighe(intere);
  assert.equal(ev.length, 4);
  const tennis = ev.find((e) => e.casa === 'Sinner J.');
  assert.deepEqual(Object.keys(tennis.libri[0].mercati).sort(), ['moneyline', 'ou|22.5']);
  const juve = ev.find((e) => e.casa === 'Juventus');
  // mockbook_it_3 ha AWAY sospeso: l'esito manca, gli altri restano.
  assert.deepEqual(juve.libri.find((l) => l.chiave === 'mockbook_it_3').mercati['1x2'], { HOME: 3.9, DRAW: 2.42 });
  assert.equal(juve.libri.find((l) => l.chiave === 'mockbook_exchange').exchange, true);
  // Un esito in `suspended` ma ancora in `outcomes` (non dovrebbe succedere): fuori comunque.
  const r = rigaOdss({ bookmakers: [
    bkOdss('snai', { HOME: 2, DRAW: 3.2, AWAY: 3.9 }, { suspended: ['DRAW'] }),
    bkOdss('goldbet', { HOME: 2, DRAW: 3.2, AWAY: 3.9 }, { suspended: true }),
    bkOdss('sisal', { HOME: 2, DRAW: 3.2, AWAY: 3.9 }, { start_time: '2026-10-25T18:45:00Z' }),
    bkOdss('eurobet', { HOME: 2, DRAW: 3.2, AWAY: 3.9 }, { start_time: '2026-10-23T18:50:00Z' }),
    bkOdss('sportium', { HOME: 2, DRAW: 3.2, AWAY: 3.9 }, { last_update: '2026-10-22T20:00:00Z' }),
    bkOdss('bwin', { HOME: 2, DRAW: 3.2, AWAY: 3.9 }, { last_update: '2026-10-22T20:00:00Z' }),
  ] });
  const [e] = eventiDaRighe([r], { adesso: ADESSO });
  const chiavi = e.libri.map((l) => l.chiave).sort();
  // goldbet tutto sospeso; sisal con un altro orario (altra partita?); sportium (mio) vecchio di più di 6 ore.
  assert.deepEqual(chiavi, ['bwin', 'eurobet', 'snai']);
  assert.deepEqual(e.libri.find((l) => l.chiave === 'snai').mercati['1x2'], { HOME: 2, AWAY: 3.9 });
});

test('abbinamento: stesse squadre e orario; più eventi della stessa partita uniti; conflitti, ambigui e invertiti', () => {
  const stesso = (a, b) => a.toLowerCase() === b.toLowerCase();
  const nostri = [{ id: 'n1', casa: 'Lakers', trasferta: 'Celtics', inizio: '2026-10-24T01:00:00Z' }];
  const a = { id: 'a', casa: 'Lakers', trasferta: 'Celtics', inizio: '2026-10-24T01:00:00Z', libri: [{ chiave: 'snai', mercati: { moneyline: { HOME: 1.8, AWAY: 2 } } }, { chiave: 'bwin', mercati: { moneyline: { HOME: 1.8, AWAY: 2 } } }] };
  const b = { id: 'b', casa: 'LAKERS', trasferta: 'celtics', inizio: '2026-10-24T01:30:00Z', libri: [{ chiave: 'pinnacle', mercati: { moneyline: { HOME: 1.85, AWAY: 2.05 } } }, { chiave: 'bwin', mercati: { moneyline: { HOME: 1.7, AWAY: 2.1 } } }] };
  const lontano = { ...a, id: 'c', inizio: '2026-10-25T01:00:00Z' };
  let m = abbinaEventi(nostri, [a, b, lontano], { stesso, tolleranzaOre: 2 });
  const u = m.get('n1').evento;
  // bwin dà due quote diverse per la stessa partita: il mercato si scarta (e bwin, rimasto senza mercati, esce).
  assert.deepEqual(u.libri.map((l) => l.chiave).sort(), ['pinnacle', 'snai']);
  assert.equal(m.get('n1').invertito, false);
  // Squadre invertite: solo dove è ammesso (tennis), con invertito: true.
  const inv = { ...a, id: 'd', casa: 'Celtics', trasferta: 'Lakers' };
  assert.equal(abbinaEventi(nostri, [inv], { stesso, tolleranzaOre: 2 }).size, 0);
  m = abbinaEventi(nostri, [inv], { stesso, tolleranzaOre: 2, invertibile: true });
  assert.equal(m.get('n1').invertito, true);
  // Lo stesso evento per due partite nostre: nessuna delle due.
  m = abbinaEventi([...nostri, { id: 'n2', casa: 'lakers', trasferta: 'celtics', inizio: '2026-10-24T01:10:00Z' }], [a], { stesso, tolleranzaOre: 2 });
  assert.equal(m.size, 0);
  // Solo nomi simili: va bene un evento solo, due no.
  const simile = (x, y) => x.slice(0, 3).toLowerCase() === y.slice(0, 3).toLowerCase();
  const s1 = { ...a, id: 's1', casa: 'Lak', trasferta: 'Cel' };
  assert.equal(abbinaEventi(nostri, [s1], { stesso, simile, tolleranzaOre: 2 }).size, 1);
  assert.equal(abbinaEventi(nostri, [s1, { ...s1, id: 's2' }], { stesso, simile, tolleranzaOre: 2 }).size, 0);
});

test('formati: NBA/basket (vincente, handicap della casa, totale), tennis per nome, calcio come The Odds API', () => {
  const libro = (chiave, ml, ah, ou, extra = {}) => ({ chiave, exchange: false, aggiornato: AGG, mercati: { moneyline: { HOME: ml[0], AWAY: ml[1] }, [`ah|${ah[0]}`]: { HOME: ah[1], AWAY: ah[2] }, [`ou|${ou[0]}`]: { OVER: ou[1], UNDER: ou[2] } }, ...extra });
  const ev = { id: 'x', casa: 'Lakers', trasferta: 'Celtics', inizio: AGG, libri: [
    libro('pinnacle', [1.5, 2.7], [-4.5, 1.9, 1.9], [215.5, 1.9, 1.9]),
    libro('snai', [1.5, 2.6], [-4.5, 1.85, 1.9], [215.5, 1.85, 1.9]),
    libro('mockbook_exchange', [1.6, 2.8], [-4.5, 2, 2], [215.5, 2, 2], { exchange: true }),
  ] };
  let r = inFormatoNba(ev);
  assert.deepEqual(r.bookmaker.map((b) => b.chiave), ['pinnacle', 'snai']);
  assert.deepEqual(r.bookmaker[0].mercati, { vincente: { casa: 1.5, trasferta: 2.7 }, handicap: { '-4.5': { casa: 1.9, trasferta: 1.9 } }, totale: { 215.5: { over: 1.9, under: 1.9 } } });
  assert.equal(r.handicapScartato, false);
  // Favorita la casa ma la linea comune è positiva: il verso dell'handicap non torna → handicap scartato.
  const storto = { ...ev, libri: ev.libri.map((l) => ({ ...l, mercati: { moneyline: l.mercati.moneyline, 'ah|4.5': l.mercati['ah|-4.5'] } })) };
  r = inFormatoNba(storto);
  assert.equal(r.handicapScartato, true);
  assert.ok(r.bookmaker.every((b) => !b.mercati.handicap));
  // Tennis: quote per nome dei nostri giocatori, anche con l'evento invertito.
  const t = { id: 't', casa: 'Sinner J.', trasferta: 'Alcaraz C.', inizio: AGG, libri: [{ chiave: 'snai', aggiornato: AGG, mercati: { moneyline: { HOME: 1.7, AWAY: 2.1 } } }] };
  assert.deepEqual(inFormatoTennis(t, 'Jannik Sinner', 'Carlos Alcaraz'), [{ chiave: 'snai', aggiornato: AGG, quote: { 'Jannik Sinner': 1.7, 'Carlos Alcaraz': 2.1 } }]);
  assert.deepEqual(inFormatoTennis(t, 'Carlos Alcaraz', 'Jannik Sinner', { invertito: true })[0].quote, { 'Carlos Alcaraz': 2.1, 'Jannik Sinner': 1.7 });
  // Calcio: h2h e totals come The Odds API, così mediana e Pinnacle si calcolano come sempre.
  const c = { id: 'c', casa: 'Juventus', trasferta: 'Inter', inizio: AGG, libri: [{ chiave: 'pinnacle', aggiornato: AGG, mercati: { '1x2': { HOME: 2, DRAW: 3.4, AWAY: 3.9 }, 'ou|2.5': { OVER: 1.9, UNDER: 1.95 }, 'ou|1.25': { OVER: 1.2, UNDER: 4 } } }] };
  assert.deepEqual(inFormatoCalcio(c).bookmaker[0].mercati, { h2h: { casa: 2, pareggio: 3.4, trasferta: 3.9 }, totals: { 2.5: { over: 1.9, under: 1.95 } } });
});

test('documentazione: fonti per sport, budget unico e riserva nel README e nelle routine', () => {
  const r = readFileSync('README.md', 'utf8');
  assert.match(r, /odss-api è la fonte principale di tutti gli sport/);
  assert.match(r, /13 × 30 = 390/);
  for (const riserva of ['The Odds API', 'SportsGameOdds', 'OddsPapi']) assert.ok(r.includes(riserva));
  assert.match(readFileSync('docs/routine/giro-del-mattino.md', 'utf8'), /mediana di N bookmaker \(odss-api\)/);
  assert.match(readFileSync('docs/routine/controllo-pre-partita.md', 'utf8'), /prima odss-api/);
  assert.match(readFileSync('docs/routine/giro-serale.md', 'utf8'), /budget di odss-api/);
});

test('sport: righe senza nessuna partita intera → una riga con i periodi visti (per capire il feed vero)', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { eventiOdssSport } = await import('../../src/odss/sport.js');
  const f = fetchOdss({ 'basket|moneyline,ah,ou': [[rigaOdss({ sport: 'basket', market: 'moneyline', period: 'full_time_ot', bookmakers: [bkOdss('snai', { HOME: 1.5, AWAY: 2.6 })] })]] });
  const r = await eventiOdssSport({ dirData: mkdtempSync(join(tmpdir(), 'odss-sport-')), data: DATA, adesso: ADESSO, chiave: CHIAVE, sport: 'basket', budgetSport: 'nba', gruppi: ['moneyline,ah,ou'], finestra: FINESTRA, fetch: f, nome: 'NBA' });
  assert.deepEqual(r.eventi, []);
  assert.ok(r.errori.some((e) => /odss-api \(NBA\).*nessuna riga a tempo intero.*match\|full_time_ot/.test(e)), r.errori.join(' | '));
});
