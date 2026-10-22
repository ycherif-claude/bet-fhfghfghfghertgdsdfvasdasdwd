// Revisione dell'idea 1 [coordinatore, 22/10/2026]: esiti sospesi (array per esito nel feed reale), ✅ solo
// con una quota dei bookmaker dell'utente (la media di The Odds API resta solo come informazione), quote
// dell'utente vecchie di oltre 6 ore ignorate, exchange anche da `is_exchange`, nessun abbinamento con squadre
// femminili, giovanili o riserve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { riassuntoMercato, abbinaEventiOdss } from '../../src/calcio/odss.js';
import { pronosticiPartita } from '../../src/regole/pronostici.js';
import { costruisciSchedinePronostici } from '../../src/regole/schedine-pronostici.js';
import { testoPronostici, testoSchedinePronostici } from '../../src/notifiche/telegram.js';
import { CONFIG } from '../../src/config.js';

const ADESSO = new Date('2026-10-23T05:36:00Z');
const AGG = '2026-10-23T05:30:00+00:00';
const bk = (key, outcomes, extra = {}) => ({ key, outcomes, last_update: AGG, suspended: [], ...extra });
const riga = (bookmakers, o = {}) => ({ event_id: 'e1', home_team: 'Torino', away_team: 'Monza', commence_time: '2026-10-23T18:45:00.000Z',
  market: '1x2', line: null, scope: 'match', period: 'full_time', bookmakers, ...o });
const x12 = (h, d, a) => ({ HOME: h, DRAW: d, AWAY: a });
const novig = (o) => { const s = 1 / o.HOME + 1 / o.DRAW + 1 / o.AWAY; return 1 / o.HOME / s; };

test('sospesi: esiti dell\'array tolti dalle quote dell\'utente; riga intera fuori dal consenso; true = tutto il bookmaker', () => {
  const r = riassuntoMercato(riga([
    bk('snai', x12(2.1, 3.3, 3.5), { suspended: ['AWAY'] }),
    bk('sportium', x12(2.2, 3.3, 3.5), { suspended: true }),
    bk('goldbet', x12(2.05, 3.4, 3.6)),
    bk('a', x12(2.0, 3.5, 4.0)), bk('b', x12(2.1, 3.4, 3.8)), bk('c', x12(1.95, 3.6, 4.2)),
    bk('pinnacle', x12(1.5, 4, 7), { suspended: ['DRAW'] }),
  ]), { adesso: ADESSO });
  assert.deepEqual(r.miei.snai.quote, { HOME: 2.1, DRAW: 3.3 });
  assert.ok(!('sportium' in r.miei));
  // Pinnacle con un esito sospeso non vale: mediana di goldbet, a, b, c (snai ha un esito sospeso).
  assert.equal(r.fonteProb, 'mediana di 4 bookmaker');
  const v = [x12(2.05, 3.4, 3.6), x12(2.0, 3.5, 4.0), x12(2.1, 3.4, 3.8), x12(1.95, 3.6, 4.2)].map(novig).sort((a, b) => a - b);
  assert.ok(Math.abs(r.prob.HOME - (v[1] + v[2]) / 2) < 1e-4);
});

test('exchange: fuori dal consenso anche con is_exchange', () => {
  const r = riassuntoMercato(riga([
    bk('a', x12(2.0, 3.5, 4.0)), bk('b', x12(2.1, 3.4, 3.8)), bk('scambi', x12(5, 5, 5), { is_exchange: true }),
  ]), { adesso: ADESSO });
  assert.equal(r.prob, null);
});

test(`quote dell'utente aggiornate da più di ${CONFIG.odss.oreMaxQuota} ore (o senza orario) ignorate`, () => {
  assert.equal(CONFIG.odss.oreMaxQuota, 6);
  const r = riassuntoMercato(riga([
    bk('snai', x12(2.1, 3.3, 3.5), { last_update: '2026-10-22T23:35:00+00:00' }), // 6 h 01 prima
    bk('goldbet', x12(2.1, 3.3, 3.5), { last_update: '2026-10-22T23:37:00+00:00' }), // 5 h 59 prima
    bk('sportium', x12(2.1, 3.3, 3.5), { last_update: null }),
  ]), { adesso: ADESSO });
  assert.deepEqual(Object.keys(r.miei), ['goldbet']);
});

test('abbinamento: mai una squadra femminile, giovanile o riserve se la partita non lo è', () => {
  const ev = (id, casa, trasferta) => ({ id, casa, trasferta, inizio: '2026-10-23T18:45:00.000Z', mercati: {} });
  const pt = (id, casa, trasferta) => ({ idPartita: id, sport: 'calcio', casa, trasferta, partita: `${casa} - ${trasferta}`, inizio: '2026-10-23T20:45:00+02:00' });
  for (const [casa, odss] of [['Inter', 'Inter Women'], ['Juventus', 'Juventus Next Gen'], ['Roma', 'Roma U19'], ['Real Madrid', 'Real Madrid B'],
    ['Milan', 'Milan Femminile'], ['Barcelona', 'Barcelona II'], ['Ajax', 'Ajax U21'], ['Lazio', 'Lazio Reserves'], ['Genoa', 'Genoa U23'], ['Napoli', 'Napoli U20']]) {
    assert.equal(abbinaEventiOdss([pt('p', casa, 'Lecce')], [ev('e', odss, 'Lecce')]).size, 0, `${casa} ↔ ${odss}`);
  }
  // La partita femminile con l'evento femminile sì.
  assert.equal(abbinaEventiOdss([pt('p', 'Inter Women', 'Roma Women')], [ev('e', 'Inter Women', 'Roma Women')]).size, 1);
  // Nomi simili senza marcatori: ancora sì.
  assert.equal(abbinaEventiOdss([pt('p', 'Torino', 'Monza')], [ev('e', 'Torino FC', 'AC Monza')]).size, 1);
});

// ---- ✅ solo con una quota dei bookmaker dell'utente ----

const fasce = [{ da: 0.75, n: 4000, vera: 0.86 }];
const CAL = { calcio: { principali: { 'Doppia chance|1X': fasce } } };
const partita = { idPartita: 'p', sport: 'calcio', competizione: 'Serie A', partita: 'Torino - Monza', casa: 'Torino', trasferta: 'Monza',
  inizio: '2026-10-23T20:45:00+02:00', mercati: [{ mercato: 'Doppia chance', selezione: '1X', probModello: 0.8, probPinnacle: 0.85, quota: 1.3 }] };

test('senza quote odss: la media di The Odds API resta come informazione (fonteQuota "media"), mai ✅', () => {
  const [x] = pronosticiPartita(partita, CAL);
  assert.deepEqual([x.quota, x.fonteQuota, x.giocabile], [1.3, 'media', false]);
  // Evento abbinato ma nessun bookmaker dell'utente per quella selezione: ancora la media, senza ✅.
  const evento = { id: 'e', casa: 'Torino', trasferta: 'Monza', inizio: '2026-10-23T18:45:00Z', mercati: { dc: { miei: {}, prob: { '1X': 0.84, X2: 0.4, 12: 0.76 }, fonteProb: 'Pinnacle' } } };
  const [y] = pronosticiPartita(partita, CAL, evento);
  assert.deepEqual([y.quota, y.fonteQuota, y.giocabile, y.probMercato], [1.3, 'media', false, 0.84]);
  // Con la quota di un bookmaker dell'utente: fonteQuota "miei" e ✅ con la regola di sempre.
  evento.mercati.dc.miei = { snai: { quote: { '1X': 1.26 }, aggiornato: AGG } };
  const [z] = pronosticiPartita(partita, CAL, evento);
  assert.deepEqual([z.quota, z.fonteQuota, z.bookmakerMigliore, z.giocabile], [1.26, 'miei', 'snai', true]);
});

test('testi: "quota media, non dei tuoi bookmaker" e solo da tenere d\'occhio; nelle schedine la gamba media è da verificare', () => {
  const [x] = pronosticiPartita(partita, CAL);
  const g = { data: '2026-10-23', pronostici: [{ idPartita: 'p', sport: 'calcio', partita: 'Torino - Monza', inizio: '2026-10-23T18:45:00Z', pronostici: [x] }] };
  const t = testoPronostici(g, '2026-10-23');
  assert.match(t, /quota media 1,30, non dei tuoi bookmaker \(minima 1,17\) · solo da tenere d'occhio/);
  assert.doesNotMatch(t.slice(t.lastIndexOf('SÌ')), /✅/);
  const gamba = (id, casa, extra) => ({ idPartita: id, sport: 'calcio', partita: `${casa} - X${id}`, inizio: '2026-10-25T18:00:00+02:00',
    pronostici: [{ mercato: '1X2', selezione: '1', testo: `Vince ${casa}`, prob: 0.87, limite: 0.85, quotaMinima: 1.2, quota: null, migliore: true, ...extra }] });
  const [s] = costruisciSchedinePronostici([gamba('a', 'A', { quota: 1.3, fonteQuota: 'media' }), gamba('c', 'C', {})], { data: '2026-10-25', prova: true });
  const [ga] = s.gambe;
  assert.deepEqual([ga.quota, ga.quotaDaVerificare, ga.fonteQuota], [1.3, true, 'media']);
  assert.equal(s.quotaDaVerificare, true);
  assert.match(testoSchedinePronostici([s], '2026-10-25'), /Vince A @1,30 \(quota media, non dei tuoi bookmaker: da verificare\)/);
});
