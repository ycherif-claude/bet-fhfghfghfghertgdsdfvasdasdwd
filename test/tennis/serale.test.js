import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  finestraNotturna, raccoltaSeraleTennis, partiteNotturne, aggiungiSeraleTennis, erroriSeraleTennis,
} from '../../src/tennis/serale.js';
import { costruisciDati } from '../../src/build/costruisci-sito.js';

const DATA = '2026-10-20';
const adesso = new Date('2026-10-20T20:10:00Z'); // 22:10 a Roma
const ORARIO = new Date('2026-10-20T20:00:00Z'); // 22:00 a Roma
const CLI = fileURLToPath(new URL('../../src/tennis/serale.js', import.meta.url));

// --- giornata e raccolta serale di prova ---

function dir() {
  const d = mkdtempSync(join(tmpdir(), 'tennis-serale-'));
  mkdirSync(join(d, 'giornate'), { recursive: true });
  mkdirSync(join(d, 'raccolta'), { recursive: true });
  mkdirSync(join(d, 'segnature'), { recursive: true });
  return d;
}

// Giocata del mattino (singola di calcio) valida per la build e per il bankroll.
const giocataMattino = (n, euro, extra = {}) => ({
  id: `calcio-${DATA}-casa${n}-ospite${n}-1x2-1`,
  sport: 'calcio',
  competizione: 'Serie A',
  partita: `Casa${n} - Ospite${n}`,
  idPartita: `calcio-${DATA}-casa${n}-ospite${n}`,
  inizio: '2026-10-20T18:45:00+02:00',
  tipo: 'singola',
  mercato: '1X2',
  selezione: '1',
  prob: 0.6,
  quota: 1.9,
  value: 0.14,
  quotaMinima: 1.75,
  puntata: { euro, percentuale: 1 },
  stato: 'in_attesa',
  motivoStato: null,
  oraUltimoControllo: null,
  esito: null,
  ...extra,
});

function scriviGiornata(d, giocate, extra = {}) {
  const candidati = giocate.map(({ tipo, value, quotaMinima, puntata, stato, motivoStato, oraUltimoControllo, esito, ...c }) => ({ ...c, tipo: 'singola' }));
  const g = {
    data: DATA, generataAlle: '2026-10-20T08:20:00+02:00', giro: 'claude', notizieControllate: true,
    competizioniNonCoperte: [], candidati, giocate, scartate: [{ idCandidato: 'x', motivo: 'value insufficiente' }], erroriGiro: [],
    ...extra,
  };
  writeFileSync(join(d, 'giornate', `${DATA}.json`), `${JSON.stringify(g, null, 2)}\n`);
  return g;
}

const leggiGiornata = (d) => JSON.parse(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'));

// Partita tennis notturna: il primo giocatore ha value positivo (0,6 × 1,9 − 1 = 0,14).
const partitaTennis = (g1, g2, inizio) => {
  const slug = (s) => s.toLowerCase().replace(/ /g, '-');
  const [x, y] = [slug(g1), slug(g2)].sort();
  const mercato = (sel, p, quota) => ({
    mercato: 'Vincente incontro', selezione: sel, probModello: p, probPinnacle: p, quota,
    fonteQuota: 'mediana di 3 bookmaker (The Odds API)', oraQuota: '2026-10-20T21:50:00+02:00', frequenzaCampionato: null,
    spiegazione: `Vincente incontro: vince se ${sel} vince la partita`,
  });
  return {
    idPartita: `tennis-${DATA}-${x}-${y}`, sport: 'tennis', competizione: 'ATP Shanghai', partita: `${g1} - ${g2}`,
    casa: g1, trasferta: g2, inizio, modello: 'elo', lambda: null, elo: null, superficie: 'cemento', bestOf: 3,
    pesoModello: 0.5, ragionamentoBase: ['Elo di prova'], mercati: [mercato(g1, 0.6, 1.9), mercato(g2, 0.4, 2.1)],
  };
};

const NOTTURNE = [
  partitaTennis('Jannik Sinner', 'Carlos Alcaraz', '2026-10-21T03:00:00+02:00'),
  partitaTennis('Alexander Zverev', 'Holger Rune', '2026-10-21T04:00:00+02:00'),
  partitaTennis('Daniil Medvedev', 'Casper Ruud', '2026-10-21T05:00:00+02:00'),
  partitaTennis('Taylor Fritz', 'Ben Shelton', '2026-10-21T06:00:00+02:00'),
];

function scriviSerale(d, partite, { notizie = true, erroriGiro = [] } = {}) {
  const r = { data: DATA, generataAlle: '2026-10-20T21:50:00+02:00', crediti: { usati: 1, rimasti: 200 }, competizioniNonCoperte: [], erroriGiro, partite };
  writeFileSync(join(d, 'raccolta', `${DATA}-serale-tennis.json`), `${JSON.stringify(r, null, 2)}\n`);
  if (notizie) {
    writeFileSync(join(d, 'raccolta', `${DATA}-serale-tennis-notizie.json`), JSON.stringify({
      controllateAlle: '2026-10-20T22:05:00+02:00', partiteControllate: partite.map((p) => p.idPartita), correzioni: [], esclusioni: [],
    }));
  }
}

const segna = (d, idGiocata, extra) => writeFileSync(join(d, 'segnature', `${idGiocata}.json`), JSON.stringify({
  idGiocata, fatta: true, puntataReale: 6, quotaReale: 1.9, ora: '2026-10-20T10:00:00+02:00', ...extra,
}));

const nuove = (prima, dopo, k) => dopo[k].slice(prima[k].length);

// --- finestra e raccolta ---

test('finestra notturna: dall\'orario serale alle 08:00 di Roma del giorno dopo', () => {
  const f = finestraNotturna(DATA, ORARIO);
  assert.equal(f.da.getTime(), ORARIO.getTime());
  assert.equal(f.a.toISOString(), '2026-10-21T06:00:00.000Z');
  // Cambio dell'ora (25/10): le 08:00 del 26/10 sono le 07:00 UTC.
  assert.equal(finestraNotturna('2026-10-25', new Date('2026-10-25T21:00:00Z')).a.toISOString(), '2026-10-26T07:00:00.000Z');
});

const SHANGHAI = { chiave: 'tennis_atp_shanghai', titolo: 'ATP Shanghai', circuito: 'atp' };
const TOKYO = { chiave: 'tennis_wta_tokyo', titolo: 'WTA Tokyo', circuito: 'wta' };
const libro = (g1, g2) => ['pinnacle', 'bet365', 'unibet'].map((chiave) => ({ chiave, aggiornato: 'T', quote: { [g1]: 1.8, [g2]: 2.05 } }));
const ev = (id, g1, g2, inizio) => ({ id, giocatore1: g1, giocatore2: g2, inizio });

function fonti({ tornei = [SHANGHAI, TOKYO], eventi = {}, rimasti = 200 } = {}) {
  const chiamate = { eventi: [], quote: [], td: [] };
  return {
    chiamate,
    oddsTennis: {
      torneiAttivi: async () => tornei,
      eventi: async (chiave, finestra) => { chiamate.eventi.push({ chiave, finestra }); return { eventi: eventi[chiave] ?? [], rimasti }; },
      quote: async (chiave) => {
        chiamate.quote.push(chiave);
        return { eventi: (eventi[chiave] ?? []).map((e) => ({ ...e, bookmaker: libro(e.giocatore1, e.giocatore2) })), rimasti: rimasti - chiamate.quote.length };
      },
    },
    tennisData: {
      partite: async (anno, circuito) => { chiamate.td.push(`${circuito}${anno}`); throw new Error('HTTP 503'); },
    },
  };
}

test('raccolta serale: solo partite notturne non già fra i candidati, 1 credito per torneo con partite', async () => {
  const d = dir();
  // Fra i candidati del mattino c'è già Sinner - Alcaraz (in notturna).
  const gia = { ...giocataMattino(1, 6), idPartita: `tennis-${DATA}-carlos-alcaraz-jannik-sinner`, id: `tennis-${DATA}-carlos-alcaraz-jannik-sinner-vincente-incontro-jannik-sinner` };
  scriviGiornata(d, [gia]);
  const f = fonti({
    eventi: {
      [SHANGHAI.chiave]: [
        ev('a', 'Jannik Sinner', 'Carlos Alcaraz', '2026-10-21T01:00:00Z'), // già candidata
        ev('b', 'Alexander Zverev', 'Holger Rune', '2026-10-21T02:00:00Z'), // 04:00: dentro
        ev('c', 'Daniil Medvedev', 'Casper Ruud', '2026-10-20T19:30:00Z'), // 21:30: prima del giro serale
        ev('d', 'Taylor Fritz', 'Ben Shelton', '2026-10-21T06:30:00Z'), // 08:30: giornata dopo
      ],
      [TOKYO.chiave]: [ev('e', 'Iga Swiatek', 'Coco Gauff', '2026-10-20T19:00:00Z')], // solo fuori finestra
    },
  });
  const r = await raccoltaSeraleTennis({ data: DATA, adesso, orario: ORARIO, fonti: f, chiavi: { oddsApi: 'K' }, dirData: d });
  assert.deepEqual(r.partite.map((p) => p.idPartita), [`tennis-${DATA}-alexander-zverev-holger-rune`]);
  assert.equal(r.partite[0].sport, 'tennis');
  assert.deepEqual(f.chiamate.quote, [SHANGHAI.chiave]);
  assert.deepEqual(r.crediti, { usati: 1, rimasti: 199 });
  // Finestra chiesta all'API: dall'orario serale (qui già passato: da adesso, 22:10) alle 08:00 di domani.
  assert.equal(f.chiamate.eventi[0].finestra.da.getTime(), adesso.getTime());
  assert.equal(f.chiamate.eventi[0].finestra.a.toISOString(), '2026-10-21T06:00:00.000Z');
  // Storico: lo stesso del mattino (tre stagioni); qui giù → errori e solo Pinnacle.
  assert.deepEqual(f.chiamate.td.sort(), ['atp2024', 'atp2025', 'atp2026']);
  const scritto = JSON.parse(readFileSync(join(d, 'raccolta', `${DATA}-serale-tennis.json`), 'utf8'));
  assert.deepEqual(scritto.partite.map((p) => p.idPartita), r.partite.map((p) => p.idPartita));
  assert.equal(partiteNotturne(d, DATA), 1);
});

test('raccolta serale: crediti alla riserva → nessuna quota, torneo scoperto', async () => {
  const d = dir();
  scriviGiornata(d, []);
  const f = fonti({ rimasti: 100, eventi: { [SHANGHAI.chiave]: [ev('b', 'Alexander Zverev', 'Holger Rune', '2026-10-21T02:00:00Z')] } });
  const r = await raccoltaSeraleTennis({ data: DATA, adesso, orario: ORARIO, fonti: f, chiavi: { oddsApi: 'K' }, dirData: d });
  assert.deepEqual(f.chiamate.quote, []);
  assert.deepEqual(r.partite, []);
  assert.deepEqual(r.competizioniNonCoperte, ['ATP Shanghai: crediti insufficienti']);
  assert.equal(partiteNotturne(d, DATA), 0);
});

test('partiteNotturne: file assente → 0', () => {
  assert.equal(partiteNotturne(dir(), DATA), 0);
});

// --- aggiunta ---

test('aggiunta: giocate, candidati e scartate esistenti identici byte per byte; nuove in fondo, nessuna multipla', () => {
  const d = dir();
  const prima = scriviGiornata(d, [giocataMattino(1, 6), giocataMattino(2, 6)]);
  scriviSerale(d, NOTTURNE.slice(0, 3));
  const r = aggiungiSeraleTennis({ dirData: d, adesso });
  const dopo = leggiGiornata(d);
  for (const k of ['giocate', 'candidati', 'scartate', 'erroriGiro', 'competizioniNonCoperte']) {
    prima[k].forEach((x, i) => assert.equal(JSON.stringify(dopo[k][i]), JSON.stringify(x), `${k}[${i}]`));
  }
  for (const k of ['data', 'generataAlle', 'giro', 'notizieControllate']) assert.equal(dopo[k], prima[k]);
  const nuoveGiocate = nuove(prima, dopo, 'giocate');
  assert.ok(nuoveGiocate.length >= 1);
  assert.equal(r.aggiunte, nuoveGiocate.length);
  assert.ok(nuoveGiocate.every((g) => !Array.isArray(g.gambe) && g.sport === 'tennis'));
  assert.equal(nuove(prima, dopo, 'candidati').length, 3);
  assert.ok(nuove(prima, dopo, 'scartate').some((s) => s.motivo === 'nessuna multipla nel giro serale'));
  assert.ok(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8').endsWith('}\n'));
});

test('tetto: con una giocata segnata e una solo proposta conta anche la proposta non segnata', () => {
  // Bankroll 200 → tetto 24 €. Segnata 6 + proposta aperta 6 → restano 12 €.
  // Nuove: multipla (2 €) + singola 6 € ci stanno, la seconda singola no. Senza le proposte aperte ne entrerebbero 2.
  const d = dir();
  const prima = scriviGiornata(d, [giocataMattino(1, 6), giocataMattino(2, 6), giocataMattino(3, 6, { stato: 'annullata' })]);
  segna(d, giocataMattino(1, 6).id);
  scriviSerale(d, NOTTURNE.slice(0, 2));
  aggiungiSeraleTennis({ dirData: d, adesso });
  const dopo = leggiGiornata(d);
  const n = nuove(prima, dopo, 'giocate');
  assert.equal(n.length, 1);
  assert.ok(n.reduce((s, g) => s + g.puntata.euro, 0) <= 12 + 1e-9);
  assert.ok(nuove(prima, dopo, 'scartate').some((s) => s.motivo === 'tetto giornaliero'));
});

test('tetto già pieno con le proposte non segnate → nessuna nuova giocata', () => {
  const d = dir();
  const prima = scriviGiornata(d, [giocataMattino(1, 12), giocataMattino(2, 12)]);
  scriviSerale(d, NOTTURNE.slice(0, 1));
  const r = aggiungiSeraleTennis({ dirData: d, adesso });
  const dopo = leggiGiornata(d);
  assert.equal(r.aggiunte, 0);
  assert.equal(nuove(prima, dopo, 'giocate').length, 0);
  assert.equal(nuove(prima, dopo, 'candidati').length, 1);
  assert.deepEqual(nuove(prima, dopo, 'scartate').map((s) => s.motivo), ['tetto giornaliero']);
});

test('stop settimanale raggiunto contando le proposte aperte → nessuna nuova giocata', () => {
  // Persa segnata −44 € questa settimana (distanza dallo stop 6 €), proposta aperta 6 € → distanza 0.
  const d = dir();
  const persa = giocataMattino(1, 44, { inizio: '2026-10-19T18:45:00+02:00', esito: 'persa', id: 'calcio-persa', idPartita: 'calcio-p' });
  writeFileSync(join(d, 'giornate', '2026-10-19.json'), JSON.stringify({ data: '2026-10-19', candidati: [], giocate: [persa], scartate: [] }));
  segna(d, 'calcio-persa', { puntataReale: 44 });
  const prima = scriviGiornata(d, [giocataMattino(2, 6)]);
  scriviSerale(d, NOTTURNE.slice(0, 1));
  aggiungiSeraleTennis({ dirData: d, adesso });
  const dopo = leggiGiornata(d);
  assert.equal(nuove(prima, dopo, 'giocate').length, 0);
  assert.deepEqual(nuove(prima, dopo, 'scartate').map((s) => s.motivo), ['stop settimanale']);
});

test('9 singole già proposte → al massimo 1 nuova, le altre "limite giornaliero singole"', () => {
  const d = dir();
  const prima = scriviGiornata(d, Array.from({ length: 9 }, (_, i) => giocataMattino(i + 1, 0.5)));
  scriviSerale(d, NOTTURNE.slice(0, 3));
  aggiungiSeraleTennis({ dirData: d, adesso });
  const dopo = leggiGiornata(d);
  assert.equal(nuove(prima, dopo, 'giocate').length, 1);
  assert.ok(nuove(prima, dopo, 'scartate').some((s) => s.motivo === 'limite giornaliero singole'));
});

test('partita già presente fra i candidati → non ripetuta', () => {
  const d = dir();
  scriviGiornata(d, [giocataMattino(1, 6)]);
  scriviSerale(d, NOTTURNE.slice(0, 2));
  aggiungiSeraleTennis({ dirData: d, adesso });
  const prima = leggiGiornata(d);
  // Seconda raccolta con una partita già aggiunta e una nuova.
  scriviSerale(d, [NOTTURNE[1], NOTTURNE[3]]);
  aggiungiSeraleTennis({ dirData: d, adesso });
  const dopo = leggiGiornata(d);
  const ids = dopo.candidati.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(nuove(prima, dopo, 'candidati').map((c) => c.idPartita), [NOTTURNE[3].idPartita]);
});

test('notizie mancanti con partite presenti → errore e nessuna scrittura', () => {
  const d = dir();
  scriviGiornata(d, [giocataMattino(1, 6)]);
  scriviSerale(d, NOTTURNE.slice(0, 1), { notizie: false });
  const testo = readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8');
  assert.throws(() => aggiungiSeraleTennis({ dirData: d, adesso }), /notizie mancante.*serale-tennis-notizie\.json/i);
  assert.equal(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'), testo);
});

test('notizie non valide → errore e nessuna scrittura', () => {
  const d = dir();
  scriviGiornata(d, []);
  scriviSerale(d, NOTTURNE.slice(0, 1));
  writeFileSync(join(d, 'raccolta', `${DATA}-serale-tennis-notizie.json`), JSON.stringify({
    controllateAlle: '2026-10-20T22:05:00+02:00', correzioni: [{ idPartita: 'tennis-x', mercato: 'Vincente incontro', selezione: 'A', delta: 0.01, motivo: 'm', fonte: 'f' }], esclusioni: [],
  }));
  const testo = readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8');
  assert.throws(() => aggiungiSeraleTennis({ dirData: d, adesso }), /partita inesistente/);
  assert.equal(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'), testo);
});

test('seconda esecuzione con gli stessi file → 0 aggiunte, file invariato', () => {
  const d = dir();
  scriviGiornata(d, [giocataMattino(1, 6)]);
  scriviSerale(d, NOTTURNE.slice(0, 3), { erroriGiro: ['tennis-data.co.uk ATP 2026 alle 21:50: HTTP 503'] });
  const r1 = aggiungiSeraleTennis({ dirData: d, adesso });
  assert.ok(r1.aggiunte >= 1);
  const testo = readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8');
  assert.equal(JSON.parse(testo).erroriGiro.filter((e) => e.includes('HTTP 503')).length, 1);
  const r2 = aggiungiSeraleTennis({ dirData: d, adesso: new Date(adesso.getTime() + 60000) });
  assert.equal(r2.aggiunte, 0);
  assert.equal(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'), testo);
});

test('id di un candidato già presente con contenuto diverso → errore, nessuna scrittura', () => {
  const d = dir();
  scriviGiornata(d, []);
  scriviSerale(d, NOTTURNE.slice(0, 1));
  aggiungiSeraleTennis({ dirData: d, adesso });
  const testo = readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8');
  const cambiata = { ...NOTTURNE[0], mercati: NOTTURNE[0].mercati.map((m) => ({ ...m, quota: m.quota + 0.05 })) };
  scriviSerale(d, [cambiata]);
  assert.throws(() => aggiungiSeraleTennis({ dirData: d, adesso }), /già presente con un contenuto diverso/);
  assert.equal(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'), testo);
});

test('una nuova partita già iniziata → errore chiaro, nessuna scrittura', () => {
  const d = dir();
  scriviGiornata(d, []);
  scriviSerale(d, [partitaTennis('Jannik Sinner', 'Carlos Alcaraz', '2026-10-20T22:05:00+02:00')]);
  const testo = readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8');
  assert.throws(() => aggiungiSeraleTennis({ dirData: d, adesso }), /già iniziata.*Jannik Sinner - Carlos Alcaraz/);
  assert.equal(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'), testo);
});

test('giornata di oggi mancante → errore, nessuna scrittura', () => {
  const d = dir();
  scriviSerale(d, NOTTURNE.slice(0, 1));
  assert.throws(() => aggiungiSeraleTennis({ dirData: d, adesso }), /Giornata di oggi mancante/);
  assert.equal(existsSync(join(d, 'giornate', `${DATA}.json`)), false);
});

test('nessuna partita notturna → 0 aggiunte, nessuna scrittura (notizie non servono)', () => {
  const d = dir();
  scriviGiornata(d, [giocataMattino(1, 6)]);
  scriviSerale(d, [], { notizie: false, erroriGiro: ['The Odds API alle 21:50: manca ODDS_API_KEY'] });
  const testo = readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8');
  assert.deepEqual(aggiungiSeraleTennis({ dirData: d, adesso }), { aggiunte: 0, candidati: 0 });
  assert.equal(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'), testo);
});

test('la build legge la giornata dopo l\'aggiunta senza erroriDati', () => {
  const d = dir();
  scriviGiornata(d, [giocataMattino(1, 6)]);
  segna(d, giocataMattino(1, 6).id);
  scriviSerale(d, NOTTURNE);
  aggiungiSeraleTennis({ dirData: d, adesso });
  const dati = costruisciDati(d, adesso);
  assert.deepEqual(dati.erroriDati, []);
});

// --- riga di comando ---

const cli = (d, ...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, SERALE_ADESSO: adesso.toISOString(), SERALE_DIR_DATA: d, ODDS_API_KEY: '' },
});

test('CLI --conta stampa solo il numero di partite notturne', () => {
  const d = dir();
  scriviSerale(d, NOTTURNE.slice(0, 2));
  const r = cli(d, '--conta');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '2\n');
  assert.equal(cli(dir(), '--conta').stdout, '0\n');
});

test('CLI --raccolta senza ODDS_API_KEY: file serale con partite [] e l\'errore, uscita 0', () => {
  const d = dir();
  scriviGiornata(d, []);
  const r = cli(d, '--raccolta');
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(join(d, 'raccolta', `${DATA}-serale-tennis.json`), 'utf8'));
  assert.deepEqual(j.partite, []);
  assert.ok(j.erroriGiro.some((e) => /^The Odds API alle 22:10: manca ODDS_API_KEY$/.test(e)), j.erroriGiro.join('\n'));
});

test('CLI --aggiungi: giornata mancante → uscita 1 con il motivo; uso sbagliato → uscita 1', () => {
  const d = dir();
  scriviSerale(d, NOTTURNE.slice(0, 1));
  const r = cli(d, '--aggiungi');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Giornata di oggi mancante/);
  assert.equal(cli(d).status, 1);
});

test('CLI --aggiungi: aggiunge e stampa il riepilogo', () => {
  const d = dir();
  scriviGiornata(d, []);
  scriviSerale(d, NOTTURNE.slice(0, 1));
  const r = cli(d, '--aggiungi');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 giocate aggiunte/);
});

// --- errori della raccolta serale nella giornata ---

const ERR_CHIAVE = 'The Odds API alle 21:50: manca ODDS_API_KEY';
const ERR_STORICO = 'tennis-data alle 21:50: file 2026.xlsx non raggiungibile';

test('errori: una riga per errore nella giornata, mai ripetuta, il resto invariato', () => {
  const d = dir();
  scriviGiornata(d, [giocataMattino(1, 6)], { erroriGiro: [ERR_STORICO] });
  scriviSerale(d, [], { notizie: false, erroriGiro: [ERR_CHIAVE, ERR_STORICO, ERR_CHIAVE] });
  const prima = leggiGiornata(d);
  assert.deepEqual(erroriSeraleTennis({ dirData: d, adesso }), { aggiunti: 1, avvisi: [] });
  const dopo = leggiGiornata(d);
  assert.deepEqual(dopo.erroriGiro, [ERR_STORICO, ERR_CHIAVE]);
  assert.deepEqual({ ...dopo, erroriGiro: prima.erroriGiro }, prima);
  const testo = readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8');
  assert.equal(erroriSeraleTennis({ dirData: d, adesso }).aggiunti, 0);
  assert.equal(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'), testo);
});

test('errori: raccolta senza errori → nessuna scrittura; poi --aggiungi non li ripete', () => {
  const d = dir();
  scriviGiornata(d, []);
  scriviSerale(d, NOTTURNE.slice(0, 1));
  const testo = readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8');
  assert.equal(erroriSeraleTennis({ dirData: d, adesso }).aggiunti, 0);
  assert.equal(readFileSync(join(d, 'giornate', `${DATA}.json`), 'utf8'), testo);
  const d2 = dir();
  scriviGiornata(d2, []);
  scriviSerale(d2, NOTTURNE.slice(0, 1), { erroriGiro: [ERR_STORICO] });
  erroriSeraleTennis({ dirData: d2, adesso });
  aggiungiSeraleTennis({ dirData: d2, adesso });
  assert.deepEqual(leggiGiornata(d2).erroriGiro, [ERR_STORICO]);
});

test('errori: raccolta serale mancante o illeggibile → una riga con il motivo', () => {
  const d = dir();
  scriviGiornata(d, []);
  assert.equal(erroriSeraleTennis({ dirData: d, adesso }).aggiunti, 1);
  assert.deepEqual(leggiGiornata(d).erroriGiro, [`Tennis serale alle 22:10: raccolta serale mancante (data/raccolta/${DATA}-serale-tennis.json)`]);
  const d2 = dir();
  scriviGiornata(d2, []);
  writeFileSync(join(d2, 'raccolta', `${DATA}-serale-tennis.json`), '{rotto');
  erroriSeraleTennis({ dirData: d2, adesso });
  const [riga, ...altre] = leggiGiornata(d2).erroriGiro;
  assert.equal(altre.length, 0);
  assert.match(riga, new RegExp(`^Tennis serale alle 22:10: Raccolta serale tennis illeggibile: data/raccolta/${DATA}-serale-tennis.json`));
});

test('errori: giornata di oggi mancante → avviso, nessun file scritto, nessuna eccezione', () => {
  const d = dir();
  scriviSerale(d, [], { notizie: false, erroriGiro: [ERR_CHIAVE] });
  const r = erroriSeraleTennis({ dirData: d, adesso });
  assert.equal(r.aggiunti, 0);
  assert.match(r.avvisi.join(' '), /Giornata di oggi mancante/);
  assert.equal(existsSync(join(d, 'giornate', `${DATA}.json`)), false);
});

test('CLI --errori: aggiunge gli errori della raccolta serale e stampa il riepilogo, uscita 0', () => {
  const d = dir();
  scriviGiornata(d, []);
  scriviSerale(d, [], { notizie: false, erroriGiro: [ERR_CHIAVE] });
  const r = cli(d, '--errori');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 errori aggiunti/);
  assert.deepEqual(leggiGiornata(d).erroriGiro, [ERR_CHIAVE]);
  const r2 = cli(dir(), '--errori');
  assert.equal(r2.status, 0, r2.stderr);
});

// --- workflow serale ---

test('serale.yml: --errori non blocca l\'NBA; orario validato prima dei calcoli; salvataggio senza avvio', () => {
  const t = readFileSync(new URL('../../.github/workflows/serale.yml', import.meta.url), 'utf8');
  assert.match(t, /name: Errori serali tennis nella giornata\n\s+if: steps\.orario\.outputs\.tennis == 'si'\n(\s+#[^\n]*\n)*\s+continue-on-error: true\n\s+run: npm run serale-tennis -- --errori/);
  // Riga di --orario: data ISO, tipo nba o tennis, date -d riuscito; altrimenti tennis=no.
  const passo = t.slice(t.indexOf('name: Orario del giro serale'), t.indexOf('name: Raccolta serale tennis'));
  for (const s of ['riga=$(npm run serale-nba -- --orario | tail -n 1) || riga="errore"', '[[ "$orario" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]', '[ "$tipo" = nba ] || [ "$tipo" = tennis ]', 'inizio=$(date -d "$orario" +%s 2>/dev/null)', '$(( inizio - 3600 ))']) {
    assert.ok(passo.includes(s), s);
  }
  assert.ok(!passo.includes('$(date -d "$orario" +%s) - 3600'), 'nessun calcolo su un orario non validato');
  assert.ok(passo.indexOf('=~') < passo.indexOf('date -d "$orario"'), 'validazione prima di date -d');
  assert.ok(passo.indexOf('date -d "$orario"') < passo.indexOf('inizio - 3600'));
  assert.match(t, /name: Salva la raccolta serale tennis\n(\s+#[^\n]*\n)*\s+if: steps\.orario\.outputs\.tennis == 'si' && steps\.quando\.outputs\.esito != 'avvia'\n/);
});

test('giro-serale.md: una parte fallita salta solo quella parte; test, commit e push sempre per quello che è riuscito', () => {
  const t = readFileSync(new URL('../../docs/routine/giro-serale.md', import.meta.url), 'utf8');
  for (const s of [
    'salta solo quella parte', 'I passi 10-12 (`npm test`, commit e push, ultimo messaggio) si eseguono **sempre** per quello che è riuscito',
    'quale parte è fallita o è stata saltata e perché', 'va cancellato prima del commit',
  ]) assert.ok(t.includes(s), s);
  assert.ok(!t.includes('fermati: non inventare niente'), 'la regola generale non ferma più tutto il giro');
  assert.ok(!t.includes('fermati sulla parte tennis'));
});
