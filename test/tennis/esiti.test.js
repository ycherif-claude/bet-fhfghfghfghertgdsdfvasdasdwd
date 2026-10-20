import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setCompletati, esitoTennis, aggiornaEsitiTennis, aggiornaEsitiGiroTennis, risultatiDaTennisData, risultatiDaOdds,
} from '../../src/tennis/esiti.js';

const td = (extra = {}) => ({
  vincitore: 'Sinner J.', perdente: 'Alcaraz C.', setW: [6, 7], setL: [4, 6], commento: null, ...extra,
});

test('set completati: 6 con due di scarto, oppure 7 (tie-break)', () => {
  assert.equal(setCompletati([6, 7], [4, 6]), 2);
  assert.equal(setCompletati([7], [5]), 1);
  assert.equal(setCompletati([6, 3], [7, 1]), 1); // 6-7 completo (tie-break), 3-1 no
  assert.equal(setCompletati([5], [3]), 0);
  assert.equal(setCompletati([6], [5]), 0);
  assert.equal(setCompletati([4, 6, 2], [6, 4, 0]), 2);
  assert.equal(setCompletati([], []), 0);
  assert.equal(setCompletati(undefined, undefined), 0);
  assert.equal(setCompletati([10], [8]), 1); // set lungo ai vantaggi
});

test('esito: partita completa, vinta e persa, con il nome di The Odds API o di tennis-data', () => {
  assert.equal(esitoTennis('Jannik Sinner', td()), 'vinta');
  assert.equal(esitoTennis('Carlos Alcaraz', td()), 'persa');
  assert.equal(esitoTennis('Sinner J.', td()), 'vinta');
  assert.equal(esitoTennis('Mario Rossi', td()), null);
  assert.equal(esitoTennis('Jannik Sinner', null), null);
});

test('esito: ritiro dopo un set → vince chi passa il turno', () => {
  // Sinner perde il primo set 4-6, poi Alcaraz si ritira sul 3-1: passa Sinner.
  const r = td({ setW: [4, 3], setL: [6, 1], commento: 'Retired' });
  assert.equal(esitoTennis('Jannik Sinner', r), 'vinta');
  assert.equal(esitoTennis('Carlos Alcaraz', r), 'persa');
});

test('esito: ritiro prima della fine del primo set → rimborsata; walkover → rimborsata', () => {
  const ritiro = td({ setW: [3], setL: [2], commento: 'Retired' });
  assert.equal(esitoTennis('Jannik Sinner', ritiro), 'rimborsata');
  assert.equal(esitoTennis('Carlos Alcaraz', ritiro), 'rimborsata');
  const wo = td({ setW: [], setL: [], commento: 'Walkover' });
  assert.equal(esitoTennis('Jannik Sinner', wo), 'rimborsata');
  assert.equal(esitoTennis('Carlos Alcaraz', wo), 'rimborsata');
  // Squalifica: stessa regola del ritiro.
  assert.equal(esitoTennis('Jannik Sinner', td({ setW: [6, 2], setL: [3, 1], commento: 'Disqualified' })), 'vinta');
});

test('esito: dati incerti → null (commento sconosciuto, nessun set senza commento)', () => {
  assert.equal(esitoTennis('Jannik Sinner', td({ commento: 'Sospesa' })), null);
  assert.equal(esitoTennis('Jannik Sinner', td({ setW: [], setL: [] })), null);
  assert.equal(esitoTennis('Jannik Sinner', td({ setW: [6], setL: [4] })), null); // completa con un set solo: impossibile
  // Risultato di The Odds API già validato come completo.
  assert.equal(esitoTennis('Jannik Sinner', { vincitore: 'Jannik Sinner', perdente: 'Carlos Alcaraz', setW: [], setL: [], commento: null, completa: true }), 'vinta');
});

const ADESSO = new Date('2026-10-22T08:00:00Z');
const gamba = (selezione, extra = {}) => ({
  sport: 'tennis', competizione: 'ATP Paris Masters', partita: 'Jannik Sinner - Carlos Alcaraz',
  idPartita: 'tennis-2026-10-20-carlos-alcaraz-jannik-sinner', inizio: '2026-10-21T05:00:00+02:00',
  mercato: 'Vincente incontro', selezione, ...extra,
});
const rigaTd = (extra = {}) => ({
  data: '2026-10-20', torneo: 'Paris Masters', superficie: 'cemento', bestOf: 3,
  vincitore: 'Alcaraz C.', perdente: 'Sinner J.', setW: [6, 6], setL: [4, 3], commento: null, ...extra,
});
const ris = (righe, circuito = 'atp') => risultatiDaTennisData(new Map([[circuito, righe]]), '2026-10-01');

function dir(giocate, giorno = '2026-10-20') {
  const base = mkdtempSync(join(tmpdir(), 'tes-'));
  const d = join(base, 'giornate');
  mkdirSync(d);
  writeFileSync(join(d, `${giorno}.json`), JSON.stringify({ data: giorno, giocate }, null, 2));
  return d;
}
const leggi = (d, giorno = '2026-10-20') => JSON.parse(readFileSync(join(d, `${giorno}.json`), 'utf8')).giocate;

test('aggiorna: data di Roma ±1 giorno, anche le annullate; salta chiuse, calcio e partite recenti; cambia solo esito', () => {
  const calcio = { sport: 'calcio', competizione: 'Serie A', partita: 'A - B', inizio: '2026-10-20T20:45:00+02:00', mercato: '1X2', selezione: '1' };
  const giocate = [
    { id: 'a', ...gamba('Carlos Alcaraz'), esito: null, stato: 'annullata', extra: 7 },
    { id: 'b', ...gamba('Carlos Alcaraz'), esito: 'persa' },
    { id: 'c', ...calcio, esito: null },
    { id: 'm', sport: 'misto', tipo: 'multipla', esito: null, gambe: [{ ...calcio }, gamba('Carlos Alcaraz')] },
    { id: 'f', ...gamba('Carlos Alcaraz', { inizio: '2026-10-22T07:00:00+02:00' }), esito: null },
    { id: 'p', ...gamba('Jannik Sinner'), esito: null },
  ];
  const d = dir(giocate);
  const prima = leggi(d);
  // Data fuori di 2 giorni: nessun abbinamento.
  assert.equal(aggiornaEsitiTennis(d, ris([rigaTd({ data: '2026-10-23' })]), ADESSO).aggiornate, 0);
  const out = aggiornaEsitiTennis(d, ris([rigaTd()]), ADESSO);
  assert.equal(out.aggiornate, 2);
  assert.equal(out.file.length, 1);
  const dopo = leggi(d);
  assert.deepEqual(dopo.map((g) => g.esito), ['vinta', 'persa', null, null, null, 'persa']);
  assert.equal(dopo[3].gambe[1].esito, 'vinta');
  assert.equal(dopo[3].gambe[0].esito, undefined);
  // Solo `esito` cambia.
  const togli = (g) => { const { esito, ...resto } = g; return { ...resto, gambe: g.gambe?.map(({ esito: _, ...x }) => x) }; };
  assert.deepEqual(dopo.map(togli), prima.map(togli));
});

test('aggiorna: multipla mista con la gamba di calcio già chiusa → si chiude', () => {
  const calcio = { sport: 'calcio', partita: 'A - B', inizio: '2026-10-20T20:45:00+02:00', mercato: '1X2', selezione: '1', esito: 'vinta' };
  const d = dir([{ id: 'm', sport: 'misto', tipo: 'multipla', esito: null, gambe: [calcio, gamba('Carlos Alcaraz')] }]);
  const out = aggiornaEsitiTennis(d, ris([rigaTd()]), ADESSO);
  assert.equal(out.aggiornate, 1);
  assert.equal(leggi(d)[0].esito, 'vinta');
});

test('aggiorna: ritiro dopo un set, ritiro prima, walkover', () => {
  const d = dir([{ id: 'x', ...gamba('Carlos Alcaraz'), esito: null }]);
  aggiornaEsitiTennis(d, ris([rigaTd({ setW: [4, 2], setL: [6, 0], commento: 'Retired' })]), ADESSO);
  assert.equal(leggi(d)[0].esito, 'vinta');
  const d2 = dir([{ id: 'x', ...gamba('Carlos Alcaraz'), esito: null }]);
  aggiornaEsitiTennis(d2, ris([rigaTd({ setW: [2], setL: [1], commento: 'Retired' })]), ADESSO);
  assert.equal(leggi(d2)[0].esito, 'rimborsata');
  const d3 = dir([{ id: 'x', ...gamba('Jannik Sinner'), esito: null }]);
  aggiornaEsitiTennis(d3, ris([rigaTd({ setW: [], setL: [], commento: 'Walkover' })]), ADESSO);
  assert.equal(leggi(d3)[0].esito, 'rimborsata');
});

test('aggiorna: circuito diverso non si abbina; avviso dopo 7 giorni (le annullate solo se segnate)', () => {
  const d = dir([
    { id: 'v', ...gamba('Carlos Alcaraz', { inizio: '2026-10-11T15:00:00+02:00' }), esito: null },
    { id: 'n', ...gamba('Carlos Alcaraz', { inizio: '2026-10-11T15:00:00+02:00' }), esito: null, stato: 'annullata' },
  ], '2026-10-11');
  const out = aggiornaEsitiTennis(d, ris([rigaTd({ data: '2026-10-11' })], 'wta'), new Date('2026-10-20T08:00:00Z'));
  assert.equal(out.aggiornate, 0);
  assert.deepEqual(out.errori, ['Giocata v senza esito da 8 giorni']);
});

test('The Odds API: solo risultati completi (2 set, o 3 negli Slam ATP); fonti discordanti → nessun esito', () => {
  const sc = (set1, set2) => ({ giocatore1: 'Jannik Sinner', giocatore2: 'Carlos Alcaraz', inizio: '2026-10-21T03:00:00Z', set1, set2, vincitore: set1 > set2 ? 'Jannik Sinner' : 'Carlos Alcaraz', fonte: 'the-odds-api' });
  assert.equal(risultatiDaOdds([sc(2, 1)], 'ATP Paris Masters', 'atp').length, 1);
  assert.equal(risultatiDaOdds([sc(1, 0)], 'ATP Paris Masters', 'atp').length, 0);
  assert.equal(risultatiDaOdds([sc(2, 1)], 'ATP French Open', 'atp').length, 0);
  assert.equal(risultatiDaOdds([sc(3, 1)], 'ATP French Open', 'atp').length, 1);
  assert.equal(risultatiDaOdds([sc(3, 1)], 'ATP Paris Masters', 'atp').length, 0);
  // Slam riconosciuto anche solo dalla chiave; mai per la WTA.
  assert.equal(risultatiDaOdds([sc(3, 1)], 'Grand Slam', 'atp', 'tennis_atp_aus_open_singles').length, 1);
  assert.equal(risultatiDaOdds([sc(2, 1)], 'WTA Wimbledon', 'wta', 'tennis_wta_wimbledon').length, 1);

  const d = dir([{ id: 'x', ...gamba('Jannik Sinner'), esito: null }]);
  const soloOdds = risultatiDaOdds([sc(2, 0)], 'ATP Paris Masters', 'atp');
  assert.equal(aggiornaEsitiTennis(d, soloOdds, ADESSO).aggiornate, 1);
  assert.equal(leggi(d)[0].esito, 'vinta');

  const d2 = dir([{ id: 'x', ...gamba('Jannik Sinner'), esito: null }]);
  const out = aggiornaEsitiTennis(d2, [...soloOdds, ...ris([rigaTd()])], ADESSO);
  assert.equal(out.aggiornate, 0);
  assert.equal(leggi(d2)[0].esito, null);
  assert.equal(out.errori.length, 1);
  assert.match(out.errori[0], /^Risultati discordanti per Jannik Sinner - Carlos Alcaraz/);
});

function fonti({ td = [], odds = [] } = {}) {
  const chiamate = { td: [], odds: [] };
  return {
    chiamate,
    tennisData: { partite: async (anno, circuito) => { chiamate.td.push(`${circuito}${anno}`); return td; } },
    oddsTennis: { risultati: async (chiave) => { chiamate.odds.push(chiave); return odds; } },
  };
}
const PARIGI = { chiave: 'tennis_atp_paris_masters', titolo: 'ATP Paris Masters', circuito: 'atp' };
const raccolta = () => ({ erroriGiro: [], crediti: { usati: 1, rimasti: 200 } });

test('giro esiti: tennis-data dallo storico della raccolta, senza Odds se basta', async () => {
  const d = dir([{ id: 'x', ...gamba('Carlos Alcaraz'), esito: null }]);
  const f = fonti();
  const rc = raccolta();
  const out = await aggiornaEsitiGiroTennis({
    dirData: d, adesso: ADESSO, fonti: f, chiavi: { oddsApi: 'K' }, raccolta: rc,
    storico: new Map([['atp', [rigaTd()]]]), tornei: [PARIGI], budgetResiduo: 5,
  });
  assert.equal(out.aggiornate, 1);
  assert.deepEqual(f.chiamate, { td: [], odds: [] });
  assert.deepEqual(rc.crediti, { usati: 1, rimasti: 200 });
});

test('giro esiti: storico mancante → stagione corrente scaricata; Odds /scores solo dopo 1 giorno e con 2 crediti', async () => {
  const vecchia = { id: 'x', ...gamba('Jannik Sinner', { inizio: '2026-10-20T15:00:00+02:00' }), esito: null };
  const recente = { id: 'y', ...gamba('Jannik Sinner', { inizio: '2026-10-21T22:00:00+02:00', competizione: 'WTA Wuhan Open', partita: 'Iga Swiatek - Coco Gauff', selezione: 'Iga Swiatek' }), esito: null };
  const sc = { giocatore1: 'Jannik Sinner', giocatore2: 'Carlos Alcaraz', inizio: '2026-10-20T13:00:00Z', set1: 2, set2: 0, vincitore: 'Jannik Sinner', fonte: 'the-odds-api' };
  const tornei = [PARIGI, { chiave: 'tennis_wta_wuhan_open', titolo: 'WTA Wuhan Open', circuito: 'wta' }];

  const d = dir([vecchia, recente]);
  const f = fonti({ odds: [sc] });
  const rc = raccolta();
  const out = await aggiornaEsitiGiroTennis({ dirData: d, adesso: ADESSO, fonti: f, chiavi: { oddsApi: 'K' }, raccolta: rc, storico: new Map(), tornei, budgetResiduo: 2 });
  assert.deepEqual(f.chiamate.td.sort(), ['atp2026', 'wta2026']);
  assert.deepEqual(f.chiamate.odds, ['tennis_atp_paris_masters']); // Wuhan: giocata da meno di 1 giorno
  assert.equal(out.aggiornate, 1);
  assert.deepEqual(leggi(d).map((g) => g.esito), ['vinta', null]);
  assert.deepEqual(rc.crediti, { usati: 3, rimasti: 198 });

  // Budget residuo di 1 credito: niente /scores, e l'errore lo dice.
  const d2 = dir([vecchia]);
  const f2 = fonti({ odds: [sc] });
  const rc2 = raccolta();
  await aggiornaEsitiGiroTennis({ dirData: d2, adesso: ADESSO, fonti: f2, chiavi: { oddsApi: 'K' }, raccolta: rc2, storico: new Map(), tornei, budgetResiduo: 1 });
  assert.deepEqual(f2.chiamate.odds, []);
  assert.deepEqual(rc2.erroriGiro, ['The Odds API (esiti tennis) alle 10:00: crediti insufficienti per i risultati di ATP Paris Masters']);
  assert.equal(leggi(d2)[0].esito, null);
});

test('giro esiti: nessuna giocata in attesa → nessuna chiamata', async () => {
  const d = dir([]);
  const f = fonti();
  const out = await aggiornaEsitiGiroTennis({ dirData: d, adesso: ADESSO, fonti: f, chiavi: {}, raccolta: raccolta(), storico: new Map(), tornei: [], budgetResiduo: 0 });
  assert.equal(out.aggiornate, 0);
  assert.deepEqual(f.chiamate, { td: [], odds: [] });
});

test("giro esiti: a gennaio il 404 sul file dell'anno nuovo non è un errore", async () => {
  const d = dir([{ id: 'x', ...gamba('Carlos Alcaraz', { inizio: '2026-12-31T15:00:00+01:00' }), esito: null }], '2026-12-31');
  const rc = raccolta();
  const f = {
    tennisData: {
      partite: async (anno) => {
        if (anno === 2027) throw Object.assign(new Error('non trovato'), { status: 404 });
        return [rigaTd({ data: '2026-12-31' })];
      },
    },
    oddsTennis: { risultati: async () => [] },
  };
  const out = await aggiornaEsitiGiroTennis({ dirData: d, adesso: new Date('2027-01-02T08:00:00Z'), fonti: f, chiavi: {}, raccolta: rc, storico: new Map(), tornei: [], budgetResiduo: 0 });
  assert.deepEqual(rc.erroriGiro, []);
  assert.equal(out.aggiornate, 1);
  assert.equal(leggi(d, '2026-12-31')[0].esito, 'vinta');
});

const AVVISO_RIMBORSATA = (id) => `Multipla ${id} con gamba rimborsata: bet365 paga una quota ridotta, controlla l'importo`;

test('aggiorna: multipla vinta con una gamba rimborsata → esito vinta e avviso', () => {
  const calcio = { sport: 'calcio', partita: 'A - B', inizio: '2026-10-20T20:45:00+02:00', mercato: '1X2', selezione: '1', esito: 'rimborsata' };
  const d = dir([{ id: 'm', sport: 'misto', tipo: 'multipla', esito: null, gambe: [calcio, gamba('Carlos Alcaraz')] }]);
  const out = aggiornaEsitiTennis(d, ris([rigaTd()]), ADESSO);
  assert.equal(leggi(d)[0].esito, 'vinta');
  assert.deepEqual(out.errori, [AVVISO_RIMBORSATA('m')]);
});

test('giro esiti: l\'avviso della multipla chiusa al primo passaggio resta anche dopo il secondo (Odds)', async () => {
  const calcio = { sport: 'calcio', partita: 'A - B', inizio: '2026-10-20T20:45:00+02:00', mercato: '1X2', selezione: '1', esito: 'rimborsata' };
  const wta = gamba('Iga Swiatek', { competizione: 'WTA Wuhan Open', partita: 'Iga Swiatek - Coco Gauff', idPartita: 'tennis-2026-10-20-coco-gauff-iga-swiatek' });
  const vecchia = { id: 'x', ...gamba('Jannik Sinner', { inizio: '2026-10-20T15:00:00+02:00' }), esito: null };
  const sc = { giocatore1: 'Jannik Sinner', giocatore2: 'Carlos Alcaraz', inizio: '2026-10-20T13:00:00Z', set1: 2, set2: 0, vincitore: 'Jannik Sinner', fonte: 'the-odds-api' };
  const d = dir([{ id: 'm', sport: 'misto', tipo: 'multipla', esito: null, gambe: [calcio, wta] }, vecchia]);
  const rc = raccolta();
  await aggiornaEsitiGiroTennis({
    dirData: d, adesso: ADESSO, fonti: fonti({ odds: [sc] }), chiavi: { oddsApi: 'K' }, raccolta: rc,
    storico: new Map([['atp', []], ['wta', [rigaTd({ vincitore: 'Swiatek I.', perdente: 'Gauff C.' })]]]), tornei: [PARIGI], budgetResiduo: 2,
  });
  assert.deepEqual(leggi(d).map((g) => g.esito), ['vinta', 'vinta']);
  assert.deepEqual(rc.erroriGiro, [`Esiti tennis alle 10:00: ${AVVISO_RIMBORSATA('m')}`]);
});
