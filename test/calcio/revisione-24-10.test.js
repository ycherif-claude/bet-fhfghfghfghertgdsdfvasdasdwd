// Revisione delle correzioni del 24/10/2026: raccolta del calcio rifatta lo stesso giorno, eventi doppi solo alla
// stessa ora, esiti del mattino dal tabellone ESPN senza summary, alias "vitoria" che prendeva il Vitória brasiliano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidatiOdss, completaQuoteOdss } from '../../src/calcio/odss.js';
import { aggiornaEsitiGiro } from '../../src/calcio/esiti.js';
import { abbinaSquadra } from '../../src/calcio/squadre.js';
import { stessaSquadra } from '../../src/controlli/espn.js';

const DATA = '2026-10-24';
const ADESSO = new Date('2026-10-24T06:40:00Z');
const riassunto = { miei: {}, prob: null, fonteProb: null, mediana: { HOME: { quota: 2, n: 5 } } };

test('I1: raccolta rifatta con il budget del calcio finito → la partita unita "a,b" e le sue quote restano, nessuna riga fuorviante', async () => {
  const d = mkdtempSync(join(tmpdir(), 'rev-i1-'));
  mkdirSync(join(d, 'raccolta'), { recursive: true });
  mkdirSync(join(d, 'stato'), { recursive: true });
  const unito = { id: 'a,b', casa: '1. FC Köln', trasferta: 'FC Schalke 04', inizio: '2026-10-24T13:30:00Z', campionato: 'Bundesliga', mercati: { '1x2': riassunto, dc: riassunto, 'ou|2.5': riassunto } };
  writeFileSync(join(d, 'raccolta', `${DATA}-odss.json`), JSON.stringify({ data: DATA, completamento: { alle: '2026-10-24T07:40:00+02:00' }, erroriGiro: [], eventi: [unito] }));
  writeFileSync(join(d, 'stato', 'odss.json'), JSON.stringify({ rimaste: 440, giornate: { [DATA]: { usate: 4, perSport: { calcio: 4 } } } }));
  const chiamate = [];
  const r = await completaQuoteOdss({ dirData: d, data: DATA, adesso: ADESSO, chiave: 'K', gruppi: [['a', 'b']], fetch: async (u) => { chiamate.push(u); throw new Error('niente rete'); }, attesaMs: 0 });
  assert.equal(chiamate.length, 0);
  assert.deepEqual(r.eventi.map((e) => e.id), ['a,b']);
  assert.ok(r.eventi[0].mercati.dc);
  assert.ok(!r.errori.some((e) => /senza doppia chance|budget insufficiente/.test(e)), r.errori.join(' | '));
  const salvato = JSON.parse(readFileSync(join(d, 'raccolta', `${DATA}-odss.json`), 'utf8'));
  assert.deepEqual(salvato.eventi.map((e) => [e.id, Object.keys(e.mercati).length]), [['a,b', 3]]);
});

test('M1: eventi con gli stessi nomi si uniscono solo se iniziano entro 15 minuti; altrimenti ambiguo → nessuno', () => {
  const ev = (id, inizio) => ({ id, casa: 'Napoli', trasferta: 'Como', inizio, campionato: 'Serie A', mercati: {} });
  const nostra = [{ idPartita: 'x', sport: 'calcio', casa: 'Napoli', trasferta: 'Como', inizio: '2026-10-24T20:45:00+02:00' }];
  assert.deepEqual(candidatiOdss(nostra, [ev('a', '2026-10-24T18:45:00Z'), ev('b', '2026-10-24T18:55:00Z')]).get('x').map((e) => e.id), ['a', 'b']);
  assert.equal(candidatiOdss(nostra, [ev('a', '2026-10-24T18:45:00Z'), ev('b', '2026-10-24T19:30:00Z')]).has('x'), false);
});

test('M3: esiti del mattino dal tabellone ESPN (punteggio e stato): nessuna richiesta di summary per una partita finita ai 90', async () => {
  const d = mkdtempSync(join(tmpdir(), 'rev-m3-'));
  mkdirSync(join(d, 'giornate'), { recursive: true });
  writeFileSync(join(d, 'giornate', '2026-10-23.json'), JSON.stringify({ data: '2026-10-23', giocate: [
    { id: 'e', sport: 'calcio', competizione: 'Serie B', partita: 'Empoli - Vicenza', idPartita: 'e', inizio: '2026-10-23T20:30:00+02:00', tipo: 'singola', mercato: '1X2', selezione: '1', quota: 1.9, stato: 'confermata', esito: null },
  ] }));
  const summary = [];
  const fonti = {
    espn: { partite: async () => [{ id: 'e1', casa: 'Empoli', trasferta: 'Vicenza', inizio: '2026-10-23T18:30:00Z', stato: 'STATUS_FULL_TIME', gc: 2, gt: 0, gcPT: 1, gtPT: 0 }] },
    opz: { fetch: async (u) => { summary.push(u); throw new Error('summary non serve'); } },
    footballDataUk: { partite: async () => [], partiteExtra: async () => [] },
  };
  const out = await aggiornaEsitiGiro({ dirData: join(d, 'giornate'), adesso: new Date('2026-10-24T05:40:00Z'), fonti, chiavi: {}, raccolta: { erroriGiro: [], crediti: { usati: 0, rimasti: 400 } } });
  assert.equal(out.aggiornate, 1);
  assert.deepEqual(summary, []);
});

test('M4: il Vitória brasiliano non diventa il Vitória Guimarães; il portoghese resta riconosciuto', () => {
  assert.equal(stessaSquadra('Vitória', 'Vitoria Guimaraes'), false);
  assert.equal(abbinaSquadra('Vitória', ['Vitoria', 'Bahia']), 'Vitoria');
  assert.equal(abbinaSquadra('Vitória SC', ['Guimaraes', 'Porto']), 'Guimaraes');
  assert.equal(abbinaSquadra('Vitoria Guimaraes', ['Guimaraes', 'Porto']), 'Guimaraes');
});

test('ESPN tabellone: punteggi e primo tempo letti dal formato reale (stringhe di cifre)', async () => {
  const { espn } = await import('../../src/controlli/espn.js');
  const tabellone = { events: [{ id: '700', date: '2026-10-23T18:30Z', status: { type: { name: 'STATUS_FULL_TIME' } }, competitions: [{
    status: { type: { name: 'STATUS_FULL_TIME' } },
    competitors: [
      { homeAway: 'home', score: '0', team: { displayName: 'Empoli' }, linescores: [{ displayValue: '0', value: 0 }, { displayValue: '0', value: 0 }] },
      { homeAway: 'away', score: '2', team: { displayName: 'Vicenza' }, linescores: [{ displayValue: '1', value: 1 }, { displayValue: '1', value: 1 }] },
    ],
  }] }] };
  const fetch = async () => ({ ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(tabellone) });
  const [p] = await espn.partite('ita.2', '2026-10-23', { fetch });
  assert.deepEqual([p.stato, p.gc, p.gt, p.gcPT, p.gtPT], ['STATUS_FULL_TIME', 0, 2, 0, 1]);
});
