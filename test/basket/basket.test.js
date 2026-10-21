import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codiceSquadra, nomeSquadra } from '../../src/basket/squadre.js';
import { mercatiBookmaker } from '../../src/basket/fonti/odds-basket.js';
import { dataEurolega, leggiRisultati } from '../../src/basket/fonti/eurolega.js';
import { leggiRound } from '../../src/basket/fonti/thesportsdb.js';
import { aggiornaStorico, partiteModello, stagioneBasket } from '../../src/basket/storico.js';
import { budgetBasket, doppioTurno, eseguiRaccoltaBasket, riferimento } from '../../src/basket/raccolta.js';
import { aggiornaEsitiBasket } from '../../src/basket/esiti.js';

const temp = () => mkdtempSync(join(tmpdir(), 'bet-basket-'));
const adesso = new Date('2026-10-21T05:40:00Z'); // 07:40 a Roma

test('squadre: nomi di The Odds API, dell\'API Eurolega e di TheSportsDB; mai ambigui', () => {
  assert.equal(codiceSquadra('eurolega', 'Real Madrid'), 'MAD');
  assert.equal(codiceSquadra('eurolega', 'PARTIZAN MOZZART BET BELGRADE'), 'PAR');
  assert.equal(codiceSquadra('eurolega', 'Paris Basketball'), 'PRS');
  assert.equal(codiceSquadra('eurolega', 'Crvena Zvezda Belgrade'), 'RED');
  assert.equal(codiceSquadra('eurolega', 'Maccabi Tel Aviv'), 'TEL');
  assert.equal(codiceSquadra('eurolega', 'Hapoel Tel Aviv'), 'HTA');
  assert.equal(codiceSquadra('eurolega', 'Olimpia Milano'), 'MIL');
  assert.equal(codiceSquadra('eurolega', 'Tel Aviv'), null);
  assert.equal(codiceSquadra('eurolega', 'Istanbul'), null);
  assert.equal(codiceSquadra('nbl', 'South East Melbourne Phoenix'), 'SEM');
  assert.equal(codiceSquadra('nbl', 'Melbourne United'), 'MEL');
  assert.equal(codiceSquadra('nbl', 'Melbourne'), null);
  assert.equal(codiceSquadra('nbl', 'Tasmania JackJumpers'), 'TAS');
  assert.equal(codiceSquadra('altro', 'Real Madrid'), null);
  assert.equal(nomeSquadra('nbl', 'PER'), 'Perth Wildcats');
});

test('mercatiBookmaker: h2h, handicap della casa con linee opposte, totale con la stessa linea', () => {
  const b = {
    key: 'pinnacle',
    markets: [
      { key: 'h2h', outcomes: [{ name: 'Real Madrid', price: 1.6 }, { name: 'FC Barcelona', price: 2.4 }] },
      { key: 'spreads', outcomes: [{ name: 'Real Madrid', price: 1.91, point: -4.5 }, { name: 'FC Barcelona', price: 1.91, point: 4.5 }] },
      { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 162.5 }, { name: 'Under', price: 1.92, point: 162.5 }] },
    ],
  };
  assert.deepEqual(mercatiBookmaker(b, 'Real Madrid', 'FC Barcelona'), {
    vincente: { casa: 1.6, trasferta: 2.4 },
    handicap: { '-4.5': { casa: 1.91, trasferta: 1.91 } },
    totale: { 162.5: { over: 1.9, under: 1.92 } },
  });
  const storto = { markets: [
    { key: 'spreads', outcomes: [{ name: 'Real Madrid', price: 1.91, point: -4.5 }, { name: 'FC Barcelona', price: 1.91, point: 3.5 }] },
    { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 162.5 }, { name: 'Under', price: 1.92, point: 161.5 }] },
  ] };
  assert.deepEqual(mercatiBookmaker(storto, 'Real Madrid', 'FC Barcelona'), {});
});

const xml = (giochi) => `<results xmlns:xsi="x">${giochi.map((g) => `<game><round>${g.round ?? 'RS'}</round><gameday>${g.gd}</gameday><date>${g.data}</date><time>20:00</time><gamecode>${g.id}</gamecode><hometeam>H</hometeam><homecode>${g.c}</homecode><homescore>${g.pc ?? 80}</homescore><awayteam>A</awayteam><awaycode>${g.t}</awaycode><awayscore>${g.pt ?? 75}</awayscore><played>${g.played ?? 'true'}</played></game>`).join('')}</results>`;

test('API Eurolega: date, partite giocate, postseason, giornata vuota e formato cambiato', () => {
  assert.equal(dataEurolega('Sep 24, 2026'), '2026-09-24');
  assert.equal(dataEurolega('24/09/2026'), null);
  const r = leggiRisultati(xml([
    { id: 'E2026_1', gd: 1, data: 'Sep 24, 2026', c: 'PAN', t: 'PRS', pc: 91, pt: 72 },
    { id: 'E2026_2', gd: 1, data: 'Sep 25, 2026', c: 'MAD', t: 'BAR', played: 'false' },
    { id: 'E2025_300', gd: 45, data: 'May 13, 2026', c: 'OLY', t: 'ULK', round: 'PO' },
  ]), 2026);
  assert.deepEqual(r.partite[0], { id: 'E2026_1', stagione: 2026, giornata: 1, data: '2026-09-24', casa: 'PAN', trasferta: 'PRS', puntiCasa: 91, puntiTrasferta: 72, postseason: false });
  assert.equal(r.partite.length, 2);
  assert.equal(r.partite[1].postseason, true);
  assert.deepEqual(leggiRisultati('<results xmlns:xsi="x" />', 2026), { partite: [], scartate: 0 });
  assert.throws(() => leggiRisultati('<html>errore</html>', 2026), /formato cambiato/);
});

test('TheSportsDB: finite con punteggio, in programma senza; postseason oltre il round 100', () => {
  const testo = JSON.stringify({ events: [
    { idEvent: '1', strTimestamp: '2026-10-18T06:00:00', strHomeTeam: 'Melbourne United', strAwayTeam: 'Illawarra Hawks', intHomeScore: '89', intAwayScore: '91', strStatus: 'FT' },
    { idEvent: '2', strTimestamp: '2026-10-22T08:30:00', strHomeTeam: 'Perth Wildcats', strAwayTeam: 'Sydney Kings', intHomeScore: null, intAwayScore: null, strStatus: 'NS' },
    { idEvent: '3', strHomeTeam: 'Perth Wildcats', strAwayTeam: 'Sydney Kings', strStatus: 'NS' },
  ] });
  const r = leggiRound(testo, 2026, 5);
  assert.equal(r.scartate, 1);
  assert.deepEqual(r.partite[0], {
    id: '1', stagione: 2026, giornata: 5, inizio: '2026-10-18T06:00:00.000Z', casa: 'Melbourne United', trasferta: 'Illawarra Hawks',
    puntiCasa: 89, puntiTrasferta: 91, finita: true, postseason: false,
  });
  assert.equal(r.partite[1].finita, false);
  assert.equal(r.partite[1].puntiCasa, null);
  assert.equal(leggiRound(JSON.stringify({ events: null }), 2026, 200).partite.length, 0);
  assert.throws(() => leggiRound('<html>', 2026, 1), /risposta non valida/);
});

// Fonte finta per lo storico: `giornate[stagione][giornata]` = partite (le giornate assenti sono vuote).
function fonteFinta(giornate, { errore } = {}) {
  const chiamate = [];
  const scarica = async (stagione, giornata) => {
    chiamate.push(`${stagione}/${giornata}`);
    if (errore?.(stagione, giornata)) throw new Error('HTTP 500');
    return { partite: giornate[stagione]?.[giornata] ?? [], scartate: 0 };
  };
  return { scarica, chiamate };
}
const partita = (stagione, giornata, k, extra = {}) => ({
  id: `E${stagione}_${giornata}_${k}`, stagione, giornata, data: `${stagione + (giornata > 10 ? 1 : 0)}-${giornata > 10 ? '01' : '10'}-${String(giornata).padStart(2, '0')}`,
  casa: 'MAD', trasferta: 'BAR', puntiCasa: 80 + k, puntiTrasferta: 78, postseason: false, ...extra,
});

test('storico: stagione precedente una volta sola, quella in corso dall\'ultima giornata salvata', async () => {
  const dir = temp();
  const errori = [];
  const errore = (f, e) => errori.push(`${f}: ${e?.message ?? e}`);
  const giornate = { 2025: { 1: [partita(2025, 1, 1)], 2: [partita(2025, 2, 1)] }, 2026: { 1: [partita(2026, 1, 1)], 2: [partita(2026, 2, 1)] } };
  const a = fonteFinta(giornate);
  const r = await aggiornaStorico({ campionato: 'eurolega', nomeFonte: 'API Eurolega', dirData: dir, data: '2026-10-21', adesso, scarica: a.scarica, errore, pausaMs: 0 });
  assert.deepEqual(a.chiamate, ['2026/1', '2026/2', '2026/3', '2025/1', '2025/2', '2025/3']);
  assert.equal(r.partite.length, 4);
  const salvato = JSON.parse(readFileSync(join(dir, 'storico', 'eurolega.json'), 'utf8'));
  assert.deepEqual(salvato.stagioniComplete, [2025]);
  // Il giorno dopo: la 2025 non si scarica più, la 2026 riparte dalla giornata 2 (una partita nuova alla 3).
  giornate[2026][3] = [partita(2026, 3, 1)];
  const b = fonteFinta(giornate);
  const r2 = await aggiornaStorico({ campionato: 'eurolega', nomeFonte: 'API Eurolega', dirData: dir, data: '2026-10-22', adesso, scarica: b.scarica, errore, pausaMs: 0 });
  assert.deepEqual(b.chiamate, ['2026/2', '2026/3', '2026/4']);
  assert.equal(r2.partite.length, 5);
  assert.deepEqual(errori, []);
});

test('storico: un errore ferma la stagione, lo storico salvato resta e si segnala', async () => {
  const dir = temp();
  const errori = [];
  const errore = (f, e) => errori.push(`${f}: ${e?.message ?? e}`);
  const giornate = { 2025: { 1: [partita(2025, 1, 1)], 2: [partita(2025, 2, 1)] }, 2026: { 1: [partita(2026, 1, 1)] } };
  const a = fonteFinta(giornate, { errore: (s, g) => s === 2025 && g === 2 });
  const r = await aggiornaStorico({ campionato: 'eurolega', nomeFonte: 'API Eurolega', dirData: dir, data: '2026-10-21', adesso, scarica: a.scarica, errore, pausaMs: 0 });
  assert.equal(r.partite.length, 2);
  assert.deepEqual(errori, ['API Eurolega stagione 2025 giornata 2: HTTP 500']);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'storico', 'eurolega.json'), 'utf8')).stagioniComplete, []);
  // File rotto: si riparte da zero con un errore, senza bloccare.
  writeFileSync(join(dir, 'storico', 'eurolega.json'), '{ rotto');
  const b = fonteFinta(giornate);
  await aggiornaStorico({ campionato: 'eurolega', nomeFonte: 'API Eurolega', dirData: dir, data: '2026-10-21', adesso, scarica: b.scarica, errore, pausaMs: 0 });
  assert.match(errori.at(-1), /^Storico eurolega: file illeggibile/);
  assert.equal(stagioneBasket('2026-07-31'), 2025);
  assert.equal(stagioneBasket('2026-08-01'), 2026);
});

test('partiteModello: codici dall\'API Eurolega, nomi NBL tradotti, giorno di Roma; nomi ignoti segnalati', () => {
  const nbl = partiteModello('nbl', [
    { id: '1', stagione: 2026, giornata: 5, inizio: '2026-10-17T22:30:00.000Z', casa: 'Perth Wildcats', trasferta: 'Sydney Kings', puntiCasa: 90, puntiTrasferta: 88, finita: true, postseason: false },
    { id: '2', stagione: 2026, giornata: 5, inizio: '2026-10-18T06:00:00.000Z', casa: 'Squadra Nuova', trasferta: 'Sydney Kings', puntiCasa: 90, puntiTrasferta: 88, finita: true, postseason: false },
  ]);
  assert.deepEqual(nbl.ignote, ['Squadra Nuova']);
  assert.equal(nbl.righe.length, 1);
  assert.equal(nbl.righe[0].dataUsa, '2026-10-18');
  assert.equal(nbl.righe[0].casa, 'PER');
  const el = partiteModello('eurolega', [partita(2026, 1, 1)]);
  assert.equal(el.righe[0].casa, 'MAD');
});

test('doppio turno: partita nei 2 giorni prima, non lo stesso giorno né 3 giorni prima', () => {
  const righe = [{ casa: 'MAD', trasferta: 'BAR', dataUsa: '2026-10-19' }];
  assert.equal(doppioTurno(righe, 'MAD', '2026-10-21'), true);
  assert.equal(doppioTurno(righe, 'BAR', '2026-10-20'), true);
  assert.equal(doppioTurno(righe, 'MAD', '2026-10-22'), false);
  assert.equal(doppioTurno(righe, 'MAD', '2026-10-19'), false);
  assert.equal(doppioTurno(righe, 'PAN', '2026-10-21'), false);
});

const bk = (chiave, { v = [1.6, 2.4], h = { '-4.5': [1.91, 1.91] }, t = { '162.5': [1.9, 1.92] } } = {}) => ({
  chiave,
  mercati: {
    ...(v ? { vincente: { casa: v[0], trasferta: v[1] } } : {}),
    ...(h ? { handicap: Object.fromEntries(Object.entries(h).map(([l, [c, tr]]) => [l, { casa: c, trasferta: tr }])) } : {}),
    ...(t ? { totale: Object.fromEntries(Object.entries(t).map(([l, [o, u]]) => [l, { over: o, under: u }])) } : {}),
  },
});

test('riferimento: Pinnacle sulla stessa linea, altrimenti il consenso di almeno 3 bookmaker (exchange esclusi)', () => {
  const ev = { bookmaker: [bk('pinnacle', { h: { '-3.5': [1.9, 1.9] } }), bk('a'), bk('b'), bk('c'), bk('betfair_ex_eu', { v: [5, 1.1] })] };
  const v = riferimento(ev, 'vincente', null);
  assert.equal(v.etichetta, 'Pinnacle');
  assert.ok(Math.abs(v.prob.casa - (1 / 1.6) / (1 / 1.6 + 1 / 2.4)) < 1e-12);
  const h = riferimento(ev, 'handicap', -4.5);
  assert.equal(h.etichetta, 'Consenso bookmaker');
  assert.ok(Math.abs(h.prob.casa - 0.5) < 1e-12);
  assert.equal(riferimento({ bookmaker: [bk('a'), bk('b')] }, 'handicap', -4.5), null);
});

function scriviRaccolta(dir, nome, contenuto) {
  mkdirSync(join(dir, 'raccolta'), { recursive: true });
  writeFileSync(join(dir, 'raccolta', nome), JSON.stringify(contenuto));
}

test('budget: dopo calcio e tennis, con la serata del tennis da parte e mai sotto la riserva', () => {
  const dir = temp();
  const errori = [];
  const errore = (f, e) => errori.push(`${f}: ${e}`);
  // 21 ottobre: 11 giorni rimasti; (300 − 100) / 11 = 18 al giorno.
  scriviRaccolta(dir, '2026-10-21.json', { data: '2026-10-21', crediti: { usati: 4, rimasti: 296 } });
  scriviRaccolta(dir, '2026-10-21-tennis.json', { data: '2026-10-21', crediti: { usati: 2, rimasti: 294 }, partite: [{ competizione: 'WTA Ningbo' }, { competizione: 'WTA Ningbo' }, { competizione: 'ATP Vienna' }] });
  assert.deepEqual(budgetBasket({ data: '2026-10-21', dirData: dir, rimastiOra: 294, errore }), { budget: 18 - 6 - 2, rimastiOra: 294 });
  assert.deepEqual(budgetBasket({ data: '2026-10-21', dirData: dir, rimastiOra: 104, errore }).budget, 2);
  assert.deepEqual(errori, []);
  // Senza file di calcio e tennis: budget sui crediti rimasti, con un avviso.
  const vuoto = temp();
  assert.equal(budgetBasket({ data: '2026-10-21', dirData: vuoto, rimastiOra: 300, errore }).budget, 18);
  assert.match(errori[0], /Crediti di calcio e tennis sconosciuti/);
  assert.deepEqual(budgetBasket({ data: '2026-10-21', dirData: vuoto, rimastiOra: null, errore }), { budget: 0, rimastiOra: null });
});

// Storico Eurolega di prova: 4 squadre, girone di andata e ritorno nella stagione 2025 e due giornate nella 2026.
function giornateEurolega() {
  const sq = ['MAD', 'BAR', 'PAN', 'OLY'];
  const out = { 2025: {}, 2026: {} };
  let k = 0;
  for (const stagione of [2025, 2026]) {
    let gd = 0;
    for (let giro = 0; giro < (stagione === 2025 ? 6 : 2); giro++) {
      gd++;
      out[stagione][gd] = [];
      sq.forEach((c, i) => sq.forEach((t, j) => {
        if (i >= j || (i + j + giro) % 2) return;
        k++;
        const [casa, trasferta] = giro % 2 ? [t, c] : [c, t];
        out[stagione][gd].push({
          id: `E${stagione}_${k}`, stagione, giornata: gd, data: stagione === 2025 ? `2026-0${1 + giro}-10` : `2026-10-${String(10 + gd * 3).padStart(2, '0')}`,
          casa, trasferta, puntiCasa: 80 + ((i * 7 + k) % 15), puntiTrasferta: 76 + ((j * 5 + 2 * k) % 13), postseason: false,
        });
      }));
    }
  }
  return out;
}

function fontiFinte({ eventi = {}, quote = {}, rimasti = 300 } = {}) {
  const el = giornateEurolega();
  const chiamate = [];
  return {
    chiamate,
    eurolega: { giornata: async (s, g) => ({ partite: el[s]?.[g] ?? [], scartate: 0 }) },
    thesportsdb: { round: async () => ({ partite: [], scartate: 0 }) },
    oddsBasket: {
      eventi: async (chiave) => { chiamate.push(`eventi ${chiave}`); return { eventi: eventi[chiave] ?? [], rimasti }; },
      quote: async (chiave) => { chiamate.push(`quote ${chiave}`); return { eventi: quote[chiave] ?? [], rimasti: rimasti - 3 }; },
    },
  };
}

const evento = (casa, trasferta, inizio, bookmaker) => ({ id: `${casa}-${trasferta}`, casa, trasferta, inizio, bookmaker });

test('raccolta: partite di Eurolega con modello, mercati con quota mediana e riferimento; NBL senza partite non costa', async () => {
  const dir = temp();
  scriviRaccolta(dir, '2026-10-21.json', { data: '2026-10-21', crediti: { usati: 4, rimasti: 296 } });
  const ev = evento('Real Madrid', 'FC Barcelona', '2026-10-21T18:45:00Z', [bk('pinnacle'), bk('a'), bk('b'), bk('c')]);
  const sconosciuta = evento('Squadra Ignota', 'FC Barcelona', '2026-10-21T18:45:00Z', [bk('pinnacle'), bk('a'), bk('b'), bk('c')]);
  const fonti = fontiFinte({
    eventi: { basketball_euroleague: [{ id: 'x', casa: 'Real Madrid', trasferta: 'FC Barcelona', inizio: '2026-10-21T18:45:00Z' }] },
    quote: { basketball_euroleague: [ev, sconosciuta] },
  });
  const r = await eseguiRaccoltaBasket({ data: '2026-10-21', adesso, fonti, chiavi: { oddsApi: 'K' }, dirData: dir, pausaMs: 0 });
  assert.deepEqual(fonti.chiamate, ['eventi basketball_euroleague', 'eventi basketball_nbl', 'quote basketball_euroleague']);
  assert.deepEqual(r.crediti, { usati: 3, rimasti: 297 });
  assert.equal(r.partite.length, 1);
  const p = r.partite[0];
  assert.equal(p.idPartita, 'basket-2026-10-21-real-madrid-fc-barcelona');
  assert.equal(p.sport, 'basket');
  assert.equal(p.competizione, 'Eurolega');
  assert.equal(p.modello, 'basket');
  assert.equal(p.inizio, '2026-10-21T20:45:00+02:00');
  assert.equal(p.pesoModello, 0.25);
  assert.deepEqual(p.mercati.map((m) => `${m.mercato} | ${m.selezione}`), [
    'Vincente | Real Madrid', 'Vincente | FC Barcelona', 'Handicap -4.5 | casa', 'Handicap -4.5 | trasferta',
    'Totale punti 162.5 | Over 162.5', 'Totale punti 162.5 | Under 162.5',
  ]);
  for (const m of p.mercati) {
    assert.ok(m.probModello > 0 && m.probModello < 1, m.mercato);
    assert.equal(m.fonteQuota, 'mediana di 4 bookmaker (The Odds API)');
  }
  assert.equal(p.mercati[0].quota, 1.6);
  assert.ok(Math.abs(p.mercati[0].probModello + p.mercati[1].probModello - 1) < 1e-9);
  assert.ok(r.erroriGiro.includes('Squadre Eurolega non riconosciute: Squadra Ignota'), r.erroriGiro.join('\n'));
  assert.ok(existsSync(join(dir, 'storico', 'eurolega.json')));
  assert.equal(JSON.stringify(r).includes('storici'), false);
});

test('raccolta: crediti insufficienti, chiave mancante, squadre con poche partite solo mercato', async () => {
  const dir = temp();
  const ev = evento('Real Madrid', 'FC Barcelona', '2026-10-21T18:45:00Z', [bk('pinnacle'), bk('a'), bk('b'), bk('c')]);
  const conEventi = { basketball_euroleague: [ev] };
  // Riserva: con 101 crediti rimasti il basket non spende.
  const povere = fontiFinte({ eventi: conEventi, quote: conEventi, rimasti: 101 });
  const r = await eseguiRaccoltaBasket({ data: '2026-10-21', adesso, fonti: povere, chiavi: { oddsApi: 'K' }, dirData: dir, pausaMs: 0 });
  assert.deepEqual(r.competizioniNonCoperte, ['Eurolega: crediti insufficienti']);
  assert.ok(!povere.chiamate.some((c) => c.startsWith('quote')));
  // Senza chiave: storico aggiornato lo stesso, nessuna partita, un errore.
  const senza = await eseguiRaccoltaBasket({ data: '2026-10-21', adesso, fonti: fontiFinte(), chiavi: {}, dirData: temp(), pausaMs: 0 });
  assert.equal(senza.partite.length, 0);
  assert.match(senza.erroriGiro.at(-1), /manca ODDS_API_KEY/);
  // Squadra con meno di 8 partite salvate: niente modello, solo il mercato.
  const nuova = evento('Dubai Basketball', 'FC Barcelona', '2026-10-21T18:45:00Z', [bk('pinnacle'), bk('a'), bk('b'), bk('c')]);
  const f = fontiFinte({ eventi: { basketball_euroleague: [nuova] }, quote: { basketball_euroleague: [nuova] } });
  const s = await eseguiRaccoltaBasket({ data: '2026-10-21', adesso, fonti: f, chiavi: { oddsApi: 'K' }, dirData: temp(), pausaMs: 0 });
  assert.equal(s.partite[0].modello, 'solo-pinnacle');
  assert.ok(s.partite[0].mercati.every((m) => m.probModello === null));
  assert.match(s.partite[0].ragionamentoBase[0], /Meno di 8 partite salvate/);
});

test('esiti: dal punteggio salvato nello storico, per codice e giorno; giornata di oggi non toccata', () => {
  const dir = temp();
  const giocata = (id, mercato, selezione, extra = {}) => ({
    id, sport: 'basket', competizione: 'Eurolega', partita: 'Real Madrid - FC Barcelona', idPartita: 'basket-2026-10-20-real-madrid-fc-barcelona',
    inizio: '2026-10-20T20:45:00+02:00', tipo: 'singola', mercato, selezione, quota: 1.9, esito: null, ...extra,
  });
  const giornata = { data: '2026-10-20', giocate: [
    giocata('a', 'Vincente', 'Real Madrid'),
    giocata('b', 'Handicap -4.5', 'casa'),
    giocata('c', 'Totale punti 160', 'Over 160'),
    giocata('d', 'Vincente', 'Real Madrid', { competizione: 'NBL (Australia)' }),
  ] };
  writeFileSync(join(dir, '2026-10-20.json'), JSON.stringify(giornata));
  const storici = new Map([['eurolega', [{ id: 'E2026_70', stagione: 2026, giornata: 7, data: '2026-10-20', casa: 'MAD', trasferta: 'BAR', puntiCasa: 84, puntiTrasferta: 76, postseason: false }]], ['nbl', []]]);
  const raccolta = { erroriGiro: [] };
  const out = aggiornaEsitiBasket({ dirData: dir, adesso, storici, raccolta });
  assert.equal(out.aggiornate, 3);
  const g = JSON.parse(readFileSync(join(dir, '2026-10-20.json'), 'utf8'));
  assert.deepEqual(g.giocate.map((x) => x.esito), ['vinta', 'vinta', 'rimborsata', null]);
});
