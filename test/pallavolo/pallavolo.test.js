import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calcolaEloPallavolo, mercatiPallavolo, pesoModelloPallavolo, probPartita, setDaVittoria, vittoriaDaSet } from '../../src/pallavolo/modello.js';
import { abbinaSquadra, squadreStorico } from '../../src/pallavolo/squadre.js';
import { leggiQuote } from '../../src/pallavolo/fonti/oddspapi.js';
import { budgetRichieste, eseguiRaccoltaPallavolo, righePallavolo } from '../../src/pallavolo/raccolta.js';
import { aggiornaEsitiPallavolo, esitoPallavolo } from '../../src/pallavolo/esiti.js';
import { correggibile } from '../../src/giro/notizie.js';

const temp = () => mkdtempSync(join(tmpdir(), 'bet-pallavolo-'));
const adesso = new Date('2026-10-21T05:40:00Z'); // 07:40 a Roma
const vicino = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('set e partita: P(vittoria) al meglio dei 5 e bisezione inversa', () => {
  vicino(vittoriaDaSet(0.5), 0.5);
  vicino(vittoriaDaSet(0.6), 0.6 ** 3 * (1 + 3 * 0.4 + 6 * 0.16));
  for (const p of [0.2, 0.5, 0.73, 0.95]) vicino(vittoriaDaSet(setDaVittoria(p)), p, 1e-9);
});

test('mercati: complementari, handicap e totale coerenti con le probabilità dei risultati', () => {
  const m = mercatiPallavolo(0.7, { casa: 'Itas Trentino', trasferta: 'Rana Verona' });
  const p = (mercato, selezione) => m.find((x) => x.mercato === mercato && x.selezione === selezione).probModello;
  const s = setDaVittoria(0.7);
  const t = 1 - s;
  vicino(p('Vincente', 'Itas Trentino'), 0.7);
  vicino(p('Handicap set -1.5', 'casa'), s ** 3 + 3 * s ** 3 * t);
  vicino(p('Handicap set +1.5', 'trasferta'), t ** 3 + 3 * t ** 3 * s);
  vicino(p('Totale set 3.5', 'Under 3.5'), s ** 3 + t ** 3);
  for (const mercato of ['Vincente', 'Handicap set -1.5', 'Handicap set +1.5', 'Totale set 3.5']) {
    vicino(m.filter((x) => x.mercato === mercato).reduce((a, x) => a + x.probModello, 0), 1);
  }
  assert.ok(p('Handicap set +1.5', 'casa') > 0.7 && p('Handicap set -1.5', 'casa') < 0.7);
});

const partita = (id, data, idCasa, idTrasferta, sc, st, stagione = 2026, extra = {}) => ({
  id, stagione, giornata: 1, idCasa, idTrasferta, casa: `Squadra ${idCasa}`, trasferta: `Squadra ${idTrasferta}`,
  inizio: `${data}T18:00:00.000Z`, puntiCasa: sc, puntiTrasferta: st, finita: true, postseason: false, ...extra,
});

test('Elo: il 3-0 pesa più del 3-2, regressione a inizio stagione, partite contate', () => {
  const tre0 = calcolaEloPallavolo(righePallavolo([partita('1', '2026-10-10', 'A', 'B', 3, 0)]));
  const tre2 = calcolaEloPallavolo(righePallavolo([partita('1', '2026-10-10', 'A', 'B', 3, 2)]));
  assert.ok(tre0.elo.get('A') > tre2.elo.get('A'));
  vicino(tre0.elo.get('A') + tre0.elo.get('B'), 3000);
  const due = calcolaEloPallavolo(righePallavolo([
    partita('1', '2026-03-10', 'A', 'B', 3, 0, 2025), partita('2', '2026-10-10', 'B', 'C', 3, 1, 2026),
  ]));
  // A ha vinto solo nella stagione scorsa: la nuova stagione lo riporta di un terzo verso 1500.
  vicino(due.elo.get('A') - 1500, (tre0.elo.get('A') - 1500) * (2 / 3), 1e-6);
  assert.equal(due.giocate.get('B'), 2);
  // Risultati non da pallavolo (2-2, 4-1, senza punteggio) restano fuori.
  assert.equal(righePallavolo([partita('x', '2026-10-10', 'A', 'B', 2, 2), partita('y', '2026-10-10', 'A', 'B', 4, 1), partita('z', '2026-10-10', 'A', 'B', null, null)]).length, 0);
  assert.ok(probPartita(1500, 1500) > 0.5);
  assert.equal(pesoModelloPallavolo(new Map([['A', 40], ['B', 29]]), 'A', 'B'), 0.25);
  assert.equal(pesoModelloPallavolo(new Map([['A', 40], ['B', 30]]), 'A', 'B'), 0.5);
});

test('squadre: nomi di OddsPapi → id di TheSportsDB, alias, mai a caso', () => {
  const sq = squadreStorico([
    { idCasa: '136630', casa: 'Trentino Volley', idTrasferta: '136633', trasferta: 'You Energy Volley' },
    { idCasa: '136636', casa: 'Powervolley Milano', idTrasferta: '137436', trasferta: 'Volley Milano' },
    { idCasa: '151995', casa: 'Berlin Recycling Volleys', idTrasferta: '156370', trasferta: 'VC Olympia Berlin' },
    { idCasa: '200', casa: 'Trefl Gdańsk', idTrasferta: '201', trasferta: 'ZAKSA Kędzierzyn-Koźle' },
  ]);
  assert.equal(abbinaSquadra('Itas Trentino', sq), '136630');
  assert.equal(abbinaSquadra('Gas Sales Bluenergy Piacenza', sq), '136633');
  assert.equal(abbinaSquadra('Allianz Milano', sq), '136636');
  assert.equal(abbinaSquadra('Milano', sq), null);
  assert.equal(abbinaSquadra('Berlin RV', sq), '151995');
  assert.equal(abbinaSquadra('Trefl Gdansk', sq), '200');
  assert.equal(abbinaSquadra('ZAKSA Kedzierzyn-Kozle', sq), '201');
  assert.equal(abbinaSquadra('Volley', sq), null);
  assert.equal(abbinaSquadra('Squadra Sconosciuta', sq), null);
});

// Risposta /odds di OddsPapi nel formato del collaudo.
const esito = (price) => ({ players: { 0: { active: true, price } } });
const bkOdds = ({ v = [1.3, 3.5], hm = [1.8, 2.0], hp = [1.1, 6.0], t = [1.75, 2.0] } = {}) => ({
  bookmakerIsActive: true,
  markets: {
    231: { outcomes: { 231: esito(v[0]), 232: esito(v[1]) } },
    ...(hm ? { 2323: { outcomes: { 2323: esito(hm[0]), 2324: esito(hm[1]) } } } : {}),
    ...(hp ? { 2335: { outcomes: { 2335: esito(hp[0]), 2336: esito(hp[1]) } } } : {}),
    ...(t ? { 2313: { outcomes: { 2313: esito(t[0]), 2314: esito(t[1]) } } } : {}),
  },
});

test('quote OddsPapi: mercati per linea, un dominio per bookmaker, exchange esclusi', () => {
  const q = leggiQuote({ bookmakerOdds: {
    pinnacle: bkOdds(), 'bet365.de': bkOdds({ v: [1.25, 3.6] }), bet365: bkOdds({ v: [1.28, 3.4], hm: null, hp: null, t: null }),
    'betfair-ex': bkOdds(), '888sport.it': bkOdds(), vuoto: { markets: {} },
  } });
  assert.deepEqual(q.map((b) => b.chiave).sort(), ['888sport', 'bet365', 'pinnacle']);
  const p = q.find((b) => b.chiave === 'pinnacle').mercati;
  assert.deepEqual(p.vincente, { casa: 1.3, trasferta: 3.5 });
  assert.deepEqual(p.handicap, { '-1.5': { casa: 1.8, trasferta: 2 }, 1.5: { casa: 1.1, trasferta: 6 } });
  assert.deepEqual(p.totale, { 3.5: { over: 1.75, under: 2 } });
  assert.deepEqual(q.find((b) => b.chiave === 'bet365').mercati, { vincente: { casa: 1.28, trasferta: 3.4 } });
});

test('budget delle richieste: (limite − usate − 20%) / giorni rimasti', () => {
  // 21 ottobre: 11 giorni rimasti; (250 − 20 − 50) / 11 = 16.
  assert.equal(budgetRichieste(250, 20, '2026-10-21'), 16);
  assert.equal(budgetRichieste(250, 200, '2026-10-31'), 0);
  assert.equal(budgetRichieste(250, 180, '2026-10-31'), 20);
});

test('correzioni: i mercati della pallavolo sono correggibili', () => {
  for (const m of ['Handicap set -1.5', 'Handicap set +1.5', 'Totale set 3.5', 'Vincente']) assert.ok(correggibile(m), m);
  assert.ok(!correggibile('Handicap set 1'));
});

// Storico finto: 4 squadre SuperLega che si incontrano 4 volte nella stagione 2025 e 2 nella 2026.
function storicoSuperlega() {
  const sq = [['136630', 'Trentino Volley'], ['136629', 'Volley Perugia'], ['136632', 'Volley Lube'], ['137441', 'Verona Volley']];
  const out = { 2025: {}, 2026: {} };
  let k = 0;
  for (const [stagione, giri] of [[2025, 4], [2026, 2]]) {
    for (let g = 1; g <= giri; g++) {
      out[stagione][g] = [];
      for (let i = 0; i < sq.length; i++) for (let j = 0; j < sq.length; j++) {
        if (i === j) continue;
        k++;
        const [sc, st] = i < j ? [3, (k % 3)] : [(k % 3), 3];
        out[stagione][g].push({
          id: String(k), stagione, giornata: g, idCasa: sq[i][0], idTrasferta: sq[j][0], casa: sq[i][1], trasferta: sq[j][1],
          inizio: stagione === 2025 ? `2026-0${g}-1${i}T18:00:00.000Z` : `2026-10-${String(5 + g * 3 + i).padStart(2, '0')}T18:00:00.000Z`,
          puntiCasa: sc, puntiTrasferta: st, finita: true, postseason: false,
        });
      }
    }
  }
  return out;
}

function fontiFinte({ partite = [], quote = {}, conto = { limite: 250, usate: 10 } } = {}) {
  const st = storicoSuperlega();
  const chiamate = [];
  return {
    chiamate,
    thesportsdb: { round: async (s, g, opz, lega) => ({ partite: lega === 4544 ? st[s]?.[g] ?? [] : [], scartate: 0 }) },
    oddspapi: {
      conto: async () => conto,
      partite: async () => { chiamate.push('partite'); return partite; },
      quote: async (id) => { chiamate.push(`quote ${id}`); return leggiQuote({ bookmakerOdds: quote[id] ?? {} }); },
    },
  };
}

const fixture = (id, torneo, casa, trasferta, inizio = '2026-10-21T18:30:00.000Z') => ({ id, torneo, casa, trasferta, inizio, stato: 0 });
const bookmakers = () => ({ pinnacle: bkOdds(), a: bkOdds(), b: bkOdds({ v: [1.32, 3.4] }), bet365: bkOdds({ v: [1.29, 3.5] }) });

test('raccolta: SuperLega con modello e quota bet365; campionati senza storico e squadre ignote senza richieste', async () => {
  const dir = temp();
  const fonti = fontiFinte({
    partite: [
      fixture('f1', 517, 'Itas Trentino', 'Rana Verona'),
      fixture('f2', 517, 'Squadra Ignota', 'Rana Verona'),
      fixture('f3', 586, 'Kaposvar SE', 'Ok Napredak Odzak'),
      fixture('f4', 999, 'Altro', 'Torneo'),
      fixture('f5', 517, 'Sir Susa Perugia', 'Cucine Lube Civitanova', '2026-10-21T05:00:00.000Z'),
    ],
    quote: { f1: bookmakers() },
  });
  const r = await eseguiRaccoltaPallavolo({ data: '2026-10-21', adesso, fonti, chiavi: { oddspapi: 'K' }, dirData: dir, pausaMs: 0 });
  assert.deepEqual(fonti.chiamate, ['partite', 'quote f1']);
  assert.deepEqual(r.crediti.oddspapi, { usate: 2, rimaste: 238 });
  assert.ok(r.competizioniNonCoperte.includes('Champions League maschile: senza storico gratuito della stagione in corso'));
  assert.ok(r.erroriGiro.includes('Squadre SuperLega non riconosciute: Squadra Ignota'), r.erroriGiro.join('\n'));
  assert.equal(r.partite.length, 1);
  const p = r.partite[0];
  assert.equal(p.idPartita, 'pallavolo-2026-10-21-itas-trentino-rana-verona');
  assert.equal(p.sport, 'pallavolo');
  assert.equal(p.competizione, 'SuperLega');
  assert.equal(p.modello, 'elo');
  // 36 partite salvate per squadra: peso pieno.
  assert.equal(p.pesoModello, 0.5);
  assert.deepEqual(p.mercati.map((m) => `${m.mercato} | ${m.selezione}`), [
    'Vincente | Itas Trentino', 'Vincente | Rana Verona', 'Handicap set -1.5 | casa', 'Handicap set -1.5 | trasferta',
    'Handicap set +1.5 | casa', 'Handicap set +1.5 | trasferta', 'Totale set 3.5 | Over 3.5', 'Totale set 3.5 | Under 3.5',
  ]);
  const v = p.mercati[0];
  assert.equal(v.quota, 1.3);
  assert.equal(v.quotaBet365, 1.29);
  assert.equal(v.fonteQuota, 'mediana di 4 bookmaker (OddsPapi)');
  assert.ok(v.probModello > 0.5);
  assert.match(v.spiegazione, /^Vincente: vince se Itas Trentino/);
  // Handicap e totale set: solo mercato finché il modello a set non è tarato.
  assert.ok(p.mercati.filter((m) => m.mercato !== 'Vincente').every((m) => m.probModello === null));
  assert.equal(JSON.parse(readFileSync(join(dir, 'stato', 'oddspapi.json'), 'utf8')).richieste, 12);
});

test('raccolta: richieste finite, conto sconosciuto con contatore locale, chiave mancante', async () => {
  const pieno = fontiFinte({ partite: [fixture('f1', 517, 'Itas Trentino', 'Rana Verona')], conto: { limite: 250, usate: 199 } });
  const r = await eseguiRaccoltaPallavolo({ data: '2026-10-21', adesso, fonti: pieno, chiavi: { oddspapi: 'K' }, dirData: temp(), pausaMs: 0 });
  assert.deepEqual(r.competizioniNonCoperte, ['Pallavolo: richieste OddsPapi finite per oggi']);
  assert.deepEqual(pieno.chiamate, []);
  // Conto non disponibile: vale il contatore locale del mese.
  const dir = temp();
  mkdirSync(join(dir, 'stato'));
  writeFileSync(join(dir, 'stato', 'oddspapi.json'), JSON.stringify({ mese: '2026-10', richieste: 30 }));
  const senzaConto = fontiFinte({ partite: [fixture('f1', 517, 'Itas Trentino', 'Rana Verona')], quote: { f1: bookmakers() }, conto: null });
  const s = await eseguiRaccoltaPallavolo({ data: '2026-10-21', adesso, fonti: senzaConto, chiavi: { oddspapi: 'K' }, dirData: dir, pausaMs: 0 });
  assert.equal(s.crediti.oddspapi.rimaste, 250 - 32);
  assert.equal(JSON.parse(readFileSync(join(dir, 'stato', 'oddspapi.json'), 'utf8')).richieste, 32);
  const senza = await eseguiRaccoltaPallavolo({ data: '2026-10-21', adesso, fonti: fontiFinte(), chiavi: {}, dirData: temp(), pausaMs: 0 });
  assert.match(senza.erroriGiro.at(-1), /manca ODDSPAPI_API_KEY/);
});

test('esiti: vincente, handicap set e totale set dal risultato in set dello storico', () => {
  const r = { casa: 'Itas Trentino', trasferta: 'Rana Verona', setCasa: 3, setTrasferta: 1 };
  assert.equal(esitoPallavolo('Vincente', 'Itas Trentino', r), 'vinta');
  assert.equal(esitoPallavolo('Vincente', 'Rana Verona', r), 'persa');
  assert.equal(esitoPallavolo('Handicap set -1.5', 'casa', r), 'vinta');
  assert.equal(esitoPallavolo('Handicap set +1.5', 'trasferta', r), 'persa');
  assert.equal(esitoPallavolo('Totale set 3.5', 'Over 3.5', r), 'vinta');
  assert.equal(esitoPallavolo('Totale set 3.5', 'Under 3.5', { ...r, setTrasferta: 0 }), 'vinta');
  // La trasferta a +1,5 (mercato "Handicap set -1.5" della casa) vince perdendo 2-3.
  assert.equal(esitoPallavolo('Handicap set -1.5', 'trasferta', { ...r, setCasa: 3, setTrasferta: 2 }), 'vinta');
  assert.equal(esitoPallavolo('Risultato esatto', '3-1', r), null);

  const dir = temp();
  const giocata = (id, mercato, selezione) => ({
    id, sport: 'pallavolo', competizione: 'SuperLega', partita: 'Itas Trentino - Rana Verona', idPartita: 'pallavolo-2026-10-20-itas-trentino-rana-verona',
    inizio: '2026-10-20T20:30:00+02:00', tipo: 'singola', mercato, selezione, quota: 1.9, esito: null,
  });
  writeFileSync(join(dir, '2026-10-20.json'), JSON.stringify({ data: '2026-10-20', giocate: [giocata('a', 'Vincente', 'Itas Trentino'), giocata('b', 'Totale set 3.5', 'Under 3.5')] }));
  const storici = new Map([['superlega', [
    { id: '9', stagione: 2026, giornata: 3, idCasa: '136630', idTrasferta: '137441', casa: 'Trentino Volley', trasferta: 'Verona Volley', inizio: '2026-10-20T18:30:00.000Z', puntiCasa: 3, puntiTrasferta: 1, finita: true },
  ]]]);
  const out = aggiornaEsitiPallavolo({ dirData: dir, adesso, storici, raccolta: { erroriGiro: [] } });
  assert.equal(out.aggiornate, 2);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '2026-10-20.json'), 'utf8')).giocate.map((g) => g.esito), ['vinta', 'persa']);
});
