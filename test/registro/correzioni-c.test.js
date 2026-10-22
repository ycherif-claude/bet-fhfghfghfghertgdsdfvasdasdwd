// Correzioni parte C: esiti notturni da ESPN (C2), quote pre-partita del registro (C3), esiti provvisori,
// pronostici delle partite iniziate e partite comparse dopo (C4), ESPN che risponde 403 (C5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { esitoPerRegistro } from '../../src/esiti/rapidi.js';
import { aggiornaRegistro, righeDaRaccolta } from '../../src/registro/registro.js';
import { raccoglitorePrePartita } from '../../src/registro/chiusure.js';
import { leggiAvvisiFonti } from '../../src/registro/avvisi-fonti.js';
import { scarica } from '../../src/calcio/fonti/http.js';
import { aggiornaStoricoCoppe } from '../../src/coppe/storico.js';
import { eseguiGiro } from '../../src/giro/giro.js';

const cartella = () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-c-'));
  for (const s of ['raccolta', 'giornate', 'registro', 'segnature', 'storico', 'taratura']) mkdirSync(join(d, s));
  return d;
};
const leggi = (file) => JSON.parse(readFileSync(file, 'utf8'));
const risposta = (corpo, status = 200) => ({ ok: status < 400, status, headers: new Map(), text: async () => JSON.stringify(corpo) });
const finita = (gc, gt) => ({ header: { competitions: [{ status: { type: { name: 'STATUS_FULL_TIME' } }, competitors: [
  { homeAway: 'home', score: String(gc), linescores: [{ displayValue: '0' }] },
  { homeAway: 'away', score: String(gt), linescores: [{ displayValue: '0' }] },
] }] }, boxscore: { teams: [] } });
const fontiVuote = (extra = {}) => ({
  espn: { partite: async () => [] },
  eurolega: { giornata: async () => ({ partite: [] }) },
  thesportsdb: { round: async () => ({ partite: [] }) },
  footballDataUk: { partite: async () => [], partiteExtra: async () => [] },
  opz: { fetch: async () => risposta(finita(0, 0)) },
  ...extra,
});

// ---------- C2: partite serali americane nel giorno UTC precedente di ESPN ----------

test('C2 esiti calcio: la partita che ESPN elenca nel giorno precedente (UTC) si trova lo stesso', async () => {
  const chiesti = [];
  const fonti = fontiVuote({
    espn: { partite: async (camp, giorno) => {
      chiesti.push(giorno);
      return giorno === '2026-10-22' ? [{ id: '9', casa: 'Inter Miami CF', trasferta: 'Orlando City SC', inizio: '2026-10-23T00:30:00Z' }] : [];
    } },
    opz: { fetch: async () => risposta(finita(2, 1)) },
  });
  const gamba = { sport: 'calcio', competizione: 'Premier League', partita: 'Inter Miami CF - Orlando City SC', inizio: '2026-10-23T00:30:00Z', mercato: '1X2', selezione: '1' };
  const e = await esitoPerRegistro(gamba, fonti, cartella(), null);
  assert.deepEqual(e, { esito: 'vinta', provvisorio: false });
  assert.deepEqual(chiesti, ['2026-10-23', '2026-10-22']);
});

// ---------- C3: quote pre-partita ----------

const partitaEL = (extra = {}) => ({
  idPartita: 'basket-2026-10-21-real-madrid-fc-barcelona', sport: 'basket', competizione: 'Eurolega', partita: 'Real Madrid - FC Barcelona',
  inizio: '2026-10-21T20:45:00+02:00', modello: 'basket', pesoModello: 0.25,
  mercati: [
    { mercato: 'Vincente', selezione: 'Real Madrid', probModello: 0.6, probPinnacle: 0.55, quota: 1.75 },
    { mercato: 'Vincente', selezione: 'FC Barcelona', probModello: 0.4, probPinnacle: 0.45, quota: 2.15 },
  ],
  ...extra,
});
const raccolta = (data, partite, suffisso = '-basket') => ({ data, generataAlle: `${data}T07:50:00+02:00`, crediti: {}, competizioniNonCoperte: [], erroriGiro: [], partite, _suffisso: suffisso });
const scriviRaccolta = (d, r) => {
  const { _suffisso, ...contenuto } = r;
  writeFileSync(join(d, 'raccolta', `${r.data}${_suffisso}.json`), JSON.stringify(contenuto));
};

test('C3 righe del registro: quota pre-partita (non "di chiusura") con i minuti prima dell\'inizio', () => {
  const [r] = righeDaRaccolta({ partite: [partitaEL()] });
  assert.equal(r.quotaPrePartita, null);
  assert.equal(r.probPrePartita, null);
  assert.equal(r.minutiPrima, null);
  assert.equal('quotaChiusura' in r, false);
});

test('C3 pre-partita: file <data>-prepartita.json con quote, minuti prima e copertura per competizione', () => {
  const d = cartella();
  const lontana = partitaEL({ idPartita: 'basket-2026-10-21-x-y', partita: 'Olympiacos - Panathinaikos', inizio: '2026-10-21T23:45:00+02:00' });
  scriviRaccolta(d, raccolta('2026-10-21', [partitaEL(), lontana]));
  const bk = (chiave) => ({ chiave, mercati: { vincente: { casa: 1.7, trasferta: 2.2 } } });
  const c = raccoglitorePrePartita({ dirData: d, data: '2026-10-21', adesso: new Date('2026-10-21T18:00:00Z') });
  c.registra('basket', 'Eurolega', [
    { casa: 'Real Madrid', trasferta: 'FC Barcelona', inizio: '2026-10-21T18:45:00Z', bookmaker: [bk('pinnacle'), bk('a'), bk('b')] },
    { casa: 'Olympiacos', trasferta: 'Panathinaikos', inizio: '2026-10-21T21:45:00Z', bookmaker: [bk('pinnacle'), bk('a'), bk('b')] },
  ]);
  assert.equal(c.salva(), true);
  const f = leggi(join(d, 'registro', '2026-10-21-prepartita.json'));
  const q = f.quote['basket-2026-10-21-real-madrid-fc-barcelona|Vincente|Real Madrid'];
  assert.equal(q.quota, 1.7);
  assert.equal(q.minutiPrima, 45);
  assert.equal(Object.keys(f.quote).length, 2);
  assert.deepEqual(Object.keys(f.copertura), ['basket|Eurolega']);
  assert.equal(f.copertura['basket|Eurolega'].partite, 1);
});

test('C3 registro: quota pre-partita dal nuovo file (e dal vecchio -chiusure.json), copertura per competizione, vecchi campi rinominati', async () => {
  const d = cartella();
  const p20 = partitaEL({ idPartita: 'b-20', inizio: '2026-10-20T20:45:00+02:00' });
  const p19 = partitaEL({ idPartita: 'b-19', inizio: '2026-10-19T20:45:00+02:00' });
  scriviRaccolta(d, raccolta('2026-10-20', [p20]));
  scriviRaccolta(d, raccolta('2026-10-19', [p19]));
  writeFileSync(join(d, 'registro', '2026-10-20-prepartita.json'), JSON.stringify({
    quote: { 'b-20|Vincente|Real Madrid': { quota: 1.7, prob: 0.57, alle: 'x', minutiPrima: 60 } },
    copertura: { 'basket|Eurolega': { alle: 'x', partite: 1 } },
  }));
  writeFileSync(join(d, 'registro', '2026-10-19-chiusure.json'), JSON.stringify({ 'b-19|Vincente|Real Madrid': { quota: 1.8, prob: 0.5, alle: 'x' } }));
  // Registro del 19 già scritto con i vecchi nomi dei campi.
  const vecchie = righeDaRaccolta({ partite: [p19] }).map(({ quotaPrePartita, probPrePartita, minutiPrima, ...r }) => ({ ...r, quotaChiusura: null, probChiusura: null }));
  writeFileSync(join(d, 'registro', '2026-10-19.json'), JSON.stringify({ data: '2026-10-19', righe: vecchie }));
  await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-21T05:40:00Z'), fonti: fontiVuote() });
  const r20 = leggi(join(d, 'registro', '2026-10-20.json'));
  assert.equal(r20.righe[0].quotaPrePartita, 1.7);
  assert.equal(r20.righe[0].probPrePartita, 0.57);
  assert.equal(r20.righe[0].minutiPrima, 60);
  assert.equal(r20.righe[1].quotaPrePartita, null);
  assert.deepEqual(r20.coperturaPrePartita, ['basket|Eurolega']);
  const r19 = leggi(join(d, 'registro', '2026-10-19.json'));
  assert.equal(r19.righe[0].quotaPrePartita, 1.8);
  assert.equal('quotaChiusura' in r19.righe[0], false);
  assert.deepEqual(r19.coperturaPrePartita, []);
});

// ---------- C4: esiti provvisori, partite comparse dopo ----------

test('C4 registro: cartellini e angoli provvisori diventano definitivi quando il CSV di football-data li ha', async () => {
  const d = cartella();
  const riga = (mercato, selezione, esito) => ({
    sport: 'calcio', competizione: 'LaLiga', idPartita: 'calcio-2026-10-20-levante-athletic', partita: 'Levante - Athletic Bilbao',
    inizio: '2026-10-20T21:00:00+02:00', mercato, selezione, quotaPrePartita: null, probPrePartita: null, minutiPrima: null,
    esito, esitoProvvisorio: esito !== null,
  });
  writeFileSync(join(d, 'registro', '2026-10-20.json'), JSON.stringify({ data: '2026-10-20', righe: [
    riga('Cartellini Under/Over 4.5', 'Under 4.5', 'persa'), // ESPN: 5 cartellini
    riga('Angoli Under/Over 9.5', 'Over 9.5', 'vinta'),
  ] }));
  let chiamateEspn = 0;
  const fonti = fontiVuote({
    espn: { partite: async () => { chiamateEspn++; return []; } },
    footballDataUk: {
      partite: async (codice) => (codice === 'SP1' ? [{ data: '2026-10-20', casa: 'Levante', trasferta: 'Ath Bilbao', gc: 1, gt: 0, cartC: 3, cartT: 1, angoliC: 4, angoliT: 4 }] : []),
      partiteExtra: async () => [],
    },
  });
  await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-22T05:40:00Z'), fonti });
  const reg = leggi(join(d, 'registro', '2026-10-20.json'));
  assert.deepEqual(reg.righe.map((r) => [r.esito, r.esitoProvvisorio]), [['vinta', false], ['persa', false]]);
  assert.equal(chiamateEspn, 0, 'per i provvisori non si richiede ESPN di nuovo');
});

test('C4 registro: le partite comparse dopo nella raccolta si aggiungono al registro già scritto', async () => {
  const d = cartella();
  const a = partitaEL({ idPartita: 'b-a', inizio: '2026-10-20T20:45:00+02:00' });
  const b = partitaEL({ idPartita: 'b-b', partita: 'Olympiacos - Panathinaikos', inizio: '2026-10-20T21:00:00+02:00' });
  writeFileSync(join(d, 'registro', '2026-10-20.json'), JSON.stringify({ data: '2026-10-20', righe: righeDaRaccolta({ partite: [a] }) }));
  scriviRaccolta(d, raccolta('2026-10-20', [a, b]));
  const r = await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-21T05:40:00Z'), fonti: fontiVuote() });
  const reg = leggi(join(d, 'registro', '2026-10-20.json'));
  assert.deepEqual(reg.righe.map((x) => x.idPartita), ['b-a', 'b-a', 'b-b', 'b-b']);
  assert.equal(r.riepilogo[0].righe, 4);
});

test('C4 giro rifatto dopo l\'inizio di una partita: i pronostici già pubblicati di quella partita restano', () => {
  const d = cartella();
  const pafos = {
    idPartita: 'calcio-2026-10-23-pafos-riga-fc', sport: 'calcio', competizione: 'Conference League', partita: 'Pafos - Riga FC',
    inizio: '2026-10-23T09:00:00+02:00', pronostici: [{ mercato: 'Under/Over casa 0.5', selezione: 'Over 0.5', testo: 'Segna Pafos', prob: 0.85, probModello: 0.86, quotaMinima: 1.18, esito: null }],
  };
  const futura = { ...pafos, idPartita: 'calcio-2026-10-23-futura', partita: 'Futura - Altra', inizio: '2026-10-23T21:00:00+02:00' };
  writeFileSync(join(d, 'giornate', '2026-10-23.json'), JSON.stringify({
    data: '2026-10-23', generataAlle: '2026-10-23T08:05:00+02:00', giro: 'riserva', candidati: [], giocate: [], scartate: [], erroriGiro: [],
    pronostici: [pafos, futura],
  }));
  writeFileSync(join(d, 'raccolta', '2026-10-23.json'), JSON.stringify({
    data: '2026-10-23', generataAlle: '2026-10-23T07:35:00+02:00', crediti: {}, competizioniNonCoperte: [], erroriGiro: [], partite: [],
  }));
  const r = eseguiGiro({ dirData: d, adesso: new Date('2026-10-23T08:00:00Z'), modo: 'riserva' });
  assert.equal(r.scritto, true);
  const g = leggi(join(d, 'giornate', '2026-10-23.json'));
  // Iniziata: resta; non iniziata e non più proposta: va via con il nuovo giro.
  assert.deepEqual(g.pronostici.map((x) => x.partita), ['Pafos - Riga FC']);
});

// ---------- C5: ESPN ----------

test('C5 ESPN: intestazioni da browser (User-Agent e Accept) per ESPN, non per gli altri siti', async () => {
  const visti = [];
  const fetch = async (url, o) => { visti.push({ url, headers: o.headers }); return risposta({}); };
  await scarica('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20261022', { fetch });
  await scarica('https://www.football-data.co.uk/fixtures.csv', { fetch, headers: { 'User-Agent': 'analisi-giocate' } });
  assert.match(visti[0].headers['User-Agent'], /^Mozilla\/5\.0 .*Chrome\/\d+/);
  assert.match(visti[0].headers.Accept, /application\/json/);
  assert.ok(visti[0].headers['Accept-Language']);
  assert.deepEqual(visti[1].headers, { 'User-Agent': 'analisi-giocate' });
});

test('C5 ESPN 403: una sola richiesta (nessun nuovo tentativo) ed errore chiaro', async () => {
  let n = 0;
  const fetch = async () => { n++; return risposta({}, 403); };
  await assert.rejects(
    scarica('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20261022', { fetch, attesaMs: 0 }),
    (e) => e.status === 403 && e.espnBloccato === true && /ESPN.*403.*accesso negato/i.test(e.message),
  );
  assert.equal(n, 1);
});

test('C5 registro con ESPN in 403: una riga chiara negli avvisi del giorno (poi nel giro), niente raffica di richieste', async () => {
  const d = cartella();
  const ist = (id, partita, competizione) => ({ idPartita: id, sport: 'calcio', competizione, partita, inizio: '2026-10-22T18:45:00+02:00',
    mercato: '1X2', selezione: '1', testo: 'x', prob: 0.85, probModello: 0.86, quotaMinima: 1.18, esito: null });
  writeFileSync(join(d, 'registro', '2026-10-22-pronostici.json'), JSON.stringify({ data: '2026-10-22', pronostici: [
    ist('a', 'Juventus - Rennes', 'Europa League'), ist('b', 'Roma - Lille', 'Champions League'), ist('c', 'Lazio - Porto', 'Conference League'),
  ] }));
  let richieste = 0;
  const bloccata = async () => { richieste++; throw Object.assign(new Error('site.api.espn.com: HTTP 403 (ESPN: accesso negato)'), { status: 403, espnBloccato: true }); };
  const r = await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-23T05:40:00Z'), fonti: fontiVuote({ espn: { partite: bloccata } }) });
  assert.equal(richieste, 1);
  const riga = r.errori.find((e) => /ESPN/.test(e) && /403/.test(e));
  assert.ok(riga, r.errori.join(' | '));
  assert.match(riga, /registro/);
  assert.deepEqual(leggiAvvisiFonti(d, '2026-10-23'), [riga]);

  // Il giro del giorno la mette fra gli errori della giornata (pagina e Telegram).
  writeFileSync(join(d, 'raccolta', '2026-10-23.json'), JSON.stringify({
    data: '2026-10-23', generataAlle: '2026-10-23T07:35:00+02:00', crediti: {}, competizioniNonCoperte: [], erroriGiro: [], partite: [],
  }));
  const g = eseguiGiro({ dirData: d, adesso: new Date('2026-10-23T07:10:00Z'), modo: 'riserva' });
  assert.ok(g.giornata.erroriGiro.includes(riga), g.giornata.erroriGiro.join(' | '));
});

test('C5 storico coppe con ESPN in 403: si ferma subito, i giorni restano da riprendere e c\'è l\'avviso del giorno', async () => {
  const d = cartella();
  writeFileSync(join(d, 'storico', 'coppe-europee.json'), JSON.stringify({ tuttiIGiorni: true, partite: [
    { id: '9', coppa: 'Europa League', inizio: '2026-10-15T17:00Z', data: '2026-10-15', casa: { id: '1', nome: 'A' }, trasferta: { id: '2', nome: 'B' }, gc: 1, gt: 0, neutro: false, stato: 'STATUS_FULL_TIME' },
  ] }));
  let n = 0;
  const fetch = async () => { n++; return risposta({}, 403); };
  const r = await aggiornaStoricoCoppe({ dirData: d, adesso: new Date('2026-10-22T05:40:00Z'), fetch, parallele: 1 });
  assert.equal(n, 1);
  assert.equal(r.bloccato, true);
  const salvato = leggi(join(d, 'storico', 'coppe-europee.json'));
  assert.ok(salvato.daRiprendere.length > 100);
  assert.equal(salvato.partite.length, 1);
  const avvisi = leggiAvvisiFonti(d, '2026-10-22');
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0], /ESPN.*403.*coppe/);
  assert.ok(existsSync(join(d, 'registro', '2026-10-22-avvisi.json')));
});

test('C5 Elo europeo con ESPN in 403: il file di ieri resta, nessuna richiesta in più, avviso del giorno', async () => {
  const { aggiornaRating } = await import('../../src/coppe/rating.js');
  const d = cartella();
  writeFileSync(join(d, 'storico', 'coppe-europee.json'), JSON.stringify({ tuttiIGiorni: true, partite: [] }));
  const ieri = JSON.stringify({ aggiornatoAlle: '2026-10-21T05:40:00.000Z', rating: { 'ITA:Inter': 1700 } });
  writeFileSync(join(d, 'storico', 'elo-europeo.json'), ieri);
  let n = 0;
  const fetch = async () => { n++; return risposta({}, 403); };
  const fonti = { footballDataUk: { partite: async () => [], partiteExtra: async () => [] } };
  const r = await aggiornaRating({ dirData: d, adesso: new Date('2026-10-22T05:40:00Z'), fonti, fetch });
  assert.equal(r.nonAggiornato, true);
  // Solo le 3 richieste parallele già partite; nessuna per le squadre ESPN.
  assert.ok(n <= 3, String(n));
  assert.equal(readFileSync(join(d, 'storico', 'elo-europeo.json'), 'utf8'), ieri);
  assert.ok(leggiAvvisiFonti(d, '2026-10-22').some((x) => /ESPN.*403.*Elo europeo/.test(x)));
});
