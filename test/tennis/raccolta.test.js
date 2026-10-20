import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eseguiRaccoltaTennis, raccoltaDiErrore, quotaMedianaTennis, probPinnacleTennis, spiegazioneTennis, torneoTennisData,
} from '../../src/tennis/raccolta.js';
import { budgetCrediti } from '../../src/calcio/raccolta.js';

const DATA = '2026-10-20';
const adesso = new Date('2026-10-20T05:35:00Z'); // 07:35 a Roma
const chiavi = { oddsApi: 'K' };

// Storico tennis-data: girone fra 4 giocatori, ripetuto, su due tornei.
function storico(circuito, anno) {
  const giocatori = circuito === 'atp'
    ? ['Sinner J.', 'Alcaraz C.', 'Zverev A.', 'Rune H.']
    : ['Swiatek I.', 'Gauff C.', 'Sabalenka A.', 'Rybakina E.'];
  const tornei = circuito === 'atp'
    ? [{ torneo: 'Paris Masters', superficie: 'cemento' }, { torneo: 'French Open', superficie: 'terra' }]
    : [{ torneo: 'Wuhan Open', superficie: 'cemento' }, { torneo: 'Madrid Open', superficie: 'terra' }];
  const out = [];
  let k = 0;
  for (let giro = 0; giro < 4; giro++) {
    for (let i = 0; i < giocatori.length; i++) {
      for (let j = i + 1; j < giocatori.length; j++) {
        k++;
        const t = tornei[k % 2];
        const mese = String(1 + (k % 9)).padStart(2, '0');
        const [w, l] = (k % 3 === 0) ? [giocatori[j], giocatori[i]] : [giocatori[i], giocatori[j]];
        out.push({
          data: `${anno}-${mese}-${String(1 + (k % 27)).padStart(2, '0')}`, torneo: t.torneo, serie: null, superficie: t.superficie,
          turno: null, bestOf: 3, vincitore: w, perdente: l, setW: [6, 6], setL: [3, 4], commento: null,
        });
      }
    }
  }
  return out;
}

const bk = (chiave, a, b, g1 = 'Jannik Sinner', g2 = 'Carlos Alcaraz') => ({ chiave, aggiornato: 'T', quote: { [g1]: a, [g2]: b } });
const libro = (g1, g2) => [
  bk('pinnacle', 1.8, 2.05, g1, g2), bk('bet365', 1.83, 2.0, g1, g2), bk('unibet', 1.85, 1.95, g1, g2), bk('betfair_ex_eu', 2.5, 1.5, g1, g2),
];
const ev = (id, g1, g2, inizio) => ({ id, giocatore1: g1, giocatore2: g2, inizio });

const PARIGI = { chiave: 'tennis_atp_paris_masters', titolo: 'ATP Paris Masters', circuito: 'atp' };
const WUHAN = { chiave: 'tennis_wta_wuhan_open', titolo: 'WTA Wuhan Open', circuito: 'wta' };

function fonti({ tornei = [PARIGI], eventi = {}, rimasti = 294, tdGiu = false, tdAnniGiu = [], libri = {} } = {}) {
  const chiamate = { eventi: [], quote: [], td: [], risultati: [] };
  return {
    chiamate,
    oddsTennis: {
      torneiAttivi: async () => tornei,
      eventi: async (chiave) => {
        chiamate.eventi.push(chiave);
        return { eventi: (eventi[chiave] ?? []).map(({ bookmaker, ...e }) => e), rimasti };
      },
      quote: async (chiave) => {
        chiamate.quote.push(chiave);
        const lista = (eventi[chiave] ?? []).map((e) => ({ ...e, bookmaker: libri[e.id] ?? libro(e.giocatore1, e.giocatore2) }));
        return { eventi: lista, rimasti: rimasti - chiamate.quote.length, usati: 100 };
      },
      risultati: async (chiave) => { chiamate.risultati.push(chiave); return []; },
    },
    tennisData: {
      partite: async (anno, circuito) => {
        chiamate.td.push(`${circuito}${anno}`);
        if (tdGiu || tdAnniGiu.includes(anno)) throw new Error('HTTP 503');
        return storico(circuito, anno);
      },
    },
  };
}

function dirConCalcio(crediti) {
  const d = mkdtempSync(join(tmpdir(), 'tennis-'));
  mkdirSync(join(d, 'raccolta'), { recursive: true });
  if (crediti) writeFileSync(join(d, 'raccolta', `${DATA}.json`), JSON.stringify({ data: DATA, crediti, partite: [] }));
  return d;
}

const SINNER_ALCARAZ = ev('e1', 'Jannik Sinner', 'Carlos Alcaraz', '2026-10-21T03:00:00Z'); // 05:00 di Roma del 21/10

test('partita alle 05:00 di Roma del 21/10 nella giornata del 20/10; fuori le 07:00 del 20 e le 08:30 del 21', async () => {
  const f = fonti({
    eventi: {
      [PARIGI.chiave]: [
        SINNER_ALCARAZ,
        ev('e2', 'Alexander Zverev', 'Holger Rune', '2026-10-21T06:30:00Z'),
        ev('e3', 'Alexander Zverev', 'Carlos Alcaraz', '2026-10-20T05:00:00Z'),
      ],
    },
  });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 294 }) });
  assert.equal(r.partite.length, 1);
  const p = r.partite[0];
  assert.equal(p.idPartita, 'tennis-2026-10-20-carlos-alcaraz-jannik-sinner');
  assert.equal(p.partita, 'Jannik Sinner - Carlos Alcaraz');
  assert.equal(p.sport, 'tennis');
  assert.equal(p.competizione, 'ATP Paris Masters');
  assert.equal(p.modello, 'elo');
  assert.equal(p.lambda, null);
  assert.equal(p.inizio, '2026-10-21T05:00:00+02:00');
  assert.equal(p.superficie, 'cemento');
  assert.equal(p.bestOf, 3);
  assert.ok([0.25, 0.5].includes(p.pesoModello));
  assert.deepEqual(Object.keys(p.elo).sort(), ['Carlos Alcaraz', 'Jannik Sinner']);
  assert.ok(Number.isFinite(p.elo['Jannik Sinner'].tot) && Number.isFinite(p.elo['Jannik Sinner'].superficie));
  assert.equal(p.mercati.length, 2);
  const [s, a] = p.mercati;
  assert.equal(s.mercato, 'Vincente incontro');
  assert.equal(s.selezione, 'Jannik Sinner');
  assert.equal(a.selezione, 'Carlos Alcaraz');
  assert.ok(Math.abs(s.probModello + a.probModello - 1) < 1e-9);
  assert.equal(s.quota, 1.83);
  assert.equal(a.quota, 2);
  assert.equal(s.fonteQuota, 'mediana di 3 bookmaker (The Odds API)');
  assert.equal(s.oraQuota, '2026-10-20T07:35:00+02:00');
  assert.equal(s.frequenzaCampionato, null);
  const pin = (1 / 1.8) / (1 / 1.8 + 1 / 2.05);
  assert.ok(Math.abs(s.probPinnacle - pin) < 1e-12);
  assert.equal(s.spiegazione, 'Vincente incontro: vince se Jannik Sinner vince la partita. Se un giocatore si ritira dopo almeno un set completo vince chi passa il turno; se si ritira prima, o la partita non si gioca, la giocata è rimborsata');
  assert.deepEqual(r.crediti, { usati: 1, rimasti: 293 });
  assert.deepEqual(r.erroriGiro, []);
  // Tre stagioni di storico per il circuito usato, nessuna per l'altro.
  assert.deepEqual(f.chiamate.td.sort(), ['atp2024', 'atp2025', 'atp2026']);
});

test('budget: calcio 6 crediti spesi su 16, 3 tornei attivi → il tennis ne usa al massimo 7 (qui 3)', async () => {
  assert.equal(budgetCrediti(300, DATA), 16);
  const tornei = [PARIGI, WUHAN, { chiave: 'tennis_wta_tokyo', titolo: 'WTA Tokyo', circuito: 'wta' }];
  const eventi = {
    [PARIGI.chiave]: [SINNER_ALCARAZ],
    [WUHAN.chiave]: [ev('w1', 'Iga Swiatek', 'Coco Gauff', '2026-10-20T08:00:00Z')],
    tennis_wta_tokyo: [ev('t1', 'Aryna Sabalenka', 'Elena Rybakina', '2026-10-20T04:00:00Z'), ev('t2', 'Aryna Sabalenka', 'Coco Gauff', '2026-10-20T07:00:00Z')],
  };
  const f = fonti({ tornei, eventi });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 294 }) });
  assert.equal(f.chiamate.quote.length, 3);
  assert.equal(r.crediti.usati, 3);
  assert.deepEqual(r.competizioniNonCoperte, []);
  assert.equal(r.partite.length, 3);

  // Con 9 tornei attivi il budget è 16 − 6 − 9 = 1: coperto solo il torneo che inizia prima.
  const nove = Array.from({ length: 9 }, (_, i) => ({ chiave: `tennis_wta_t${i}`, titolo: `WTA T${i}`, circuito: 'wta' }));
  const ev9 = Object.fromEntries(nove.map((t, i) => [t.chiave, [ev(`x${i}`, 'Iga Swiatek', 'Coco Gauff', `2026-10-20T${String(15 - i).padStart(2, '0')}:00:00Z`)]]));
  const f9 = fonti({ tornei: nove, eventi: ev9 });
  const r9 = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f9, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 294 }) });
  assert.deepEqual(f9.chiamate.quote, ['tennis_wta_t8']);
  assert.equal(r9.crediti.usati, 1);
  assert.equal(r9.competizioniNonCoperte.length, 8);
  assert.ok(r9.competizioniNonCoperte.includes('WTA T0: crediti insufficienti'));
});

test('budget: copre al massimo 7 tornei quando il budget del tennis è 7', async () => {
  // rimastiInizio 400 → budgetCrediti 25; calcio 6 → 19; 12 tornei attivi → 19 − 12 = 7.
  assert.equal(budgetCrediti(400, DATA), 25);
  const dodici = Array.from({ length: 12 }, (_, i) => ({ chiave: `tennis_atp_t${i}`, titolo: `ATP T${i}`, circuito: 'atp' }));
  const eventi = Object.fromEntries(dodici.map((t, i) => [t.chiave, [ev(`x${i}`, 'Jannik Sinner', 'Carlos Alcaraz', `2026-10-20T${String(8 + i).padStart(2, '0')}:00:00Z`)]]));
  const f = fonti({ tornei: dodici, eventi, rimasti: 394 });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 394 }) });
  assert.equal(f.chiamate.quote.length, 7);
  assert.deepEqual(f.chiamate.quote, dodici.slice(0, 7).map((t) => t.chiave));
  assert.equal(r.competizioniNonCoperte.length, 5);
});

test('crediti quasi finiti: nessuna quota, tornei scoperti con il messaggio, la riserva non si tocca', async () => {
  const f = fonti({ eventi: { [PARIGI.chiave]: [SINNER_ALCARAZ] }, rimasti: 105 });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 2, rimasti: 105 }) });
  assert.deepEqual(f.chiamate.quote, []);
  assert.deepEqual(r.competizioniNonCoperte, ['ATP Paris Masters: crediti insufficienti']);
  assert.deepEqual(r.partite, []);
  assert.deepEqual(r.crediti, { usati: 0, rimasti: 105 });
});

test('senza il file del calcio i crediti si leggono dalla prima chiamata gratuita', async () => {
  // 300 rimasti → budgetCrediti 16; 1 torneo → 15.
  const f = fonti({ eventi: { [PARIGI.chiave]: [SINNER_ALCARAZ] }, rimasti: 300 });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio(null) });
  assert.equal(r.crediti.usati, 1);
  assert.equal(r.partite.length, 1);
  // Riserva del 20%: con 101 crediti rimasti e nessun calcio non si spende niente.
  const f2 = fonti({ eventi: { [PARIGI.chiave]: [SINNER_ALCARAZ] }, rimasti: 101 });
  const r2 = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f2, chiavi, dirData: dirConCalcio(null) });
  assert.deepEqual(f2.chiamate.quote, []);
  assert.deepEqual(r2.competizioniNonCoperte, ['ATP Paris Masters: crediti insufficienti']);
});

test('file del calcio illeggibile → errore, crediti dalla prima chiamata gratuita', async () => {
  const d = dirConCalcio(null);
  writeFileSync(join(d, 'raccolta', `${DATA}.json`), '{rotto');
  const f = fonti({ eventi: { [PARIGI.chiave]: [SINNER_ALCARAZ] }, rimasti: 300 });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: d });
  assert.ok(r.erroriGiro.some((e) => /^Raccolta calcio alle 07:35: .*crediti/.test(e)), r.erroriGiro.join('\n'));
  assert.equal(r.partite.length, 1);
});

test('nome non abbinato → errore, la partita resta senza candidati', async () => {
  const f = fonti({ eventi: { [PARIGI.chiave]: [SINNER_ALCARAZ, ev('e9', 'Mario Rossi', 'Alexander Zverev', '2026-10-20T12:00:00Z')] } });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 294 }) });
  assert.deepEqual(r.erroriGiro, ['Giocatori non riconosciuti: Mario Rossi (ATP Paris Masters)']);
  assert.deepEqual(r.partite.map((p) => p.partita), ['Jannik Sinner - Carlos Alcaraz']);
});

test('tennis-data giù → errori, partite con il solo Pinnacle (probModello null)', async () => {
  const f = fonti({ eventi: { [PARIGI.chiave]: [SINNER_ALCARAZ] }, tdGiu: true });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 294 }) });
  assert.equal(r.erroriGiro.filter((e) => /^tennis-data\.co\.uk ATP 202[456] alle 07:35: HTTP 503$/.test(e)).length, 3, r.erroriGiro.join('\n'));
  assert.equal(r.partite.length, 1);
  const p = r.partite[0];
  assert.equal(p.elo, null);
  assert.equal(p.pesoModello, null);
  for (const m of p.mercati) {
    assert.equal(m.probModello, null);
    assert.ok(m.probPinnacle > 0 && m.probPinnacle < 1);
  }
});

test('una stagione tennis-data giù → errore, le altre bastano per il modello', async () => {
  const f = fonti({ eventi: { [PARIGI.chiave]: [SINNER_ALCARAZ] }, tdAnniGiu: [2026] });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 294 }) });
  assert.deepEqual(r.erroriGiro, ['tennis-data.co.uk ATP 2026 alle 07:35: HTTP 503']);
  assert.ok(r.partite[0].mercati.every((m) => Number.isFinite(m.probModello)));
});

test('torneo sconosciuto a tennis-data → cemento al meglio dei 3 e un errore; Slam ATP al meglio dei 5', async () => {
  const pechino = { chiave: 'tennis_atp_china_open', titolo: 'ATP China Open Beijing', circuito: 'atp' };
  const slam = { chiave: 'tennis_atp_french_open', titolo: 'ATP French Open', circuito: 'atp' };
  const f = fonti({
    tornei: [pechino, slam],
    eventi: { [pechino.chiave]: [SINNER_ALCARAZ], [slam.chiave]: [ev('s1', 'Alexander Zverev', 'Holger Rune', '2026-10-20T10:00:00Z')] },
  });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 294 }) });
  assert.deepEqual(r.erroriGiro, ['tennis-data.co.uk alle 07:35: torneo ATP China Open Beijing non trovato nello storico, si usa cemento al meglio dei 3 set']);
  const p1 = r.partite.find((p) => p.competizione === 'ATP China Open Beijing');
  const p2 = r.partite.find((p) => p.competizione === 'ATP French Open');
  assert.equal(p1.superficie, 'cemento');
  assert.equal(p1.bestOf, 3);
  assert.equal(p2.superficie, 'terra');
  assert.equal(p2.bestOf, 5);
});

test('mercato senza quota (meno di 3 bookmaker) saltato; nessun mercato → partita fuori con errore', async () => {
  const f = fonti({
    eventi: { [PARIGI.chiave]: [SINNER_ALCARAZ] },
    libri: { e1: [bk('pinnacle', 1.8, 2.05), bk('bet365', 1.83, 2.0)] },
  });
  const r = await eseguiRaccoltaTennis({ data: DATA, adesso, fonti: f, chiavi, dirData: dirConCalcio({ usati: 6, rimasti: 294 }) });
  assert.deepEqual(r.partite, []);
  assert.deepEqual(r.erroriGiro, ['The Odds API alle 07:35: 1 partita senza quota utilizzabile (ATP Paris Masters)']);
});

test('quota mediana e Pinnacle senza margine', () => {
  const e = { bookmaker: libro('A', 'B') };
  assert.deepEqual(quotaMedianaTennis(e, 'A'), { quota: 1.83, n: 3 });
  assert.deepEqual(quotaMedianaTennis({ bookmaker: [bk('a', 1.9, 2, 'A', 'B'), bk('b', 1.95, 2, 'A', 'B'), bk('c', 1.92, 2, 'A', 'B'), bk('d', 1.97, 2, 'A', 'B')] }, 'A'), { quota: 1.93, n: 4 });
  assert.equal(quotaMedianaTennis({ bookmaker: e.bookmaker.slice(0, 2) }, 'A'), null);
  const p = probPinnacleTennis(e, 'A', 'B');
  assert.ok(Math.abs(p.A + p.B - 1) < 1e-12);
  assert.equal(probPinnacleTennis({ bookmaker: e.bookmaker.slice(1) }, 'A', 'B'), null);
  assert.match(spiegazioneTennis('X'), /^Vincente incontro: vince se X vince la partita\./);
});

test('torneo tennis-data: titolo Odds normalizzato, riga più recente', () => {
  const righe = [
    { data: '2025-10-30', torneo: 'Paris Masters', superficie: 'cemento' },
    { data: '2024-10-30', torneo: 'Paris Masters', superficie: 'terra' },
    { data: '2025-05-30', torneo: 'French Open', superficie: 'terra' },
  ];
  assert.equal(torneoTennisData('ATP Paris Masters', righe).superficie, 'cemento');
  assert.equal(torneoTennisData('ATP French Open', righe).superficie, 'terra');
  assert.equal(torneoTennisData('WTA Tokyo', righe), null);
});

test('senza ODDS_API_KEY: file con partite [] e l\'errore, uscita 0', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'tennis-cli-'));
  const script = fileURLToPath(new URL('../../src/tennis/raccolta.js', import.meta.url));
  const env = { ...process.env };
  delete env.ODDS_API_KEY;
  const p = spawnSync(process.execPath, [script, '--data', DATA], { cwd, env, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr);
  const file = join(cwd, `data/raccolta/${DATA}-tennis.json`);
  assert.ok(existsSync(file));
  const r = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(r.partite, []);
  assert.equal(r.erroriGiro.length, 1);
  assert.match(r.erroriGiro[0], /^The Odds API alle \d\d:\d\d: manca ODDS_API_KEY$/);
  assert.equal(r.data, DATA);
});

test('imprevisto: raccolta di ripiego con partite [] e l\'errore', () => {
  const r = raccoltaDiErrore(DATA, adesso, new Error('boom'));
  assert.deepEqual(r.partite, []);
  assert.deepEqual(r.erroriGiro, ['Tennis alle 07:35: boom']);
  assert.deepEqual(r.crediti, { usati: 0, rimasti: null });
  assert.deepEqual(r.competizioniNonCoperte, []);
});
