import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { esitoSelezione, esitoGiocata, aggiornaEsiti, aggiornaEsitiGiro, risultatiDaCsv } from '../../src/calcio/esiti.js';

const r = (gc, gt, gcPT = null, gtPT = null, extra = {}) => ({ casa: 'A', trasferta: 'B', inizio: '2026-10-18T18:45:00Z', gc, gt, gcPT, gtPT, fonte: 'x', ...extra });

test('1X2, Under/Over, Gol/No gol, risultato esatto, primo tempo su 2-1 (PT 1-0)', () => {
  const x = r(2, 1, 1, 0);
  const casi = [
    ['1X2', '1', 'vinta'], ['1X2', 'X', 'persa'], ['1X2', '2', 'persa'],
    ['Doppia chance', '1X', 'vinta'], ['Doppia chance', '12', 'vinta'], ['Doppia chance', 'X2', 'persa'],
    ['Under/Over 2.5', 'Over 2.5', 'vinta'], ['Under/Over 2.5', 'Under 2.5', 'persa'],
    ['Under/Over 3.5', 'Under 3.5', 'vinta'], ['Under/Over 1.5', 'Over 1.5', 'vinta'],
    ['Under/Over casa 1.5', 'Over 1.5', 'vinta'], ['Under/Over casa 2.5', 'Over 2.5', 'persa'],
    ['Under/Over trasferta 0.5', 'Over 0.5', 'vinta'], ['Under/Over trasferta 1.5', 'Over 1.5', 'persa'],
    ['Under/Over 1° tempo 0.5', 'Over 0.5', 'vinta'], ['Under/Over 1° tempo 1.5', 'Under 1.5', 'vinta'],
    ['Gol/No gol', 'Gol', 'vinta'], ['Gol/No gol', 'No gol', 'persa'],
    ['Risultato esatto', '2-1', 'vinta'], ['Risultato esatto', '1-2', 'persa'],
  ];
  for (const [m, s, atteso] of casi) assert.equal(esitoSelezione(m, s, x), atteso, `${m} ${s}`);
  assert.equal(esitoSelezione('Gol/No gol', 'No gol', r(0, 3)), 'vinta');
  assert.equal(esitoSelezione('Risultato esatto', '4-4', r(5, 0)), 'persa');
});

test('primo tempo senza dati: null', () => {
  assert.equal(esitoSelezione('Under/Over 1° tempo 0.5', 'Over 0.5', r(2, 1)), null);
});

test('handicap asiatico -1 su 2-1: rimborsata; -1.5 su 2-1: persa', () => {
  const x = r(2, 1);
  assert.equal(esitoSelezione('Handicap asiatico -1', 'casa', x), 'rimborsata');
  assert.equal(esitoSelezione('Handicap asiatico -1', 'trasferta', x), 'rimborsata');
  assert.equal(esitoSelezione('Handicap asiatico -1.5', 'casa', x), 'persa');
  assert.equal(esitoSelezione('Handicap asiatico -1.5', 'trasferta', x), 'vinta');
  assert.equal(esitoSelezione('Handicap asiatico +0.5', 'casa', r(0, 1)), 'persa');
  assert.equal(esitoSelezione('Handicap asiatico +1.5', 'casa', r(0, 1)), 'vinta');
  assert.equal(esitoSelezione('Handicap asiatico +1', 'casa', r(0, 2)), 'persa');
  assert.equal(esitoSelezione('Handicap asiatico -0.5', 'casa', r(1, 1)), 'persa');
});

test('angoli senza dati: null, la giocata resta in corso', () => {
  assert.equal(esitoSelezione('Angoli Under/Over 9.5', 'Over 9.5', { gc: 1, gt: 0 }), null);
  assert.equal(esitoSelezione('Cartellini Under/Over 4.5', 'Over 4.5', { gc: 1, gt: 0 }), null);
});

test('angoli e cartellini con dati', () => {
  const x = r(1, 0, null, null, { angoliC: 6, angoliT: 4, cartC: 2, cartT: 3 });
  assert.equal(esitoSelezione('Angoli Under/Over 9.5', 'Over 9.5', x), 'vinta');
  assert.equal(esitoSelezione('Angoli Under/Over 10.5', 'Over 10.5', x), 'persa');
  assert.equal(esitoSelezione('Cartellini Under/Over 4.5', 'Over 4.5', x), 'vinta');
  assert.equal(esitoSelezione('Cartellini Under/Over 5.5', 'Under 5.5', x), 'vinta');
});

test('gol mancanti o mercato sconosciuto: null', () => {
  assert.equal(esitoSelezione('1X2', '1', { gc: null, gt: null }), null);
  assert.equal(esitoSelezione('Mercato strano', 'x', r(1, 0)), null);
});

const gamba = (id, mercato, selezione) => ({ id: `${id}-g`, sport: 'calcio', competizione: 'Serie A', partita: 'A - B', idPartita: id, inizio: '2026-10-18T20:45:00+02:00', mercato, selezione });

test('multipla: una gamba persa → persa; una gamba senza dati → null', () => {
  const mappa = new Map([['p1', r(2, 1)], ['p2', r(0, 0)], ['p3', r(1, 0)]]);
  const g = (gambe) => ({ tipo: 'multipla', gambe });
  assert.equal(esitoGiocata(g([gamba('p1', '1X2', '1'), gamba('p2', '1X2', '1')]), mappa), 'persa');
  assert.equal(esitoGiocata(g([gamba('p1', '1X2', '1'), gamba('p9', '1X2', '1')]), mappa), null);
  assert.equal(esitoGiocata(g([gamba('p1', '1X2', '2'), gamba('p9', '1X2', '1')]), mappa), 'persa');
  assert.equal(esitoGiocata(g([gamba('p1', '1X2', '1'), gamba('p3', '1X2', '1')]), mappa), 'vinta');
  assert.equal(esitoGiocata(g([gamba('p1', 'Handicap asiatico -1', 'casa'), gamba('p1', 'Handicap asiatico -1', 'trasferta')]), mappa), 'rimborsata');
  assert.equal(esitoGiocata(g([gamba('p1', 'Handicap asiatico -1', 'casa'), gamba('p3', '1X2', '1')]), mappa), 'vinta');
});

test('singola: usa idPartita; senza risultato null', () => {
  const mappa = new Map([['p1', r(2, 1)]]);
  assert.equal(esitoGiocata(gamba('p1', '1X2', '1'), mappa), 'vinta');
  assert.equal(esitoGiocata(gamba('p2', '1X2', '1'), mappa), null);
});

// --- aggiornaEsiti -------------------------------------------------------
const ADESSO = new Date('2026-10-20T06:00:00Z'); // 08:00 a Roma, 20 ottobre
const giocata = (id, partita, extra = {}) => ({
  id, sport: 'calcio', competizione: 'Serie A', partita, idPartita: `calcio-2026-10-18-${id}`,
  inizio: '2026-10-18T20:45:00+02:00', tipo: 'singola', mercato: '1X2', selezione: '1',
  stato: 'confermata', esito: null, ...extra,
});

function cartella(giornate) {
  const dir = mkdtempSync(join(tmpdir(), 'esiti-'));
  mkdirSync(dir, { recursive: true });
  for (const [data, contenuto] of Object.entries(giornate)) {
    writeFileSync(join(dir, `${data}.json`), typeof contenuto === 'string' ? contenuto : `${JSON.stringify(contenuto, null, 2)}\n`);
  }
  return dir;
}
const leggi = (dir, data) => JSON.parse(readFileSync(join(dir, `${data}.json`), 'utf8'));
const risInter = { casa: 'FC Internazionale Milano', trasferta: 'AC Monza', inizio: '2026-10-18T18:45:00Z', gc: 2, gt: 1, gcPT: 1, gtPT: 0, fonte: 'football-data.org' };

test('aggiornaEsiti cambia solo il campo esito e non tocca le giocate annullate', () => {
  const originale = {
    data: '2026-10-18', generataAlle: '2026-10-18T08:00:00+02:00', note: { a: [1, 2] }, candidati: [],
    giocate: [
      giocata('inter', 'Inter Milan - Monza'),
      giocata('annullata', 'Inter Milan - Monza', { stato: 'annullata' }),
      giocata('gia', 'Inter Milan - Monza', { esito: 'persa' }),
      giocata('altra', 'Roma - Lecce'),
    ],
    scartate: [],
  };
  const dir = cartella({ '2026-10-18': originale });
  const out = aggiornaEsiti(dir, [risInter], ADESSO);
  assert.equal(out.aggiornate, 1);
  assert.deepEqual(out.file.map((f) => f.replace(/\\/g, '/').split('/').pop()), ['2026-10-18.json']);
  const atteso = structuredClone(originale);
  atteso.giocate[0].esito = 'vinta';
  assert.deepEqual(leggi(dir, '2026-10-18'), atteso);
  assert.equal(readFileSync(join(dir, '2026-10-18.json'), 'utf8'), `${JSON.stringify(atteso, null, 2)}\n`);
});

test('partita iniziata da meno di 3 ore: nessun esito, file invariato', () => {
  const g = giocata('inter', 'Inter Milan - Monza', { inizio: '2026-10-19T20:45:00+02:00' });
  const dir = cartella({ '2026-10-19': { data: '2026-10-19', giocate: [g], scartate: [] } });
  const prima = readFileSync(join(dir, '2026-10-19.json'), 'utf8');
  const ris = { ...risInter, inizio: '2026-10-19T18:45:00Z' };
  // 20:45+02:00 = 18:45Z; +3h = 21:45Z
  assert.equal(aggiornaEsiti(dir, [ris], new Date('2026-10-19T21:44:00Z')).aggiornate, 0);
  assert.equal(readFileSync(join(dir, '2026-10-19.json'), 'utf8'), prima);
});

test('giornata di oggi o futura saltata; file illeggibile non blocca gli altri', () => {
  const g = giocata('inter', 'Inter Milan - Monza');
  const dir = cartella({
    '2026-10-18': { data: '2026-10-18', giocate: [g], scartate: [] },
    '2026-10-17': '{ rotto',
    '2026-10-20': { data: '2026-10-20', giocate: [g], scartate: [] },
  });
  const out = aggiornaEsiti(dir, [risInter], ADESSO);
  assert.equal(out.aggiornate, 1);
  assert.equal(out.errori.length, 1);
  assert.match(out.errori[0], /2026-10-17/);
  assert.equal(leggi(dir, '2026-10-20').giocate[0].esito, null);
});

test('nome non abbinato: esito resta null', () => {
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [giocata('x', 'Sconosciuta - Monza')], scartate: [] } });
  assert.equal(aggiornaEsiti(dir, [risInter], ADESSO).aggiornate, 0);
});

test('competizione diversa o altra data: nessun abbinamento', () => {
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [giocata('inter', 'Inter Milan - Monza')], scartate: [] } });
  assert.equal(aggiornaEsiti(dir, [{ ...risInter, competizione: 'Premier League' }], ADESSO).aggiornate, 0);
  assert.equal(aggiornaEsiti(dir, [{ ...risInter, inizio: '2026-10-17T18:45:00Z' }], ADESSO).aggiornate, 0);
});

test('fusione tra fonti: gol da football-data.org, angoli dal CSV; multipla risolta dalle gambe', () => {
  const csv = { casa: 'Inter', trasferta: 'Monza', data: '2026-10-18', inizio: '2026-10-18T12:00:00Z', gc: 2, gt: 1, gcPT: 1, gtPT: 0, angoliC: 7, angoliT: 5, cartC: 1, cartT: 2, fonte: 'football-data.co.uk', competizione: 'Serie A' };
  const angoli = { ...giocata('ang', 'Inter Milan - Monza'), mercato: 'Angoli Under/Over 11.5', selezione: 'Over 11.5' };
  const multipla = {
    ...giocata('mu', 'Inter Milan - Monza'), tipo: 'multipla', mercato: 'multipla', selezione: '',
    gambe: [giocata('g1', 'Inter Milan - Monza'), { ...giocata('g2', 'Inter Milan - Monza'), mercato: 'Gol/No gol', selezione: 'Gol' }],
  };
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [angoli, multipla], scartate: [] } });
  const out = aggiornaEsiti(dir, [risInter, csv], ADESSO);
  assert.equal(out.aggiornate, 2);
  const f = leggi(dir, '2026-10-18');
  assert.equal(f.giocate[0].esito, 'vinta');
  assert.equal(f.giocate[1].esito, 'vinta');
});

test('giocate non di calcio ignorate', () => {
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [giocata('inter', 'Inter Milan - Monza', { sport: 'nba' })], scartate: [] } });
  assert.equal(aggiornaEsiti(dir, [risInter], ADESSO).aggiornate, 0);
});

test('risultatiDaCsv converte angoli e cartellini e salta le partite vecchie', () => {
  const righe = [
    { data: '2026-10-18', casa: 'Inter', trasferta: 'Monza', gc: 2, gt: 1, gcPT: 1, gtPT: 0, angoliC: 7, angoliT: 5, cartC: 1, cartT: 2 },
    { data: '2026-09-01', casa: 'Roma', trasferta: 'Lecce', gc: 0, gt: 0, gcPT: 0, gtPT: 0, angoliC: null, angoliT: null, cartC: null, cartT: null },
  ];
  const out = risultatiDaCsv(new Map([['I1', righe]]), '2026-10-16');
  assert.equal(out.length, 1);
  assert.equal(out[0].fonte, 'football-data.co.uk');
  assert.equal(out[0].competizione, 'Serie A');
  assert.equal(out[0].angoliC, 7);
  assert.equal(out[0].data, '2026-10-18');
});

// --- orchestrazione (CLI) --------------------------------------------------
function fontiFinte({ org, odds, uk } = {}) {
  const chiamate = { org: [], odds: [], uk: [] };
  return {
    chiamate,
    footballDataUk: { async partite(codice, stagioni) { chiamate.uk.push(`${codice}/${stagioni.join(',')}`); if (uk instanceof Error) throw uk; return uk ?? []; } },
    footballDataOrg: { async risultati(finestra, opz) { chiamate.org.push({ finestra, opz }); if (org instanceof Error) throw org; return org ?? []; } },
    oddsApi: { async risultati(sport, opz) { chiamate.odds.push({ sport, opz }); if (odds instanceof Error) throw odds; return odds?.[sport] ?? []; } },
  };
}
const nuovaRaccolta = (rimasti = 300) => ({ crediti: { usati: 2, rimasti }, erroriGiro: [] });

test('sopraSotto: linea della selezione diversa da quella del mercato → null', () => {
  const x = r(3, 2, null, null, { angoliC: 6, angoliT: 4 });
  assert.equal(esitoSelezione('Under/Over 2.5', 'Over 3.5', x), null);
  assert.equal(esitoSelezione('Angoli Under/Over 9.5', 'Over 10.5', x), null);
  assert.equal(esitoSelezione('Under/Over 2.5', 'Over 2.5', x), 'vinta');
});

test('fonti in disaccordo sui gol: esito null e segnalazione con partita e fonti', () => {
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [giocata('inter', 'Inter Milan - Monza')], scartate: [] } });
  const csv = { casa: 'Inter', trasferta: 'Monza', data: '2026-10-18', inizio: '2026-10-18T12:00:00Z', gc: 3, gt: 1, gcPT: 1, gtPT: 0, fonte: 'football-data.co.uk', competizione: 'Serie A' };
  const out = aggiornaEsiti(dir, [risInter, csv], ADESSO);
  assert.equal(out.aggiornate, 0);
  assert.equal(leggi(dir, '2026-10-18').giocate[0].esito, null);
  assert.equal(out.errori.length, 1);
  assert.match(out.errori[0], /Inter Milan - Monza/);
  assert.match(out.errori[0], /football-data\.org/);
  assert.match(out.errori[0], /football-data\.co\.uk/);
});

test('aggiornaEsitiGiro: lega senza partite oggi, CSV della stagione corrente scaricato e giocata chiusa', async () => {
  const angoli = { ...giocata('ang', 'Inter Milan - Monza'), mercato: 'Angoli Under/Over 9.5', selezione: 'Over 9.5' };
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [angoli], scartate: [] } });
  const riga = { data: '2026-10-18', casa: 'Inter', trasferta: 'Monza', gc: 2, gt: 1, gcPT: 1, gtPT: 0, angoliC: 7, angoliT: 5, cartC: 1, cartT: 2 };
  const f = fontiFinte({ uk: [riga] });
  const out = await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f, chiavi: { footballDataOrg: 'T' }, raccolta: nuovaRaccolta(), csv: new Map() });
  assert.deepEqual(f.chiamate.uk, ['I1/2627']);
  assert.equal(out.aggiornate, 1);
  assert.equal(leggi(dir, '2026-10-18').giocate[0].esito, 'vinta');
  // CSV già scaricato dalla raccolta: nessun nuovo download.
  const dir2 = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [angoli], scartate: [] } });
  const f2 = fontiFinte();
  await aggiornaEsitiGiro({ dirData: dir2, adesso: ADESSO, fonti: f2, chiavi: { footballDataOrg: 'T' }, raccolta: nuovaRaccolta(), csv: new Map([['I1', [riga]]]) });
  assert.equal(f2.chiamate.uk.length, 0);
  assert.equal(leggi(dir2, '2026-10-18').giocate[0].esito, 'vinta');
});

test('aggiornaEsitiGiro: la finestra di football-data.org parte dalla giocata più vecchia, con tetto di 9 giorni', async () => {
  const vecchia = giocata('v', 'Inter Milan - Monza', { inizio: '2026-10-05T20:45:00+02:00' });
  const dir = cartella({ '2026-10-05': { data: '2026-10-05', giocate: [vecchia], scartate: [] } });
  const f = fontiFinte();
  await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f, chiavi: { footballDataOrg: 'T' }, raccolta: nuovaRaccolta(), csv: new Map() });
  assert.deepEqual(f.chiamate.org[0].finestra, { da: '2026-10-11', a: '2026-10-20' });
});

test('aggiornaEsitiGiro: Odds non chiamata per angoli, per partite oltre i 3 giorni; giocata vecchia segnalata', async () => {
  const el = { competizione: 'Europa League' };
  const angoli = giocata('a', 'Roma - Lecce', { ...el, mercato: 'Angoli Under/Over 9.5', selezione: 'Over 9.5' });
  const vecchia = giocata('v', 'Roma - Lecce', { ...el, inizio: '2026-10-10T20:45:00+02:00' });
  const dir = cartella({
    '2026-10-18': { data: '2026-10-18', giocate: [angoli], scartate: [] },
    '2026-10-10': { data: '2026-10-10', giocate: [vecchia], scartate: [] },
  });
  const f = fontiFinte();
  const raccolta = nuovaRaccolta();
  await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f, chiavi: { oddsApi: 'K', footballDataOrg: 'T' }, raccolta, csv: new Map() });
  assert.equal(f.chiamate.odds.length, 0);
  assert.equal(raccolta.crediti.usati, 2);
  assert.ok(raccolta.erroriGiro.some((e) => e.includes('Giocata v senza esito da 9 giorni')));
  assert.ok(!raccolta.erroriGiro.some((e) => e.includes('Giocata a senza esito')));
});

test('aggiornaEsitiGiro: finestra di football-data.org, nessuna chiamata a Odds per Serie A coperta da fd.org', async () => {
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [giocata('inter', 'Inter Milan - Monza')], scartate: [] } });
  const f = fontiFinte({ org: [risInter] });
  const raccolta = nuovaRaccolta();
  const out = await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f, chiavi: { footballDataOrg: 'TOK' }, raccolta, csv: new Map() });
  assert.equal(out.aggiornate, 1);
  assert.deepEqual(f.chiamate.org[0].finestra, { da: '2026-10-17', a: '2026-10-20' });
  assert.equal(f.chiamate.org[0].opz.chiave, 'TOK');
  assert.equal(f.chiamate.odds.length, 0);
  assert.deepEqual(raccolta.crediti, { usati: 2, rimasti: 300 });
});

test('aggiornaEsitiGiro: Europa League non coperta chiama Odds (2 crediti) se il budget lo consente', async () => {
  const g = giocata('el', 'Roma - Lecce', { competizione: 'Europa League' });
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [g], scartate: [] } });
  const ris = { casa: 'Roma', trasferta: 'Lecce', inizio: '2026-10-18T18:45:00Z', gc: 1, gt: 0, gcPT: null, gtPT: null, fonte: 'the-odds-api' };
  const f = fontiFinte({ org: [], odds: { soccer_uefa_europa_league: [ris] } });
  const raccolta = nuovaRaccolta(300);
  const out = await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f, chiavi: { oddsApi: 'K', footballDataOrg: 'TOK' }, raccolta, csv: new Map() });
  assert.deepEqual(f.chiamate.odds.map((c) => c.sport), ['soccer_uefa_europa_league']);
  assert.equal(out.aggiornate, 1);
  assert.deepEqual(raccolta.crediti, { usati: 4, rimasti: 298 });
});

test('aggiornaEsitiGiro: crediti sotto la riserva → Odds non chiamata', async () => {
  const g = giocata('el', 'Roma - Lecce', { competizione: 'Europa League' });
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [g], scartate: [] } });
  const f = fontiFinte();
  const raccolta = nuovaRaccolta(101);
  await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f, chiavi: { oddsApi: 'K', footballDataOrg: 'TOK' }, raccolta, csv: new Map() });
  assert.equal(f.chiamate.odds.length, 0);
  assert.equal(raccolta.crediti.usati, 2);
});

test('aggiornaEsitiGiro: errori delle fonti e chiave mancante finiscono in erroriGiro senza crash', async () => {
  const g = giocata('el', 'Roma - Lecce', { competizione: 'Europa League' });
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [g], scartate: [] } });
  const f = fontiFinte({ org: new Error('HTTP 503'), odds: new Error('HTTP 500') });
  const raccolta = nuovaRaccolta();
  const out = await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f, chiavi: { oddsApi: 'K', footballDataOrg: 'TOK' }, raccolta, csv: new Map() });
  assert.equal(out.aggiornate, 0);
  assert.equal(raccolta.erroriGiro.length, 2);
  assert.ok(raccolta.erroriGiro.some((e) => e.includes('football-data.org alle 08:00') && e.includes('HTTP 503')));
  assert.ok(raccolta.erroriGiro.some((e) => e.includes('The Odds API') && e.includes('HTTP 500')));
  assert.equal(raccolta.crediti.usati, 2);

  const senza = nuovaRaccolta();
  const f2 = fontiFinte();
  await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f2, chiavi: {}, raccolta: senza, csv: new Map() });
  assert.equal(f2.chiamate.org.length, 0);
  assert.ok(senza.erroriGiro.some((e) => e.includes('FOOTBALL_DATA_ORG_KEY')));
});

test('aggiornaEsitiGiro: senza giocate in attesa nessuna chiamata', async () => {
  const dir = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [giocata('x', 'Inter Milan - Monza', { esito: 'vinta' })], scartate: [] } });
  const f = fontiFinte();
  await aggiornaEsitiGiro({ dirData: dir, adesso: ADESSO, fonti: f, chiavi: { footballDataOrg: 'T' }, raccolta: nuovaRaccolta(), csv: new Map() });
  assert.equal(f.chiamate.org.length, 0);
});

test('multipla mista: il calcio scrive l\'esito delle sue gambe e chiude con la gamba NBA già vinta', () => {
  const gc = { ...giocata('g1', 'Inter Milan - Monza'), sport: 'calcio' };
  const nba = { sport: 'nba', partita: 'Boston Celtics - New York Knicks', inizio: '2026-10-17T20:00:00+02:00', mercato: 'Vincente', selezione: 'Boston Celtics' };
  const mista = (e) => ({ id: 'mx', sport: 'calcio + nba', tipo: 'multipla', esito: null, gambe: [gc, { ...nba, esito: e }] });
  const risultati = [{ casa: 'Inter Milan', trasferta: 'Monza', inizio: '2026-10-18T18:45:00Z', data: '2026-10-18', gc: 2, gt: 1, fonte: 'x' }];
  const d1 = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [mista('vinta')], scartate: [] } });
  const o1 = aggiornaEsiti(d1, risultati, new Date('2026-10-20T10:00:00Z'));
  const g1 = JSON.parse(readFileSync(join(d1, '2026-10-18.json'), 'utf8')).giocate[0];
  assert.equal(o1.aggiornate, 1);
  assert.equal(g1.esito, 'vinta');
  assert.equal(g1.gambe[0].esito, 'vinta');
  const d2 = cartella({ '2026-10-18': { data: '2026-10-18', giocate: [mista(undefined)], scartate: [] } });
  aggiornaEsiti(d2, risultati, new Date('2026-10-20T10:00:00Z'));
  const g2 = JSON.parse(readFileSync(join(d2, '2026-10-18.json'), 'utf8')).giocate[0];
  assert.equal(g2.gambe[0].esito, 'vinta');
  assert.equal(g2.esito, null);
});
