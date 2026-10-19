import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { footballDataUk } from '../../src/calcio/fonti/football-data-uk.js';
import { stimaForze, lambda, matrice, poisson, pesoTemporale } from '../../src/calcio/modelli/gol.js';
import { mercatiGol, frequenzeGol } from '../../src/calcio/modelli/mercati-gol.js';

const csvI1 = readFileSync(new URL('../fixtures/calcio/I1.csv', import.meta.url), 'utf8');
async function partiteI1() {
  const fetch = async () => ({ status: 200, ok: true, headers: new Headers(), text: async () => csvI1 });
  return footballDataUk.partite('I1', ['2627'], { fetch, attesaMs: 0 });
}

const p = (data, casa, trasferta, gc, gt, extra = {}) => ({
  data, casa, trasferta, gc, gt, gcPT: null, gtPT: null, xgC: null, xgT: null,
  angoliC: null, angoliT: null, cartC: null, cartT: null, arbitro: null, ...extra,
});

// Campionato sintetico: doppio girone a 6 squadre; "Forte" segna 2 gol in più, chi gioca in casa 1 in più.
function campionatoSintetico() {
  const squadre = ['Forte', 'B', 'C', 'D', 'E', 'F'];
  const out = [];
  let giorno = 1;
  for (const c of squadre) {
    for (const t of squadre) {
      if (c === t) continue;
      const gc = 1 + (c === 'Forte' ? 2 : 0) + ((giorno % 3) === 0 ? 1 : 0);
      const gt = (t === 'Forte' ? 2 : 0) + ((giorno % 2) === 0 ? 1 : 0);
      out.push(p(`2026-0${1 + Math.floor(giorno / 10)}-${String(1 + (giorno % 10) * 2).padStart(2, '0')}`, c, t, gc, gt));
      giorno++;
    }
  }
  return { partite: out, squadre: new Set(squadre) };
}

const trova = (mercati, mercato, selezione) => {
  const m = mercati.find((x) => x.mercato === mercato && x.selezione === selezione);
  assert.ok(m, `manca ${mercato} | ${selezione}`);
  return m.prob;
};

test('matrice: somma 1 e P(0-0) corretta da rho', () => {
  const m = matrice(1.5, 1.1);
  assert.equal(m.length, 11);
  assert.equal(m[0].length, 11);
  assert.ok(Math.abs(m.flat().reduce((a, b) => a + b) - 1) < 1e-9);
  assert.ok(m[0][0] > poisson(0, 1.5) * poisson(0, 1.1)); // rho negativo alza lo 0-0
  const indip = matrice(1.5, 1.1, 0);
  assert.ok(Math.abs(indip[2][1] / indip[1][2] - (poisson(2, 1.5) * poisson(1, 1.1)) / (poisson(1, 1.5) * poisson(2, 1.1))) < 1e-9);
});

test('mercatiGol: 1X2 somma 1, Over 2.5 + Under 2.5 = 1, Gol + No gol = 1', () => {
  const m = mercatiGol(1.5, 1.1, 0.45);
  const s1x2 = trova(m, '1X2', '1') + trova(m, '1X2', 'X') + trova(m, '1X2', '2');
  assert.ok(Math.abs(s1x2 - 1) < 1e-9);
  for (const l of ['1.5', '2.5', '3.5']) {
    assert.ok(Math.abs(trova(m, `Under/Over ${l}`, `Over ${l}`) + trova(m, `Under/Over ${l}`, `Under ${l}`) - 1) < 1e-9);
  }
  assert.ok(Math.abs(trova(m, 'Gol/No gol', 'Gol') + trova(m, 'Gol/No gol', 'No gol') - 1) < 1e-9);
  assert.ok(Math.abs(trova(m, 'Doppia chance', '1X') - trova(m, '1X2', '1') - trova(m, '1X2', 'X')) < 1e-9);
});

test('mercatiGol contiene tutti i mercati dei gol con i nomi esatti e probabilità in (0,1)', () => {
  const m = mercatiGol(1.5, 1.1, 0.45);
  const attese = [];
  for (const s of ['1', 'X', '2']) attese.push(['1X2', s]);
  for (const s of ['1X', '12', 'X2']) attese.push(['Doppia chance', s]);
  for (const l of ['1.5', '2.5', '3.5']) attese.push([`Under/Over ${l}`, `Over ${l}`], [`Under/Over ${l}`, `Under ${l}`]);
  for (const lato of ['casa', 'trasferta']) {
    for (const l of ['0.5', '1.5', '2.5']) attese.push([`Under/Over ${lato} ${l}`, `Over ${l}`], [`Under/Over ${lato} ${l}`, `Under ${l}`]);
  }
  for (const l of ['0.5', '1.5']) attese.push([`Under/Over 1° tempo ${l}`, `Over ${l}`], [`Under/Over 1° tempo ${l}`, `Under ${l}`]);
  attese.push(['Gol/No gol', 'Gol'], ['Gol/No gol', 'No gol']);
  for (let c = 0; c <= 4; c++) for (let t = 0; t <= 4; t++) attese.push(['Risultato esatto', `${c}-${t}`]);
  for (const h of ['-1.5', '-1', '-0.5', '+0.5', '+1', '+1.5']) attese.push([`Handicap asiatico ${h}`, 'casa'], [`Handicap asiatico ${h}`, 'trasferta']);
  assert.equal(m.length, attese.length);
  for (const [mercato, selezione] of attese) {
    const prob = trova(m, mercato, selezione);
    assert.ok(Number.isFinite(prob) && prob > 0 && prob < 1, `${mercato} ${selezione}: ${prob}`);
  }
  // λ estremi: le probabilità restano dentro (0,1)
  for (const x of mercatiGol(0.01, 8, 0.45)) assert.ok(x.prob > 0 && x.prob < 1, `${x.mercato} ${x.selezione}`);
});

test('mercatiGol con λ 1.5/1.1: P(1) ≈ 0.46 ± 0.02, Over 2.5 ≈ 0.50 ± 0.03', () => {
  const m = mercatiGol(1.5, 1.1, 0.45);
  assert.ok(Math.abs(trova(m, '1X2', '1') - 0.46) <= 0.02, String(trova(m, '1X2', '1')));
  assert.ok(Math.abs(trova(m, 'Under/Over 2.5', 'Over 2.5') - 0.50) <= 0.03);
});

test('mercatiGol: primo tempo con λ·quotaPT e Poisson indipendente', () => {
  const m = mercatiGol(1.5, 1.1, 0.5);
  assert.ok(Math.abs(trova(m, 'Under/Over 1° tempo 0.5', 'Under 0.5') - Math.exp(-1.3)) < 1e-9);
});

test('mercatiGol: handicap asiatico con rimborso sulle linee intere', () => {
  const m = mercatiGol(1.5, 1.1, 0.45);
  const mat = matrice(1.5, 1.1);
  let vince = 0, pari = 0, perde = 0, diff1 = 0;
  for (let c = 0; c < mat.length; c++) for (let t = 0; t < mat.length; t++) {
    const d = c - t;
    if (d > 0) vince += mat[c][t]; else if (d === 0) pari += mat[c][t]; else perde += mat[c][t];
    if (d === 1) diff1 += mat[c][t];
  }
  // -0.5 = vittoria casa; +0.5 = 1X
  assert.ok(Math.abs(trova(m, 'Handicap asiatico -0.5', 'casa') - vince) < 1e-9);
  assert.ok(Math.abs(trova(m, 'Handicap asiatico +0.5', 'trasferta') - perde) < 1e-9);
  // -1: vince se casa vince di 2+, rimborso se vince di 1
  const att = (vince - diff1) / (1 - diff1);
  assert.ok(Math.abs(trova(m, 'Handicap asiatico -1', 'casa') - att) < 1e-9);
  assert.ok(Math.abs(trova(m, 'Handicap asiatico -1', 'casa') + trova(m, 'Handicap asiatico -1', 'trasferta') - 1) < 1e-9);
  // +1 casa: vince se pareggia o vince, rimborso se perde di 1
  assert.ok(trova(m, 'Handicap asiatico +1', 'casa') > vince + pari);
});

test('stimaForze su campionato sintetico: la squadra che segna di più ha attacco > 1, vantaggio casa > 1', () => {
  const { partite, squadre } = campionatoSintetico();
  const f = stimaForze(partite, { oggi: '2026-05-01', squadreUltimaStagione: squadre });
  assert.ok(f.attacco.get('Forte') > 1);
  for (const s of ['B', 'C', 'D', 'E', 'F']) assert.ok(f.attacco.get('Forte') > f.attacco.get(s));
  assert.ok(f.casa > 1);
  assert.ok(f.mediaGol > 0);
  assert.equal(f.partiteSquadra.get('Forte'), 10);
  const l = lambda(f, 'Forte', 'B');
  assert.ok(l.casa > l.trasferta);
});

test('peso temporale: una partita di 182 giorni fa conta la metà di una di oggi', () => {
  assert.equal(pesoTemporale('2026-10-19', '2026-10-19'), 1);
  assert.ok(Math.abs(pesoTemporale('2026-04-20', '2026-10-19') - 0.5) < 1e-12);
  // effetto sulle frequenze: Over oggi (peso 1) + Under 182 giorni fa (peso 0.5) → Over 2.5 = 2/3
  const freq = frequenzeGol([p('2026-10-19', 'A', 'B', 2, 1), p('2026-04-20', 'C', 'D', 1, 0)], { oggi: '2026-10-19' });
  assert.ok(Math.abs(freq.get('Under/Over 2.5|Over 2.5') - 2 / 3) < 1e-12);
});

test('frequenzeGol: chiavi mercato|selezione, primo tempo senza dati saltato, handicap con rimborso', () => {
  const partite = [
    p('2026-10-19', 'A', 'B', 2, 1, { gcPT: 1, gtPT: 0 }),
    p('2026-10-19', 'C', 'D', 0, 0, { gcPT: 0, gtPT: 0 }),
    p('2026-10-19', 'E', 'F', 3, 0), // senza primo tempo
  ];
  const f = frequenzeGol(partite, { oggi: '2026-10-19' });
  assert.ok(Math.abs(f.get('1X2|1') - 2 / 3) < 1e-12);
  assert.ok(Math.abs(f.get('Under/Over 1° tempo 0.5|Over 0.5') - 0.5) < 1e-12);
  // -1 casa: 2-1 è rimborso, 0-0 perde, 3-0 vince → 1/2
  assert.ok(Math.abs(f.get('Handicap asiatico -1|casa') - 0.5) < 1e-12);
  assert.ok(f.has('Risultato esatto|0-0'));
  for (const v of f.values()) assert.ok(v > 0 && v < 1);
});

test('neopromossa con 2 partite: λ tra 0.2 e 4 e attacco vicino a 0.85', () => {
  const { partite, squadre } = campionatoSintetico();
  const tutte = [...partite, p('2026-04-25', 'Neo', 'B', 1, 1), p('2026-04-28', 'C', 'Neo', 2, 1)];
  const f = stimaForze(tutte, { oggi: '2026-05-01', squadreUltimaStagione: squadre });
  assert.equal(f.partiteSquadra.get('Neo'), 2);
  assert.ok(Math.abs(f.attacco.get('Neo') - 0.85) < 0.15, String(f.attacco.get('Neo')));
  for (const [c, t] of [['Neo', 'Forte'], ['Forte', 'Neo'], ['Neo', 'B']]) {
    const l = lambda(f, c, t);
    for (const v of [l.casa, l.trasferta]) assert.ok(v > 0.2 && v < 4, `${c}-${t}: ${v}`);
  }
});

test('lambda con squadra sconosciuta restituisce null', () => {
  const { partite, squadre } = campionatoSintetico();
  const forze = stimaForze(partite, { oggi: '2026-05-01', squadreUltimaStagione: squadre });
  assert.equal(lambda(forze, 'Forte', 'Sconosciuta'), null);
  assert.equal(lambda(forze, 'Sconosciuta', 'Forte'), null);
});

test('stima su fixture I1.csv reale: tutte le squadre hanno attacco e difesa tra 0.4 e 2.5', async () => {
  const partite = await partiteI1();
  assert.equal(partite.length, 40);
  const squadre = new Set(partite.flatMap((x) => [x.casa, x.trasferta]));
  const f = stimaForze(partite, { oggi: '2026-10-19', squadreUltimaStagione: squadre });
  assert.equal(f.attacco.size, 20);
  for (const s of squadre) {
    assert.ok(f.attacco.get(s) > 0.4 && f.attacco.get(s) < 2.5, `${s} attacco ${f.attacco.get(s)}`);
    assert.ok(f.difesa.get(s) > 0.4 && f.difesa.get(s) < 2.5, `${s} difesa ${f.difesa.get(s)}`);
  }
  assert.ok(f.quotaPT > 0.25 && f.quotaPT < 0.6, String(f.quotaPT));
  const l = lambda(f, 'Inter', 'Lecce');
  assert.ok(l.casa > l.trasferta);
});
