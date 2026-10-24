// Calcio odss mirato [correzioni 24/10/2026, punto 1]. Il 23 e il 24/10 la raccolta odss chiedeva 1x2, dc e ou di
// tutto il calcio del mondo (23.726 e 26.141 righe, 1713 e 4492 partite): 6 richieste e "ou: quote incomplete" ogni
// giorno, e il 24/10 107 pronostici su 129 senza quota. Ora:
// - lo step raccolta-odss chiede solo l'1x2 della giornata (il filtro league non accetta più campionati: vedi README),
//   lasciando sempre una richiesta per il completamento;
// - la raccolta del calcio abbina le NOSTRE partite e chiede 1x2, dc e ou solo per quegli event_id (parametro
//   `event_id`, più id separati da virgola, a blocchi), senza finestra;
// - più eventi del feed per la stessa partita (stesse squadre, stesso orario: fonti diverse unite male) si uniscono:
//   il 24/10 erano il motivo di "Bundesliga: 3 partite su 6 non trovate su odss-api" (1. FC Köln - FC Schalke 04 e
//   1. FC Cologne - FC Schalke 04, Den Haag e Ado Den Haag…).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { abbinaEventiOdss, candidatiOdss, completaQuoteOdss, eventiOdss, scaricaQuoteOdss } from '../../src/calcio/odss.js';
import { eseguiRaccolta } from '../../src/calcio/raccolta.js';
import { risposta, bkOdss, rigaOdss, RESET } from '../odss/aiuti.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const DATA = '2026-10-24';
const ADESSO = new Date('2026-10-24T05:36:00Z');
const x12 = (h, d, a) => ({ HOME: h, DRAW: d, AWAY: a });
const LIBRI = ['pinnacle', 'bwin', 'unibet', 'snai'];
// Quote aggiornate poco prima della raccolta (quelle dei miei bookmaker più vecchie di 6 ore non contano).
const bk = (k, o) => bkOdss(k, o, { last_update: '2026-10-24T05:30:00+00:00' });

// fetch finto che filtra per event_id (CSV) e per mercato (CSV), con paginazione a `perPagina` righe.
function fetchMirato(righe, { perPagina = 5000, rimaste = 450 } = {}) {
  const chiamate = [];
  let r = rimaste;
  const f = async (url) => {
    chiamate.push(String(url));
    const u = new URL(String(url));
    r--;
    const ids = u.searchParams.get('event_id')?.split(',') ?? null;
    const mercati = u.searchParams.get('market').split(',');
    const tutte = righe.filter((x) => mercati.includes(x.market) && (!ids || ids.includes(x.event_id)));
    const offset = Number(u.searchParams.get('offset') ?? 0);
    const odds = tutte.slice(offset, offset + perPagina);
    const h = { 'x-ratelimit-remaining': String(r), 'x-ratelimit-limit': '500', 'x-ratelimit-reset': String(RESET) };
    return risposta(200, { count: tutte.length, offset, returned: odds.length, limit: perPagina, odds }, h);
  };
  f.chiamate = chiamate;
  return f;
}

const partita = (id, casa, trasferta, inizio, extra = {}) => [
  rigaOdss({ event_id: id, home_team: casa, away_team: trasferta, event: `${casa} - ${trasferta}`, commence_time: inizio, market: '1x2', bookmakers: LIBRI.map((k) => bk(k, x12(2.1, 3.3, 3.6))), ...extra }),
  rigaOdss({ event_id: id, home_team: casa, away_team: trasferta, event: `${casa} - ${trasferta}`, commence_time: inizio, market: 'dc', bookmakers: LIBRI.map((k) => bk(k, { '1X': 1.3, 12: 1.33, X2: 1.7 })) }),
  rigaOdss({ event_id: id, home_team: casa, away_team: trasferta, event: `${casa} - ${trasferta}`, commence_time: inizio, market: 'ou', line: 2.5, bookmakers: LIBRI.map((k) => bk(k, { OVER: 1.9, UNDER: 1.9 })) }),
];

test('raccolta odss: solo l\'1x2 della giornata, lasciando una richiesta del calcio per dc e ou delle nostre partite', async () => {
  // Weekend: l'1x2 di tutto il mondo in 5 pagine. Il calcio ne chiede al massimo 3 (tetto 4, una resta).
  const righe = Array.from({ length: 5 }, (_, i) => partita(`p${i}`, `Casa ${i}`, `Ospite ${i}`, '2026-10-24T13:00:00Z')[0]);
  const f = fetchMirato(righe, { perPagina: 1 });
  const { file, stato } = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, stato: null, fetch: f, attesaMs: 0 });
  assert.equal(CONFIG.odss.tetti.calcio, 4);
  assert.equal(f.chiamate.length, 3);
  for (const u of f.chiamate.map((x) => new URL(x))) {
    assert.equal(u.searchParams.get('market'), '1x2');
    assert.equal(u.searchParams.has('league'), false);
    assert.equal(u.searchParams.has('event_id'), false);
  }
  assert.equal(stato.giornate[DATA].perSport.calcio, 3);
  assert.equal(file.eventi.length, 3);
  assert.ok(file.erroriGiro.some((x) => /1x2: quote incomplete/.test(x)), file.erroriGiro.join(' | '));
});

test('completamento: 1x2, dc e ou solo per gli event_id delle nostre partite, senza finestra; file solo con le nostre', async () => {
  const d = mkdtempSync(join(tmpdir(), 'odss-mirato-'));
  const righe = [...partita('a1', 'Torino', 'Monza', '2026-10-24T18:45:00Z'), ...partita('z9', 'Altra', 'Squadra', '2026-10-24T18:45:00Z')];
  // Mattino: solo 1x2 (2 eventi del mondo).
  const f1 = fetchMirato(righe);
  const { file } = await scaricaQuoteOdss({ data: DATA, adesso: ADESSO, chiave: CHIAVE, stato: null, fetch: f1, attesaMs: 0 });
  mkdirSync(join(d, 'raccolta'), { recursive: true });
  mkdirSync(join(d, 'stato'), { recursive: true });
  writeFileSync(join(d, 'raccolta', `${DATA}-odss.json`), JSON.stringify(file));
  writeFileSync(join(d, 'stato', 'odss.json'), JSON.stringify({ rimaste: 449, giornate: { [DATA]: { usate: 1, controlli: 0, perSport: { calcio: 1 } } } }));
  const f2 = fetchMirato(righe);
  const r = await completaQuoteOdss({ dirData: d, data: DATA, adesso: ADESSO, chiave: CHIAVE, gruppi: [['a1']], fetch: f2, attesaMs: 0 });
  assert.equal(f2.chiamate.length, 1);
  const u = new URL(f2.chiamate[0]);
  assert.equal(u.searchParams.get('event_id'), 'a1');
  assert.equal(u.searchParams.get('market'), '1x2,dc,ou');
  assert.equal(u.searchParams.get('sport'), 'calcio');
  assert.equal(u.searchParams.has('commence_from'), false);
  assert.ok(!f2.chiamate[0].includes(CHIAVE));
  const salvato = JSON.parse(readFileSync(join(d, 'raccolta', `${DATA}-odss.json`), 'utf8'));
  assert.deepEqual(salvato.eventi.map((e) => e.id), ['a1']);
  assert.deepEqual(Object.keys(salvato.eventi[0].mercati).sort(), ['1x2', 'dc', 'ou|2.5']);
  assert.deepEqual(r.eventi.map((e) => e.id), ['a1']);
  const stato = JSON.parse(readFileSync(join(d, 'stato', 'odss.json'), 'utf8'));
  assert.equal(stato.giornate[DATA].perSport.calcio, 2);
});

test('completamento: eventi doppi della stessa partita uniti (bookmaker di entrambi), id a blocchi in ordine di priorità', async () => {
  const d = mkdtempSync(join(tmpdir(), 'odss-mirato-'));
  mkdirSync(join(d, 'raccolta'), { recursive: true });
  // Due eventi del feed per Köln - Schalke: bookmaker diversi; unibet in tutti e due con la stessa quota.
  const k1 = partita('k1', '1. FC Köln', 'FC Schalke 04', '2026-10-24T13:30:00Z');
  const k2 = partita('k2', '1. FC Cologne', 'FC Schalke 04', '2026-10-24T13:30:00Z').map((x) => ({ ...x, bookmakers: [bk('goldbet', x.bookmakers[0].outcomes), bk('unibet', x.bookmakers[0].outcomes)] }));
  const altre = Array.from({ length: 3 }, (_, i) => partita(`q${i}`, `Casa ${i}`, `Ospite ${i}`, '2026-10-24T13:30:00Z')).flat();
  const righe = [...k1, ...k2, ...altre];
  writeFileSync(join(d, 'raccolta', `${DATA}-odss.json`), JSON.stringify({ data: DATA, eventi: eventiOdss(righe.filter((x) => x.market === '1x2')), erroriGiro: [] }));
  const f = fetchMirato(righe);
  const r = await completaQuoteOdss({ dirData: d, data: DATA, adesso: ADESSO, chiave: CHIAVE, gruppi: [['k1', 'k2'], ['q0'], ['q1'], ['q2']], fetch: f, attesaMs: 0, perRichiesta: 2 });
  // Blocchi da 2 id: [k1,k2], [q0,q1], [q2].
  assert.deepEqual(f.chiamate.map((x) => new URL(x).searchParams.get('event_id')), ['k1,k2', 'q0,q1', 'q2']);
  const unito = r.eventi.find((e) => e.id === 'k1,k2');
  assert.ok(unito, r.eventi.map((e) => e.id).join(' '));
  assert.equal(unito.casa, '1. FC Köln');
  assert.equal(unito.mercati['1x2'].mediana.HOME.n, 5);
  assert.deepEqual(Object.keys(unito.mercati['1x2'].miei).sort(), ['goldbet', 'snai']);
  // Budget finito a metà: le partite rimaste senza dc e ou si scrivono.
  const d2 = mkdtempSync(join(tmpdir(), 'odss-mirato-'));
  mkdirSync(join(d2, 'raccolta'), { recursive: true });
  mkdirSync(join(d2, 'stato'), { recursive: true });
  writeFileSync(join(d2, 'raccolta', `${DATA}-odss.json`), JSON.stringify({ data: DATA, eventi: eventiOdss(righe.filter((x) => x.market === '1x2')), erroriGiro: [] }));
  writeFileSync(join(d2, 'stato', 'odss.json'), JSON.stringify({ rimaste: 449, giornate: { [DATA]: { usate: 3, perSport: { calcio: 3 } } } }));
  const g = fetchMirato(righe);
  const r2 = await completaQuoteOdss({ dirData: d2, data: DATA, adesso: ADESSO, chiave: CHIAVE, gruppi: [['k1', 'k2'], ['q0'], ['q1'], ['q2']], fetch: g, attesaMs: 0, perRichiesta: 2 });
  assert.equal(g.chiamate.length, 1);
  assert.ok(r2.errori.some((x) => /3 partite senza doppia chance e under\/over/.test(x)), r2.errori.join(' | '));
  // Le partite non completate restano con il loro 1x2 del mattino.
  assert.ok(r2.eventi.some((e) => e.id === 'q2' && e.mercati['1x2']));
});

test('abbinamento: più eventi esatti della stessa partita non la fanno più sparire (dati veri del 24/10)', () => {
  const ev = (id, casa, trasferta, n) => ({ id, casa, trasferta, inizio: '2026-10-24T19:00:00Z', campionato: 'Eredivisie', mercati: { '1x2': { miei: {}, prob: null, mediana: { HOME: { quota: 2, n } } } } });
  const nostra = { idPartita: 'x', sport: 'calcio', casa: 'ADO Den Haag', trasferta: 'Heerenveen', inizio: '2026-10-24T21:00:00+02:00' };
  const eventi = [ev('a', 'Den Haag', 'Heerenveen', 4), ev('b', 'Ado Den Haag', 'Heerenveen', 9)];
  assert.deepEqual(candidatiOdss([nostra], eventi).get('x').map((e) => e.id), ['a', 'b']);
  // Senza completamento: l'evento con più bookmaker.
  assert.equal(abbinaEventiOdss([nostra], eventi).get('x').id, 'b');
  // Dati veri: prima 146 partite su 173 abbinate il 24/10.
  const raccolta = JSON.parse(readFileSync('data/raccolta/2026-10-24.json', 'utf8'));
  const odss = JSON.parse(readFileSync('data/raccolta/2026-10-24-odss.json', 'utf8'));
  const nostre = raccolta.partite.filter((p) => (p.sport ?? 'calcio') === 'calcio');
  const m = abbinaEventiOdss(nostre, odss.eventi);
  assert.ok(m.size >= 160, `abbinate ${m.size} su ${nostre.length}`);
  for (const id of ['1. FC Köln - FC Schalke 04', 'ADO Den Haag - Heerenveen', 'Wolverhampton Wanderers - Watford']) {
    assert.ok(m.has(nostre.find((p) => p.partita === id).idPartita), id);
  }
});

test('raccolta calcio: completa con dc e ou le nostre partite abbinate (in ordine di priorità) e usa le quote nuove', async () => {
  const DENTRO = '2026-10-20T18:45:00Z';
  const righe = partita('i1', 'Inter', 'Lecce', DENTRO).map((x) => ({ ...x, bookmakers: ['pinnacle', 'bwin', 'unibet', 'william'].map((k) => x.bookmakers[0] && bkOdss(k, x.bookmakers[0].outcomes, { last_update: '2026-10-20T05:00:00Z' })) }));
  const soloUnoXDue = eventiOdss(righe.filter((x) => x.market === '1x2'));
  const chiesti = [];
  const fonti = {
    odss: { eventi: soloUnoXDue, errori: [] },
    async completaOdss(gruppi) { chiesti.push(gruppi); return { eventi: eventiOdss(righe), errori: ['odss-api alle 07:40: prova'] }; },
    oddsApi: { async eventi(sport) { return { eventi: sport === 'soccer_italy_serie_a' ? [{ id: '1', casa: 'Inter Milan', trasferta: 'Lecce', inizio: DENTRO }] : [], rimasti: 412 }; }, async quote() { return { eventi: [], rimasti: 410 }; } },
    footballDataUk: { async partite() { return []; } },
  };
  const r = await eseguiRaccolta({ data: '2026-10-20', adesso: new Date('2026-10-20T05:35:40Z'), fonti, chiavi: { oddsApi: 'K' } });
  assert.deepEqual(chiesti, [[['i1']]]);
  assert.ok(r.erroriGiro.includes('odss-api alle 07:40: prova'));
  assert.ok(!r.erroriGiro.some((e) => /Serie A.*non trovate/.test(e)), r.erroriGiro.join(' | '));
});
