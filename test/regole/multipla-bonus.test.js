import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { costruisciMultipleBonus, esitoMultiplaBonus, gambePossibili, incremento, mercatoAmmesso } from '../../src/regole/multipla-bonus.js';
import { aggiornaMultipleBonus } from '../../src/registro/registro.js';
import { messaggi, messaggiMultipleBonus } from '../../src/notifiche/telegram.js';

const voce = (i, mercato, selezione, quota, probPinnacle, extra = {}) => ({
  partita: { idPartita: `p${i}`, sport: 'calcio', competizione: 'Serie A', partita: `Casa${i} - Ospite${i}`, inizio: `2026-10-25T${String(10 + (i % 10)).padStart(2, '0')}:00:00+02:00`, ...extra },
  m: { mercato, selezione, quota, probPinnacle },
});

test('incremento dalla tabella ufficiale di bet365', () => {
  assert.equal(incremento(1), 0);
  assert.equal(incremento(2), 0.025);
  assert.equal(incremento(7), 0.18);
  assert.equal(incremento(10), 0.35);
  assert.equal(incremento(18), 0.8);
  assert.equal(incremento(25), 1);
});

test('mercati ammessi: niente linee intere, cartellini, angoli, risultato esatto', () => {
  assert.equal(mercatoAmmesso('1X2', '1'), true);
  assert.equal(mercatoAmmesso('Under/Over 2.5', 'Under 2.5'), true);
  assert.equal(mercatoAmmesso('Handicap set +1.5', 'trasferta'), true);
  assert.equal(mercatoAmmesso('Handicap asiatico -1', 'casa'), false);
  assert.equal(mercatoAmmesso('Handicap asiatico -0.5', 'casa'), true);
  assert.equal(mercatoAmmesso('Cartellini Under/Over 4.5', 'Under 4.5'), false);
  assert.equal(mercatoAmmesso('Angoli Under/Over 9.5', 'Over 9.5'), false);
  assert.equal(mercatoAmmesso('Vincente incontro', 'Sinner J.'), true);
});

test('gambe: quota 1,25-1,50, una per partita, la più vicina alla quota equa, partite escluse fuori', () => {
  const voci = [
    voce(1, '1X2', '1', 1.30, 0.75), // resa 0,975
    voce(1, 'Doppia chance', '1X', 1.26, 0.78), // resa 0,983: migliore per la partita 1
    voce(2, '1X2', '1', 1.20, 0.82), // quota troppo bassa
    voce(3, '1X2', '2', 1.45, 0.66), // resa 0,957
    voce(4, '1X2', '1', 1.40, null), // senza probabilità di mercato
    voce(5, 'Cartellini Under/Over 4.5', 'Under 4.5', 1.35, 0.72),
    voce(6, '1X2', '1', 1.35, 0.73), // esclusa
  ];
  const g = gambePossibili(voci, { escluse: new Set(['p6']) });
  assert.deepEqual(g.map((x) => [x.idPartita, x.selezione]), [['p1', '1X'], ['p3', '2']]);
});

test('multiple da 10 e da 20 solo con abbastanza partite; quota, incremento e probabilità', () => {
  const voci = Array.from({ length: 12 }, (_, i) => voce(i, '1X2', '1', 1.3, 0.75));
  const mb = costruisciMultipleBonus(voci, { data: '2026-10-25' });
  assert.equal(mb.length, 1);
  assert.equal(mb[0].id, 'MB10-2026-10-25');
  assert.equal(mb[0].gambe.length, 10);
  assert.equal(mb[0].quota, Math.round(1.3 ** 10 * 100) / 100);
  assert.equal(mb[0].incremento, 0.35);
  assert.equal(mb[0].quotaConBonus, Math.round(1.3 ** 10 * 1.35 * 100) / 100);
  assert.ok(Math.abs(mb[0].prob - 0.75 ** 10) < 1e-12);
  assert.equal(mb[0].gambe[0].resa, undefined);
  assert.equal(mb[0].esito, null);
});

test('esito: persa con una gamba persa, aperta con una gamba senza esito, rimborsate fuori dal conto', () => {
  const g = (esito, quota = 1.3) => ({ esito, quota });
  assert.deepEqual(esitoMultiplaBonus({ gambe: [g('vinta'), g('persa'), g(null)] }), { esito: 'persa', ritorno: 0 });
  assert.deepEqual(esitoMultiplaBonus({ gambe: [g('vinta'), g(null)] }), { esito: null, ritorno: null });
  const r = esitoMultiplaBonus({ gambe: [g('vinta', 1.3), g('vinta', 1.4), g('rimborsata', 1.5)] });
  assert.equal(r.esito, 'vinta');
  assert.equal(r.ritorno, Math.round(1.3 * 1.4 * 1.025 * 100) / 100);
  assert.deepEqual(esitoMultiplaBonus({ gambe: [g('rimborsata'), g('rimborsata')] }), { esito: 'rimborsata', ritorno: 1 });
});

test('registro: gli esiti definitivi delle gambe chiudono la multipla nel file della giornata', () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-mb-'));
  mkdirSync(join(d, 'giornate'));
  const mb = { id: 'MB10-x', nome: 'Multipla bonus bet365 da 10', gambe: [
    { idPartita: 'a', mercato: '1X2', selezione: '1', quota: 1.3, esito: null },
    { idPartita: 'b', mercato: '1X2', selezione: '2', quota: 1.4, esito: null },
  ], esito: null, ritorno: null };
  writeFileSync(join(d, 'giornate', '2026-10-25.json'), JSON.stringify({ data: '2026-10-25', giocate: [], multipleBonus: [mb] }));
  const reg = { righe: [
    { idPartita: 'a', mercato: '1X2', selezione: '1', esito: 'vinta', esitoProvvisorio: false },
    { idPartita: 'b', mercato: '1X2', selezione: '2', esito: 'vinta', esitoProvvisorio: true },
  ] };
  assert.equal(aggiornaMultipleBonus(d, '2026-10-25', reg), true);
  let g = JSON.parse(readFileSync(join(d, 'giornate', '2026-10-25.json'), 'utf8'));
  assert.deepEqual(g.multipleBonus[0].gambe.map((x) => x.esito), ['vinta', null]);
  assert.equal(g.multipleBonus[0].esito, null);
  reg.righe[1].esitoProvvisorio = false;
  aggiornaMultipleBonus(d, '2026-10-25', reg);
  g = JSON.parse(readFileSync(join(d, 'giornate', '2026-10-25.json'), 'utf8'));
  assert.equal(g.multipleBonus[0].esito, 'vinta');
  assert.equal(g.multipleBonus[0].ritorno, Math.round(1.3 * 1.4 * 1.025 * 100) / 100);
  assert.equal(aggiornaMultipleBonus(d, '2026-10-25', reg), false);
});

test('Telegram: le multiple bonus nel messaggio del giorno e l\'esito una volta sola', () => {
  const mb = { id: 'MB10-2026-10-25', nome: 'Multipla bonus bet365 da 10', quota: 13.79, incremento: 0.35, quotaConBonus: 18.62,
    gambe: [{ sport: 'calcio', partita: 'A - B', mercato: '1X2', selezione: '1', quota: 1.3, esito: 'persa' }], esito: 'persa', ritorno: 0 };
  const giornata = { data: '2026-10-25', prova: true, giocate: [], multipleBonus: [mb] };
  const m = messaggi({ giornata, oggi: '2026-10-25', adesso: new Date('2026-10-25T08:00:00Z'), inviate: new Set() });
  assert.match(m[0].testo, /Multipla bonus bet365 da 10<\/b> \(prova, non giocare\)/);
  assert.match(m[0].testo, /quota 13,79 · incremento 35% → <b>18,62<\/b>/);
  const e = messaggiMultipleBonus({ giornate: [giornata], inviate: new Set() });
  assert.equal(e.length, 1);
  assert.match(e[0].testo, /PERSA.*1 partita persa su 1/);
  assert.equal(messaggiMultipleBonus({ giornate: [giornata], inviate: new Set([e[0].chiave]) }).length, 0);
});

test('pronostici: soglia del mercato, probabilità vera della fascia, quota minima, solo i mercati scelti', async () => {
  const { pronosticiPartita, probCalibrata, quotaMinima, testoPronostico } = await import('../../src/regole/pronostici.js');
  const fasce = [{ da: 0.7, n: 500, vera: 0.74 }, { da: 0.75, n: 4000, vera: 0.82 }, { da: 0.8, n: 30, vera: 0.6 }];
  assert.equal(probCalibrata(fasce, 0.72), 0.74);
  assert.equal(probCalibrata(fasce, 0.83), 0.82); // fascia con pochi casi: si usa quella sotto
  assert.equal(probCalibrata(fasce, 0.6), null);
  assert.equal(quotaMinima(0.78), 1.29);
  const cal = { calcio: { principali: {
    'Doppia chance|1X': fasce, 'Under/Over 1.5|Over 1.5': fasce, '1X2|1': fasce, 'Under/Over casa 0.5|Over 0.5': fasce, 'Gol/No gol|Gol': fasce,
  } } };
  const partita = { sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Lecce', casa: 'Inter', trasferta: 'Lecce', mercati: [
    { mercato: 'Doppia chance', selezione: '1X', probModello: 0.9, quota: null },
    { mercato: 'Under/Over 1.5', selezione: 'Over 1.5', probModello: 0.76, quota: 1.35 },
    { mercato: '1X2', selezione: '1', probModello: 0.71, quota: 1.3 }, // nel passato uscito solo il 74%: sotto l'80%
    { mercato: 'Under/Over casa 0.5', selezione: 'Over 0.5', probModello: 0.74, quota: null }, // sotto la soglia 0,75
    { mercato: 'Gol/No gol', selezione: 'Gol', probModello: 0.8, quota: null }, // mercato escluso
    { mercato: 'Under/Over 3.5', selezione: 'Under 3.5', probModello: 0.95, quota: null }, // senza calibrazione
  ] };
  const p = pronosticiPartita(partita, cal);
  assert.deepEqual(p.map((x) => [x.testo, x.prob, x.quotaMinima, x.giocabile]), [
    ['Inter non perde (1X)', 0.82, 1.22, false],
    // Quota sopra la minima ma senza la probabilità di Pinnacle: niente ✅ (A2).
    ['Almeno 2 gol (Over 1.5)', 0.82, 1.22, false],
  ]);
  assert.equal(testoPronostico({ partita: 'Sinner J. - Alcaraz C.' }, 'Vincente incontro', 'Sinner J.'), 'Vince Sinner J.');
});

test('Telegram: bilancio dei pronostici quando sono tutti chiusi', async () => {
  const { messaggiPronostici } = await import('../../src/notifiche/telegram.js');
  const g = { data: '2026-10-25', pronostici: [{ partita: 'A - B', pronostici: [
    { testo: 'Vince A', esito: 'vinta' }, { testo: 'Almeno 2 gol (Over 1.5)', esito: 'persa' },
  ] }] };
  const m = messaggiPronostici({ giornate: [g], inviate: new Set(), oggi: '2026-10-26' });
  assert.equal(m.length, 1);
  assert.match(m[0].testo, /1 giusti su 2 \(50%\)/);
  assert.match(m[0].testo, /❌ A - B: Almeno 2 gol/);
  g.pronostici[0].pronostici[1].esito = null;
  assert.equal(messaggiPronostici({ giornate: [g], inviate: new Set(), oggi: '2026-10-26' }).length, 0);
  assert.equal(messaggiPronostici({ giornate: [g], inviate: new Set(), oggi: '2026-10-29' }).length, 1);
});

test('Telegram: pronostici arrivati dopo il messaggio del mattino, una volta sola', () => {
  const g = { data: '2026-10-25', prova: true, giocate: [], pronostici: [] };
  const inviate = new Set(['2026-10-25|giornata']);
  const m = messaggi({ giornata: g, oggi: '2026-10-25', adesso: new Date('2026-10-25T12:00:00Z'), inviate });
  assert.equal(m.length, 1);
  assert.equal(m[0].chiave, '2026-10-25|pronostici');
  assert.match(m[0].testo, /nessuna partita ha un pronostico abbastanza sicuro/);
  inviate.add(m[0].chiave);
  assert.equal(messaggi({ giornata: g, oggi: '2026-10-25', adesso: new Date('2026-10-25T12:00:00Z'), inviate }).length, 0);
  const senza = { data: '2026-10-25', giocate: [] };
  assert.equal(messaggi({ giornata: senza, oggi: '2026-10-25', adesso: new Date('2026-10-25T12:00:00Z'), inviate: new Set(['2026-10-25|giornata']) }).length, 0);
});

test('Telegram: partite con pronostici aggiunte dopo, solo le nuove', () => {
  const pr = (id) => ({ idPartita: id, sport: 'calcio', partita: `${id} - Y`, inizio: '2026-10-25T19:00:00Z', pronostici: [{ testo: 'Almeno 2 gol (Over 1.5)', prob: 0.8, quotaMinima: 1.25, quota: null }] });
  const g = { data: '2026-10-25', prova: true, giocate: [], pronostici: [pr('A'), pr('B')] };
  const inviate = new Set(['2026-10-25|giornata', '2026-10-25|pronostici', '2026-10-25|pronostico|A']);
  const m = messaggi({ giornata: g, oggi: '2026-10-25', adesso: new Date('2026-10-25T12:00:00Z'), inviate });
  assert.equal(m.length, 1);
  assert.match(m[0].testo, /Nuovi pronostici del 25\/10/);
  assert.match(m[0].testo, /B - Y/);
  assert.doesNotMatch(m[0].testo, /A - Y/);
  assert.deepEqual(m[0].segna, ['2026-10-25|pronostico|B']);
});
