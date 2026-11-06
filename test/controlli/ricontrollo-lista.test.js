import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiControlli } from '../../src/controlli/controlli.js';
import { bkOdss, fetchOdss, mattinoOdss, rigaOdss } from '../odss/aiuti.js';
import { applicaRicontrollo, valutaRicontrollo, vociRicontrollo } from '../../src/controlli/ricontrollo-lista.js';
import { quotaCalcio } from '../../src/controlli/quote.js';
import { messaggiRicontrollo, soloEssenziale } from '../../src/notifiche/telegram.js';
import { confrontoSettimanale } from '../../src/registro/confronto-settimanale.js';
import { testoRicontrollo } from '../../site/app.js';

const INIZIO = '2026-11-05T21:00:00+01:00';
const ore = (hhmm) => new Date(`2026-11-05T${hhmm}:00+01:00`);
const giocata = (extra = {}) => ({
  id: 'L-monaco',
  gambe: [{ sport: 'calcio', competizione: 'Conference League', partita: 'Monaco - Nordsjaelland', idPartita: 'monaco', inizio: INIZIO, mercato: '1X2', selezione: '1', quota: 1.42, probMercato: 0.67, probModello: 0.69, ...extra }],
});
const giornata = (...lista) => ({ data: '2026-11-05', coppieQuota2: { lista } });

test('ricontrollo: parte da 90 minuti prima, una volta sola, non a partita iniziata', () => {
  const g = giornata(giocata());
  assert.equal(vociRicontrollo(g, ore('19:20')).length, 0);
  const [v] = vociRicontrollo(g, ore('19:40'));
  assert.equal(v.id, 'ricontrollo|L-monaco');
  assert.equal(v.mercato, '1X2');
  assert.equal(vociRicontrollo(g, ore('21:00')).length, 0);
  applicaRicontrollo(g, new Map([[v.id, { quota: 1.45, prob: 0.66 }]]), [v], ore('19:40'));
  assert.equal(g.coppieQuota2.lista[0].gambe[0].ricontrollo.esito, 'confermata');
  assert.equal(g.coppieQuota2.lista[0].gambe[0].ricontrollo.minutiPrima, 80);
  assert.equal(vociRicontrollo(g, ore('20:30')).length, 0);
  // Senza lista non si chiede niente.
  assert.deepEqual(vociRicontrollo({}, ore('19:40')), []);
});

test('ricontrollo: fuori se la quota esce dai limiti o modello e mercato non sono più d\'accordo', () => {
  const g = giocata().gambe[0];
  assert.deepEqual(valutaRicontrollo(g, { quota: 1.5, prob: 0.65 }).motivi, []);
  assert.deepEqual(valutaRicontrollo(g, { quota: 1.24, prob: 0.68 }).motivi, ['quota 1,24 sotto 1,25']);
  assert.deepEqual(valutaRicontrollo(g, { quota: 1.77, prob: 0.66 }).motivi, ['quota 1,77 sopra 1,70']);
  const disaccordo = valutaRicontrollo(g, { quota: 1.5, prob: 0.638 });
  assert.equal(disaccordo.esito, 'fuori');
  assert.match(disaccordo.motivi[0], /non più d'accordo \(mercato 64%\)/);
  // Senza Pinnacle vale la mediana; senza nessuna probabilità si guarda solo la quota.
  assert.equal(valutaRicontrollo(g, { quota: 1.5, prob: null, probMediana: 0.6 }).esito, 'fuori');
  const soloQuota = valutaRicontrollo(g, { quota: 1.5, prob: null });
  assert.equal(soloQuota.esito, 'confermata');
  assert.equal(soloQuota.prob, null);
});

test('ricontrollo: senza quote riprova una sola volta a ridosso dell\'inizio', () => {
  const g = giornata(giocata());
  const passa = (hhmm) => {
    const voci = vociRicontrollo(g, ore(hhmm));
    applicaRicontrollo(g, new Map(), voci, ore(hhmm));
    return voci.length;
  };
  assert.equal(passa('19:40'), 1);
  assert.equal(g.coppieQuota2.lista[0].gambe[0].ricontrollo.esito, 'senza-quote');
  assert.equal(passa('20:00'), 0);
  assert.equal(passa('20:20'), 1);
  assert.equal(g.coppieQuota2.lista[0].gambe[0].ricontrollo.tentativi, 2);
  assert.equal(passa('20:50'), 0);
});

test('quote: mediana dei bookmaker senza margine accanto a Pinnacle', () => {
  const libro = (chiave, over, under) => ({ chiave, mercati: { totals: { 1.5: { over, under } } } });
  const q = quotaCalcio({ bookmaker: [libro('a', 1.3, 3.5), libro('b', 1.3, 3.5), libro('c', 1.3, 3.5)] }, 'Under/Over 1.5', 'Over 1.5');
  assert.equal(q.prob, null);
  assert.ok(Math.abs(q.probMediana - (1 / 1.3) / (1 / 1.3 + 1 / 3.5)) < 1e-9);
});

test('Telegram: un messaggio per passaggio, una volta; senza quote già al primo tentativo, con le quote giocabili', () => {
  const alle = '2026-11-05T19:40:00+01:00';
  const g = giornata(
    giocata({ ricontrollo: { esito: 'confermata', motivi: [], quota: 1.45, prob: 0.66, alle } }),
    { id: 'L-sturm', gambe: [{ ...giocata().gambe[0], partita: 'Sturm - Celje', idPartita: 'sturm', ricontrollo: { esito: 'fuori', motivi: ['quota 1,77 sopra 1,70'], quota: 1.77, prob: 0.55, alle } }] },
    { id: 'L-twente', gambe: [{ ...giocata().gambe[0], partita: 'Twente - Pafos', idPartita: 'twente', ricontrollo: { esito: 'senza-quote', tentativi: 1, alle, giocaTra: { min: 1.41, max: 1.64 } } }] },
  );
  const [m, altro] = messaggiRicontrollo({ giornate: [g], inviate: new Set() });
  assert.equal(altro, undefined);
  assert.match(m.testo, /✅ 21:00 Monaco - Nordsjaelland: <b>1<\/b> @1,45 · mercato 66%/);
  assert.match(m.testo, /❌ 21:00 Sturm - Celje: <b>1<\/b> @1,77: non giocarla più, quota 1,77 sopra 1,70/);
  assert.match(m.testo, /⚠️ 21:00 Twente - Pafos: <b>1<\/b>: quote non trovate, giocala solo se su bet365 la quota è tra 1,41 e 1,64, altrimenti non giocarla/);
  assert.deepEqual(messaggiRicontrollo({ giornate: [g], inviate: new Set([m.chiave]) }), []);
  assert.equal(soloEssenziale([m], { giornata: g, oggi: '2026-11-05' }).manda.length, 1);
  g.coppieQuota2.lista[2].gambe[0].ricontrollo = { esito: 'senza-quote', tentativi: 2, alle: '2026-11-05T20:20:00+01:00' };
  const secondo = messaggiRicontrollo({ giornate: [g], inviate: new Set([m.chiave]) });
  assert.equal(secondo.length, 1);
  // A partita iniziata non si manda niente.
  assert.deepEqual(messaggiRicontrollo({ giornate: [g], inviate: new Set(), adesso: ore('21:05') }), []);
  // Secondo tentativo fallito: un altro avviso; senza le quote giocabili resta "controllala tu".
  assert.match(secondo[0].testo, /⚠️ 21:00 Twente - Pafos: <b>1<\/b>: quote non trovate, controllala tu su bet365/);
});

test('sito: il ricontrollo dice se giocarla ancora', () => {
  assert.equal(testoRicontrollo(undefined), null);
  const alle = '2026-11-05T19:40:00+01:00';
  assert.match(testoRicontrollo({ esito: 'fuori', motivi: ['quota 1,77 sopra 1,70'], alle }).testo, /^Non giocarla più \(19:40\): quota 1,77 sopra 1,70/);
  assert.match(testoRicontrollo({ esito: 'confermata', quota: 1.45, prob: 0.66, alle }).testo, /^Ricontrollata alle 19:40: ok, quota 1,45, mercato 66%/);
  assert.match(testoRicontrollo({ esito: 'senza-quote', alle }).testo, /controllala tu su bet365/);
  assert.match(testoRicontrollo({ esito: 'senza-quote', alle, giocaTra: { min: 1.41, max: 1.64 } }).testo, /giocala solo se su bet365 la quota è tra 1,41 e 1,64/);
});

test('confronto settimanale: confermate e fuori dal ricontrollo', () => {
  const riga = (esito, ric) => ({ esito, quota: 1.5, probMercato: 0.6, ricontrollo: { esito: ric } });
  const r = confrontoSettimanale([{ data: '2026-11-06', righe: [], ricontrollate: [riga('vinta', 'confermata'), riga('persa', 'confermata'), riga('persa', 'fuori'), riga(null, 'senza-quote')] }]).gruppi;
  assert.equal(r['lista: ricontrollo confermata'].totale.chiuse, 2);
  assert.equal(r['lista: ricontrollo fuori'].totale.prese, 0);
  assert.equal(r['lista: ricontrollo senza-quote'], undefined);
});

test('controlli: il passaggio ricontrolla la lista con odss e scrive l\'esito nella giornata', async () => {
  const DATA = '2026-11-05';
  const d = mattinoOdss(mkdtempSync(join(tmpdir(), 'ricontrollo-')), DATA, {
    calcio: [{ id: 'c1', casa: 'Monaco', trasferta: 'Nordsjaelland', inizio: '2026-11-05T20:00:00Z', campionato: 'Conference League', mercati: {} }],
  });
  mkdirSync(join(d, 'giornate'), { recursive: true });
  const file = join(d, 'giornate', `${DATA}.json`);
  const lista = [giocata({ idPartita: 'calcio-monaco', partita: 'Monaco - Nordsjaelland' })];
  writeFileSync(file, JSON.stringify({ data: DATA, giocate: [], coppieQuota2: { lista } }));
  const libri = ['pinnacle', 'snai', 'bwin', 'unibet'];
  const righe = [rigaOdss({ event_id: 'c1', event: 'Monaco - Nordsjaelland', league: 'Conference League', home_team: 'Monaco', away_team: 'Nordsjaelland', commence_time: '2026-11-05T20:00:00Z', market: '1x2', bookmakers: libri.map((k) => bkOdss(k, { HOME: 1.5, DRAW: 4.9, AWAY: 5.75 }, { last_update: '2026-11-05T18:00:00Z' })) })];
  const f = fetchOdss({ 'calcio|1x2,dc,ou': [righe] });
  const fonti = { fetchOdss: f, attesaOdssMs: 0 };
  await eseguiControlli({ dirData: d, adesso: ore('19:40'), fonti, chiavi: { odss: 'CHIAVE' } });
  assert.equal(f.chiamate.length, 1);
  const r = JSON.parse(readFileSync(file, 'utf8')).coppieQuota2.lista[0].gambe[0].ricontrollo;
  assert.equal(r.esito, 'fuori');
  assert.equal(r.quota, 1.5);
  assert.match(r.motivi[0], /non più d'accordo \(mercato 64%\)/);
  // Una volta sola: il passaggio dopo non fa altre richieste.
  await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti, chiavi: { odss: 'CHIAVE' } });
  assert.equal(f.chiamate.length, 1);
});

test('storico del ricontrollo: confermate prese, tolte giuste e tolte sbagliate', async () => {
  const { storicoRicontrollo } = await import('../../src/controlli/ricontrollo-lista.js');
  const con = (id, esito, ric, quota = 1.5) => ({ id, gambe: [{ ...giocata().gambe[0], idPartita: id, partita: id, quota, esito, ...(ric ? { ricontrollo: { esito: ric, motivi: ric === 'fuori' ? ['quota 1,77 sopra 1,70'] : [], quota: 1.77 } } : {}) }] });
  const s = storicoRicontrollo([
    { data: '2026-11-04', coppieQuota2: { lista: [con('vecchia', 'vinta', null)] } },
    giornata(con('a', 'vinta', 'confermata', 1.4), con('b', 'persa', 'confermata'), con('c', 'persa', 'fuori'), con('d', 'vinta', 'fuori', 1.6), con('e', 'persa', 'senza-quote'), con('f', null, null)),
  ]);
  assert.deepEqual(s.gruppi.confermata, { partite: 2, vinte: 1, perse: 1, rimborsate: 0, aperte: 0, guadagno: -0.6 });
  assert.equal(s.gruppi.fuori.perse, 1);
  assert.equal(s.gruppi.fuori.vinte, 1);
  assert.equal(s.gruppi.fuori.guadagno, -0.4);
  assert.equal(s.gruppi['senza-quote'].perse, 1);
  // Prima del 05/11 il ricontrollo non c'era: la giocata del 04/11 non conta.
  assert.deepEqual(s.gruppi.nessuno, { partite: 1, vinte: 0, perse: 0, rimborsate: 0, aperte: 1, guadagno: 0 });
  assert.deepEqual(s.fuori.map((x) => [x.partita, x.esito]), [['c', 'persa'], ['d', 'vinta']]);
});

test('senza quote: tra che quote giocarla lo stesso, col margine del mattino', async () => {
  const { quoteGiocabili } = await import('../../src/controlli/ricontrollo-lista.js');
  // Sturm - Celje del 05/11: 1 a 1,51, mercato 63,3%, modello 63,0%.
  assert.deepEqual(quoteGiocabili({ quota: 1.51, probMercato: 0.633, probModello: 0.630 }), { min: 1.41, max: 1.64 });
  // Dentro i limiti della lista: un 1 molto probabile non scende sotto 1,25.
  assert.equal(quoteGiocabili({ quota: 1.28, probMercato: 0.75, probModello: 0.76 }).min, 1.25);
  assert.deepEqual(quoteGiocabili({ quota: 1.5 }), { min: 1.25, max: 1.7 });
  const g = giornata(giocata());
  applicaRicontrollo(g, new Map(), vociRicontrollo(g, ore('19:40')), ore('19:40'));
  assert.ok(g.coppieQuota2.lista[0].gambe[0].ricontrollo.giocaTra.min >= 1.25);
});

test('orari indicativi dei ricontrolli: uno per orario d\'inizio, da 90 a 45 minuti prima', async () => {
  const { testoOrari } = await import('../../src/notifiche/telegram.js');
  const { orariRicontrollo } = await import('../../site/app.js');
  const altra = { id: 'L-cruzeiro', gambe: [{ ...giocata().gambe[0], idPartita: 'cruzeiro', inizio: '2026-11-06T01:30:00+01:00' }] };
  const g = giornata(giocata(), { ...giocata(), id: 'L-sturm' }, altra);
  const t = testoOrari(g).join('\n');
  assert.match(t, /· tra le 19:30 e le 20:15: le 2 partite delle 21:00\n· tra le 00:00 e le 00:45: la partita delle 01:30/);
  assert.deepEqual(testoOrari({}), []);
  assert.deepEqual(orariRicontrollo(g.coppieQuota2.lista), ['tra le 19:30 e le 20:15: le 2 partite delle 21:00', 'tra le 00:00 e le 00:45: la partita delle 01:30']);
});
