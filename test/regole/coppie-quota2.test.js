import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bilancioCoppie, costruisciCoppie, costruisciCoppieQuota2, esitoCoppia } from '../../src/regole/coppie-quota2.js';
import { aggiornaMultipleBonus } from '../../src/registro/registro.js';
import { contaStorico, messaggi, messaggioStorico, testoCoppie } from '../../src/notifiche/telegram.js';
import { renderCoppia, testoBilancioCoppie } from '../../site/app.js';

function nodo(tag) {
  return {
    tag, attrs: {}, figli: [], className: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...n) { this.figli.push(...n); },
    replaceChildren(...n) { this.figli = n; },
    addEventListener() {},
  };
}
// getElementById: site/storico.js con `document` prova a caricare dati.json e scrive l'errore nella pagina.
globalThis.document = { createElement: nodo, createTextNode: (text) => ({ text }), getElementById: () => nodo('div') };
const testi = (n) => [n.text ?? '', ...(n.figli ?? []).flatMap((f) => (f && typeof f === 'object' ? [testi(f)] : [String(f ?? '')]))].join(' ');

const gamba = (id, quota, probMercato, ora = 15) => ({
  sport: 'calcio', competizione: 'Serie A', partita: `Casa${id} - Ospite${id}`, idPartita: id,
  inizio: `2026-10-30T${String(ora).padStart(2, '0')}:00:00+01:00`, mercato: '1X2', selezione: '1',
  quota, quotaBet365: null, probMercato, resa: quota * probMercato, esito: null,
});

test('coppie: quota totale fra 1,90 e 2,15, partite diverse, ogni partita una volta sola', () => {
  const gambe = [gamba('a', 1.4, 0.7), gamba('b', 1.4, 0.69), gamba('c', 1.45, 0.66), gamba('d', 1.3, 0.75), gamba('e', 1.25, 0.77)];
  const coppie = costruisciCoppie(gambe, { data: '2026-10-30' });
  for (const c of coppie) {
    assert.ok(c.quota >= 1.9 && c.quota <= 2.15, `quota ${c.quota}`);
    assert.notEqual(c.gambe[0].idPartita, c.gambe[1].idPartita);
    assert.equal(c.prova, true);
    assert.equal(c.criterio, 'margine');
    assert.ok(!('resa' in c.gambe[0]));
  }
  const usate = coppie.flatMap((c) => c.gambe.map((g) => g.idPartita));
  assert.equal(new Set(usate).size, usate.length);
  // 1,25 × 1,30 = 1,625: e non ha nessun compagno abbastanza alto con d, ma 1,25 × 1,45 = 1,81: fuori.
  assert.ok(!usate.includes('e'));
});

test('coppie: per margine prima la coppia pagata meglio, per probabilità la più probabile', () => {
  // Coppie possibili: x+y 2,10 (prob 0,462, resa 0,970), x+z 1,95 (0,488, 0,952), y+w 2,10 (0,452), z+w 1,95 (0,477).
  // Per margine: prima x+y, poi z+w. Per probabilità: prima x+z, poi y+w.
  const gambe = [
    gamba('x', 1.5, 0.66), gamba('y', 1.4, 0.70), // 2,10 × 0,462 = 0,970
    gamba('z', 1.3, 0.74), gamba('w', 1.5, 0.645), // 1,95 × 0,4773 = 0,931
  ];
  const { margine, probabilita } = costruisciCoppieQuota2(gambe, { data: '2026-10-30' });
  const ids = (c) => c.gambe.map((g) => g.idPartita).sort().join('+');
  assert.equal(ids(margine[0]), 'x+y');
  assert.equal(ids(margine[1]), 'w+z');
  assert.equal(ids(probabilita[0]), 'x+z');
  assert.equal(ids(probabilita[1]), 'w+y');
  assert.match(margine[0].id, /^Q2M1-2026-10-30$/);
  assert.match(probabilita[0].id, /^Q2P1-2026-10-30$/);
  assert.throws(() => costruisciCoppie(gambe, { criterio: 'boh' }));
});

test('esito della coppia: persa, aperta, rimborsata e vinta con la quota rimasta', () => {
  const c = (a, b) => ({ gambe: [{ quota: 1.4, esito: a }, { quota: 1.45, esito: b }] });
  assert.deepEqual(esitoCoppia(c('vinta', 'persa')), { esito: 'persa', ritorno: 0 });
  assert.deepEqual(esitoCoppia(c('vinta', null)), { esito: null, ritorno: null });
  assert.deepEqual(esitoCoppia(c('vinta', 'vinta')), { esito: 'vinta', ritorno: 2.03 });
  assert.deepEqual(esitoCoppia(c('rimborsata', 'vinta')), { esito: 'vinta', ritorno: 1.45 });
  assert.deepEqual(esitoCoppia(c('rimborsata', 'rimborsata')), { esito: 'rimborsata', ritorno: 1 });
});

test('registro: gli esiti chiudono le coppie anche senza multiple bonus', () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-q2-'));
  mkdirSync(join(d, 'giornate'));
  const coppie = costruisciCoppieQuota2([gamba('a', 1.4, 0.7), gamba('b', 1.42, 0.69)], { data: '2026-10-30' });
  writeFileSync(join(d, 'giornate', '2026-10-30.json'), JSON.stringify({ data: '2026-10-30', giocate: [], coppieQuota2: coppie }));
  const reg = { righe: [
    { idPartita: 'a', mercato: '1X2', selezione: '1', esito: 'vinta', esitoProvvisorio: false },
    { idPartita: 'b', mercato: '1X2', selezione: '1', esito: 'vinta', esitoProvvisorio: false },
  ] };
  assert.equal(aggiornaMultipleBonus(d, '2026-10-30', reg), true);
  const g = JSON.parse(readFileSync(join(d, 'giornate', '2026-10-30.json'), 'utf8'));
  assert.equal(g.coppieQuota2.margine[0].esito, 'vinta');
  assert.equal(g.coppieQuota2.margine[0].ritorno, 1.99);
  assert.equal(g.coppieQuota2.probabilita[0].esito, 'vinta');
  assert.equal(aggiornaMultipleBonus(d, '2026-10-30', reg), false);
});

test('bilancio delle coppie: 1 € a coppia per modo', () => {
  const giornate = [{ coppieQuota2: { margine: [{ esito: 'vinta', ritorno: 2.04 }, { esito: 'persa', ritorno: 0 }, { esito: null }], probabilita: [{ esito: 'rimborsata', ritorno: 1 }] } }, {}];
  assert.deepEqual(bilancioCoppie(giornate, 'margine'), { chiuse: 2, vinte: 1, perse: 1, rimborsate: 0, aperte: 1, profitto: 0.04 });
  assert.deepEqual(bilancioCoppie(giornate, 'probabilita'), { chiuse: 1, vinte: 0, perse: 0, rimborsate: 1, aperte: 0, profitto: 0 });
});

test('Telegram: coppie per margine confermate da modello e mercato nel mattino, confronto nello storico', () => {
  const conf = (g) => ({ ...g, probModello: g.probMercato });
  const coppie = costruisciCoppieQuota2([conf(gamba('a', 1.4, 0.7, 15)), conf(gamba('b', 1.42, 0.69, 18))], { data: '2026-10-30' });
  assert.equal(coppie.confermate.length, 1);
  assert.equal(coppie.probabilitaConfermate.length, 1);
  assert.match(testoCoppie({ coppieQuota2: coppie }), /Coppie a quota 2 per probabilità<\/b>/);
  assert.doesNotMatch(testoCoppie({ coppieQuota2: coppie }), /per margine/);
  // Senza il modello d'accordo con il mercato nessuna coppia mostrata, anche se quella per margine c'è.
  const soloMercato = costruisciCoppieQuota2([gamba('a', 1.4, 0.7, 15), gamba('b', 1.42, 0.69, 18)], { data: '2026-10-30' });
  assert.equal(testoCoppie({ coppieQuota2: soloMercato }), null);
  const giornata = { data: '2026-10-30', prova: true, giocate: [], pronostici: [], coppieQuota2: coppie };
  assert.match(testoCoppie(giornata), /Coppie a quota 2/);
  assert.match(testoCoppie(giornata), /quota <b>1,99<\/b>/);
  assert.match(testoCoppie(giornata), /15:00 Casaa - Ospitea/);
  assert.equal(testoCoppie({}), null);
  const m = messaggi({ giornata, oggi: '2026-10-30', adesso: new Date('2026-10-30T07:30:00Z'), inviate: new Set() });
  assert.match(m.find((x) => x.chiave === '2026-10-30|giornata').testo, /Coppie a quota 2/);

  const chiuse = { data: '2026-10-30', coppieQuota2: { margine: [{ id: 'm', esito: 'vinta', ritorno: 1.99 }], probabilita: [{ id: 'p', esito: 'persa', ritorno: 0 }], confermate: [{ id: 'c', esito: 'vinta', ritorno: 2.05 }] } };
  const r = contaStorico([chiuse], '2026-10-30');
  assert.equal(r.coppie.margine.tutte.vinte, 1);
  assert.equal(r.coppie.probabilita.ieri.perse, 1);
  const s = messaggioStorico({ giornate: [chiuse], inviate: new Set(), oggi: '2026-10-31', adesso: new Date('2026-10-31T08:30:00Z') });
  assert.match(s[0].testo, /per margine, confermate \(studio\): <b>1 su 1 vinte, \+1,05 €<\/b>/);
  assert.match(s[0].testo, /per probabilità, confermate \(quelle mostrate\): <b>nessuna chiusa<\/b>/);
  assert.match(s[0].testo, /per margine \(mostrate fino al 30\/10\): <b>1 su 1 vinte, \+0,99 €<\/b>/);
  assert.match(s[0].testo, /per probabilità \(confronto\): <b>0 su 1 vinte, −1,00 €<\/b>/);
});

test('sito: scheda della coppia e bilancio dei due modi', () => {
  const [c] = costruisciCoppie([gamba('a', 1.4, 0.7), gamba('b', 1.42, 0.69)], { data: '2026-10-30' });
  const t = testi(renderCoppia(c, 1));
  assert.match(t, /Coppia 1 .*quota\s+1,99/);
  assert.match(t, /Esito finale 1\s+1,40/);
  assert.match(t, /In attesa/);
  assert.match(t, /Casaa - Ospitea/);
  assert.equal(testoBilancioCoppie(null), null);
  assert.equal(testoBilancioCoppie({ margine: { chiuse: 0 }, probabilita: { chiuse: 0 } }), null);
  assert.match(testoBilancioCoppie({ margine: { chiuse: 2, vinte: 1, profitto: 0.04 }, probabilita: { chiuse: 0 } }), /Per margine \(queste\): 1 su 2 vinte/);
});

test('multiple bonus con le partite più probabili: da 5 e da 10, prime per probabilità di Pinnacle', async () => {
  const { multiplePerProbabilita } = await import('../../src/regole/multipla-bonus.js');
  // Probabilità in ordine inverso alla resa: per margine verrebbero prima le meno probabili.
  const gambe = Array.from({ length: 12 }, (_, i) => gamba(`g${i}`, 1.3 + i * 0.02, 0.76 - i * 0.01));
  const [da5, da10] = multiplePerProbabilita(gambe, '2026-10-30');
  assert.equal(da5.id, 'MBP5-2026-10-30');
  assert.equal(da5.criterio, 'probabilita');
  assert.match(da5.nome, /da 5 \(le più probabili\)/);
  assert.deepEqual(da5.gambe.map((g) => g.idPartita).sort(), ['g0', 'g1', 'g2', 'g3', 'g4']);
  assert.equal(da5.incremento, 0.1);
  assert.equal(da10.gambe.length, 10);
  assert.equal(da10.incremento, 0.35);
  assert.deepEqual(multiplePerProbabilita(gambe.slice(0, 7), 'x').map((m) => m.id), ['MBP5-x']);
});

test('Telegram storico: multiple per probabilità per lunghezza', () => {
  const g = { data: '2026-10-30', multipleBonus: [
    { id: 'MBP5-a', criterio: 'probabilita', gambe: Array(5).fill({}), esito: 'vinta', ritorno: 4.4 },
    { id: 'MBP10-a', criterio: 'probabilita', gambe: Array(10).fill({}), esito: 'persa', ritorno: 0 },
    { id: 'MB10-a', gambe: Array(10).fill({}), esito: 'persa', ritorno: 0 },
    { id: 'MBPC5-a', criterio: 'probabilitaConfermate', gambe: Array(5).fill({}), esito: 'persa', ritorno: 0 },
  ] };
  const r = contaStorico([g], '2026-10-30');
  assert.deepEqual(r.multipleProb[5], { chiuse: 1, vinte: 1, profitto: 3.4000000000000004 });
  assert.equal(r.multipleProb[10].chiuse, 1);
  const s = messaggioStorico({ giornate: [g], inviate: new Set(), oggi: '2026-10-31', adesso: new Date('2026-10-31T08:30:00Z') });
  assert.match(s[0].testo, /da 5: confermate \(mostrate dal 31\/10\) <b>0 su 1 vinte, −1,00 €<\/b> · tutte <b>1 su 1 vinte, \+3,40 €<\/b>/);
  assert.match(s[0].testo, /da 10: confermate \(mostrate dal 31\/10\) <b>nessuna chiusa<\/b> · tutte <b>0 su 1 vinte, −1,00 €<\/b>/);
});

test('solo l\'essenziale: mattino con coppie e multiple per probabilità, il resto taciuto', async () => {
  const { soloEssenziale, testoMattinoEssenziale } = await import('../../src/notifiche/telegram.js');
  const coppie = costruisciCoppieQuota2([{ ...gamba('a', 1.4, 0.7), probModello: 0.7 }, { ...gamba('b', 1.42, 0.69), probModello: 0.7 }], { data: '2026-10-30' });
  const mbp = { id: 'MBPC5-2026-10-30', nome: 'Multipla bonus bet365 da 5 (le più probabili, confermate da modello e mercato)', criterio: 'probabilitaConfermate', quota: 4.5, incremento: 0.1, quotaConBonus: 4.95, gambe: [gamba('c', 1.3, 0.75)] };
  const mbpTutte = { id: 'MBP5-2026-10-30', nome: 'Multipla bonus bet365 da 5 (le più probabili)', criterio: 'probabilita', quota: 4.4, incremento: 0.1, quotaConBonus: 4.84, gambe: [gamba('e', 1.3, 0.75)] };
  const mbm = { id: 'MB10-2026-10-30', nome: 'Multipla bonus bet365 da 10', quota: 25, incremento: 0.35, quotaConBonus: 33.75, gambe: [gamba('d', 1.4, 0.7)] };
  const giornata = { data: '2026-10-30', prova: true, giocate: [], pronostici: [], coppieQuota2: coppie, multipleBonus: [mbm, mbpTutte, mbp] };
  const mattino = testoMattinoEssenziale(giornata, '2026-10-30');
  assert.match(mattino, /Coppie a quota 2/);
  assert.match(mattino, /da 5 \(le più probabili, confermate da modello e mercato\)/);
  assert.doesNotMatch(mattino, /da 5 \(le più probabili\)</);
  assert.doesNotMatch(mattino, /Multipla bonus bet365 da 10</);
  assert.match(testoMattinoEssenziale({}, '2026-10-30'), /nessuna coppia/);

  const lista = [
    { chiave: '2026-10-30|giornata', testo: 'pronostici…' },
    { chiave: '2026-10-30|pronostici|x', testo: 'nuovi pronostici' },
    { chiave: '2026-10-30|schedine-pronostici', testo: 'doppie' },
    { chiave: '2026-10-29|bonus|MB10-2026-10-29|persa', testo: 'margine' },
    { chiave: '2026-10-29|bonus|MBP5-2026-10-29|vinta', testo: 'probabilità' },
    { chiave: '2026-10-29|bonus|MBPC5-2026-10-29|vinta', testo: 'probabilità confermate' },
    { chiave: '2026-10-29|pronostici-esito', testo: 'esiti pronostici' },
    { chiave: '2026-10-29|schedina-esito|s|vinta', testo: 'esito doppia' },
    { chiave: '2026-10-30|storico', testo: 'storico' },
    { chiave: '2026-10-29|esito|g1|vinta', testo: 'giocata fatta' },
    { chiave: '2026-10-29|provvisorio|g1|0', testo: 'provvisorio' },
    { chiave: '2026-10-30|stato|g2|annullata|', testo: 'stato' },
  ];
  const { manda, tacere } = soloEssenziale(lista, { giornata, oggi: '2026-10-30', sito: 'https://sito' });
  assert.deepEqual(manda.map((m) => m.chiave), ['2026-10-30|giornata', '2026-10-29|bonus|MBPC5-2026-10-29|vinta', '2026-10-30|storico', '2026-10-29|esito|g1|vinta', '2026-10-29|provvisorio|g1|0']);
  assert.match(manda[0].testo, /Coppie a quota 2[\s\S]*https:\/\/sito$/);
  assert.equal(tacere.length, 7);

  // Storico essenziale: niente pronostici né multipla lunga.
  const g = { data: '2026-10-29', pronostici: [{ pronostici: [{ prob: 0.85, esito: 'vinta' }] }], coppieQuota2: { margine: [{ esito: 'vinta', ritorno: 2 }], probabilita: [] } };
  const s = messaggioStorico({ giornate: [g], inviate: new Set(), oggi: '2026-10-30', adesso: new Date('2026-10-30T08:30:00Z'), essenziale: true });
  assert.doesNotMatch(s[0].testo, /Pronostici dall/);
  assert.match(s[0].testo, /Coppie a quota 2/);
});

test('senza Under 2.5 e 3.5: la partita resta con la sua selezione migliore fra le altre', async () => {
  const { gambePossibili, costruisciMultipleBonus } = await import('../../src/regole/multipla-bonus.js');
  const p = (i) => ({ idPartita: `p${i}`, sport: 'calcio', competizione: 'Serie A', partita: `C${i} - O${i}`, inizio: '2026-10-30T15:00:00+01:00' });
  const voci = [
    { partita: p(1), m: { mercato: 'Under/Over 3.5', selezione: 'Under 3.5', quota: 1.35, probPinnacle: 0.73 } },
    { partita: p(1), m: { mercato: 'Doppia chance', selezione: '1X', quota: 1.3, probPinnacle: 0.74 } },
    { partita: p(2), m: { mercato: 'Under/Over 2.5', selezione: 'Under 2.5', quota: 1.4, probPinnacle: 0.7 } },
    { partita: p(3), m: { mercato: 'Under/Over 2.5', selezione: 'Over 2.5', quota: 1.4, probPinnacle: 0.7 } },
  ];
  assert.deepEqual(gambePossibili(voci).map((g) => g.selezione).sort(), ['Over 2.5', 'Under 2.5', 'Under 3.5']);
  const senza = gambePossibili(voci, { senzaUnder: true });
  assert.deepEqual(senza.map((g) => `${g.idPartita} ${g.selezione}`).sort(), ['p1 1X', 'p3 Over 2.5']);
  // Multiple per margine con gli Under, per probabilità senza.
  const molte = Array.from({ length: 6 }, (_, i) => ({ ...gamba(`u${i}`, 1.3, 0.75), mercato: 'Under/Over 3.5', selezione: 'Under 3.5' }));
  const pulite = Array.from({ length: 5 }, (_, i) => gamba(`o${i}`, 1.3, 0.74));
  const mb = costruisciMultipleBonus(null, { data: 'x', gambe: [...molte, ...pulite], gambeProbabilita: pulite });
  assert.ok(mb.find((m) => m.id === 'MB11-x' || m.lunga).gambe.some((g) => g.selezione === 'Under 3.5'));
  assert.ok(mb.find((m) => m.id === 'MBP5-x').gambe.every((g) => !/^Under/.test(g.selezione)));
});

test('storico per mercato: una volta per partita e mercato, quota media, vinte e guadagno a 1 €', async () => {
  const { storicoMercati, chiaveMercato } = await import('../../src/regole/mercati-partite.js');
  const g = (id, mercato, selezione, quota, esito, extra = {}) => ({ idPartita: id, sport: 'calcio', partita: `${id}c - ${id}t`, mercato, selezione, quota, probMercato: 0.7, esito, ...extra });
  const a = g('a', 'Doppia chance', '12', 1.3, 'vinta');
  const giornate = [{
    multipleBonus: [{ gambe: [a, g('b', 'Doppia chance', '12', 1.5, 'persa')] }, { gambe: [a] }],
    coppieQuota2: { margine: [{ gambe: [{ ...a }, g('c', 'Vincente', 'cc', 1.4, 'vinta', { sport: 'nba' })] }], probabilita: [] },
  }, { multipleBonus: [{ gambe: [g('d', 'Doppia chance', '12', 1.4, null), g('e', 'Doppia chance', '12', 1.4, 'rimborsata')] }] }];
  const r = storicoMercati(giornate);
  const dc = r.find((x) => x.mercato === 'Calcio: Doppia chance → 12');
  assert.deepEqual({ ...dc }, { mercato: 'Calcio: Doppia chance → 12', partite: 2, vinte: 1, perse: 1, rimborsate: 1, aperte: 1, profitto: -0.7, percentuale: 0.5, quotaMedia: 1.4, probMercato: 0.7, rendimento: -0.35 });
  assert.equal(r[0].mercato, dc.mercato);
  assert.equal(chiaveMercato({ sport: 'nba', mercato: 'Vincente', selezione: 'cc', partita: 'cc - tt' }), 'NBA: Vincente → casa');
  assert.equal(chiaveMercato({ sport: 'basket', mercato: 'Vincente', selezione: 'tt', partita: 'cc - tt' }), 'Basket: Vincente → trasferta');
  assert.ok(r.some((x) => x.mercato === 'NBA: Vincente → casa' && x.vinte === 1));
});

test('sito storico: tabella dei mercati', async () => {
  const { renderMercati } = await import('../../site/storico.js');
  const t = testi({ figli: renderMercati([{ mercato: 'Calcio: Doppia chance → 12', partite: 2, vinte: 1, percentuale: 0.5, probMercato: 0.7, quotaMedia: 1.4, profitto: -0.7 }, { mercato: 'X', partite: 0 }]) });
  assert.match(t, /Mercati di multiple e coppie/);
  assert.match(t, /Calcio: Doppia chance → 12/);
  assert.match(t, /1,40/);
  assert.doesNotMatch(t, / X /);
  assert.match(testi({ figli: renderMercati(null) }), /Nessuna partita chiusa/);
});

test('sito: giocata scritta come sul bookmaker e data lunga', async () => {
  const { testoScelta, dataLunga } = await import('../../site/app.js');
  assert.equal(testoScelta({ mercato: 'Under/Over 2.5', selezione: 'Over 2.5' }), 'Over 2.5');
  assert.equal(testoScelta({ mercato: 'Vincente', selezione: 'Real Madrid' }), 'Vince Real Madrid');
  assert.equal(testoScelta({ mercato: 'Doppia chance', selezione: 'X2' }), 'Doppia chance X2');
  assert.equal(testoScelta({ mercato: '1X2', selezione: '1' }), 'Esito finale 1');
  assert.equal(testoScelta({ mercato: 'Handicap set -1.5', selezione: 'casa' }), 'Handicap set -1.5 casa');
  assert.equal(dataLunga('2026-10-29'), 'giovedì 29 ottobre');
  assert.equal(dataLunga('boh'), 'boh');
});

test('coppie nascoste: solo il nostro modello e confermate da modello e mercato', () => {
  const conM = (id, quota, probMercato, probModello) => ({ ...gamba(id, quota, probMercato), probModello });
  const gambe = [
    conM('a', 1.4, 0.70, 0.71), // d'accordo
    conM('b', 1.42, 0.69, 0.68), // d'accordo
    conM('c', 1.4, 0.70, 0.80), // modello molto sopra
    conM('d', 1.42, 0.69, 0.79), // modello molto sopra
    gamba('e', 1.4, 0.70), // senza modello (pallavolo)
  ];
  const c = costruisciCoppieQuota2(gambe, { data: '2026-10-30' });
  const ids = (l) => l.map((x) => x.gambe.map((g) => g.idPartita).sort().join('+'));
  assert.deepEqual(ids(c.confermate), ['a+b']);
  assert.equal(c.confermate[0].id, 'Q2C1-2026-10-30');
  // Modello: prima le due che il modello dà più probabili; "e" senza modello resta fuori.
  assert.deepEqual(ids(c.modello), ['c+d', 'a+b']);
  assert.equal(c.modello[0].id, 'Q2O1-2026-10-30');
  assert.equal(Math.round(c.modello[0].probModello * 1000), Math.round(0.8 * 0.79 * 1000));
  assert.ok(!c.modello.flat().some((x) => x.gambe.some((g) => g.idPartita === 'e')));
  assert.ok(c.margine.some((x) => x.gambe.some((g) => g.idPartita === 'e')));
});

test('modello contro mercato: errore medio e partite divise per scarto', async () => {
  const { confrontoModello } = await import('../../src/regole/mercati-partite.js');
  const g = (id, probModello, probMercato, esito) => ({ idPartita: id, sport: 'calcio', partita: 'x - y', mercato: '1X2', selezione: '1', quota: 1.5, probMercato, probModello, esito });
  const giornate = [{ multipleBonus: [{ gambe: [g('a', 0.8, 0.7, 'vinta'), g('b', 0.7, 0.7, 'persa'), g('c', 0.6, 0.7, 'vinta'), g('d', null, 0.7, 'vinta'), g('e', 0.7, 0.7, null)] }] }];
  const r = confrontoModello(giornate);
  assert.equal(r.partite, 3);
  assert.equal(r.vinte, 2);
  assert.equal(r.erroreModello, Math.round(((0.2 ** 2 + 0.7 ** 2 + 0.4 ** 2) / 3) * 10000) / 10000);
  assert.equal(r.erroreMercato, Math.round(((0.3 ** 2 + 0.7 ** 2 + 0.3 ** 2) / 3) * 10000) / 10000);
  assert.deepEqual(r.gruppi.map((x) => [x.gruppo, x.partite, x.vinte, x.profitto]), [['sopra', 1, 1, 0.5], ['accordo', 1, 0, -1], ['sotto', 1, 1, 0.5]]);
});

test('sito storico: i quattro modi delle coppie e il confronto col modello', async () => {
  const { renderConfronto } = await import('../../site/storico.js');
  const t = testi({ figli: renderConfronto(
    { margine: { chiuse: 2, vinte: 1, profitto: -0.1 }, modello: { chiuse: 0 } },
    { partite: 3, erroreModello: 0.23, erroreMercato: 0.2, gruppi: [{ nome: 'modello sopra', partite: 1, percentuale: 1, probMercato: 0.7, profitto: 0.5 }] },
  ).filter(Boolean) });
  assert.match(t, /Solo il nostro modello/);
  assert.match(t, /Confermate da modello e mercato/);
  assert.match(t, /errore medio del modello 0,230, del mercato 0,200/);
  assert.match(testi({ figli: renderConfronto(null, null).filter(Boolean) }), /Ancora nessuna partita chiusa/);
});

test('coppie solo dalle migliori 20 partite per margine; "tutte" con tutte le partite', () => {
  // 24 partite: le prime 20 per margine (quota × probabilità) hanno probMercato 0,70, le ultime 4 0,60.
  const gambe = Array.from({ length: 24 }, (_, i) => gamba(`p${i}`, 1.4 + (i % 2) * 0.02, i < 20 ? 0.7 : 0.6));
  const c = costruisciCoppieQuota2(gambe, { data: 'x' });
  const usate = (l) => l.flatMap((k) => k.gambe.map((g) => g.idPartita));
  assert.ok(usate(c.margine).every((id) => Number(id.slice(1)) < 20));
  assert.ok(usate(c.tutte).some((id) => Number(id.slice(1)) >= 20));
  assert.match(c.tutte[0].id, /^Q2T1-x$/);
  assert.equal(c.tutte[0].criterio, 'tutte');
});

test('modello contro mercato: solo le migliori 20 partite del giorno (senza Under) o tutte', async () => {
  const { confrontoModello } = await import('../../src/regole/mercati-partite.js');
  const g = (i, extra = {}) => ({ idPartita: `p${i}`, sport: 'calcio', competizione: 'Serie A', partita: `p${i} - x`, mercato: '1X2', selezione: '1', quota: 1.4, probMercato: i < 20 ? 0.72 : 0.6, probModello: 0.7, esito: 'vinta', ...extra });
  const gambe = [...Array.from({ length: 24 }, (_, i) => g(i)), g(30, { mercato: 'Under/Over 2.5', selezione: 'Under 2.5', probMercato: 0.9 })];
  const giornate = [{ multipleBonus: [{ gambe }] }];
  assert.equal(confrontoModello(giornate).partite, 25);
  assert.equal(confrontoModello(giornate, { soloMigliori: true }).partite, 20);
});

test('multiple per probabilità confermate: solo partite su cui modello e mercato sono d\'accordo', async () => {
  const { costruisciMultipleBonus } = await import('../../src/regole/multipla-bonus.js');
  const gg = Array.from({ length: 12 }, (_, i) => ({ ...gamba(`g${i}`, 1.3, 0.75 - i * 0.002), probModello: i % 2 ? 0.6 : 0.75 - i * 0.002 }));
  const mb = costruisciMultipleBonus(null, { data: 'x', gambe: gg, gambeProbabilita: gg });
  const conf = mb.filter((m) => m.criterio === 'probabilitaConfermate');
  // 6 partite confermate: la da 5 e, al posto della da 10, una con tutte e 6.
  assert.deepEqual(conf.map((m) => [m.id, m.gambe.length]), [['MBPC5-x', 5], ['MBPC6-x', 6]]);
  assert.ok(conf[0].gambe.every((g) => Math.abs(g.probModello - g.probMercato) < 0.05));
  // Le altre restano uguali (per probabilità senza conferma, per margine).
  assert.deepEqual(mb.filter((m) => m.criterio === 'probabilita').map((m) => m.id), ['MBP5-x', 'MBP10-x']);
  assert.ok(mb.some((m) => m.id === 'MB10-x'));
});

test('multiple confermate con poche partite: il massimo che c\'è, senza doppioni', async () => {
  const { lunghezzeConfermate, costruisciMultipleBonus } = await import('../../src/regole/multipla-bonus.js');
  assert.deepEqual(lunghezzeConfermate(12), [5, 10]);
  assert.deepEqual(lunghezzeConfermate(10), [5, 10]);
  assert.deepEqual(lunghezzeConfermate(7), [5, 7]);
  assert.deepEqual(lunghezzeConfermate(5), [5]);
  assert.deepEqual(lunghezzeConfermate(3), [3]);
  assert.deepEqual(lunghezzeConfermate(1), []);
  const gg = Array.from({ length: 3 }, (_, i) => ({ ...gamba(`g${i}`, 1.3, 0.75), probModello: 0.75 }));
  const mb = costruisciMultipleBonus(null, { data: 'x', gambe: gg, gambeProbabilita: gg });
  assert.deepEqual(mb.filter((m) => m.criterio === 'probabilitaConfermate').map((m) => m.id), ['MBPC3-x']);
  // Quelle non mostrate restano come prima: con 3 partite niente.
  assert.deepEqual(mb.filter((m) => m.criterio === 'probabilita'), []);
});

test('Telegram: bilancio di ieri solo di quello mandato (coppie e multiple per probabilità confermate)', async () => {
  const { messaggioIeri, soloEssenziale } = await import('../../src/notifiche/telegram.js');
  const gg = (e) => ({ ...gamba('x', 1.3, 0.75), esito: e });
  const g = { data: '2026-10-31', coppieQuota2: {
    probabilitaConfermate: [
      { id: 'a', gambe: [gg('vinta'), gg('vinta')], esito: 'vinta', ritorno: 2 },
      { id: 'b', gambe: [gg('vinta'), gg('persa')], esito: 'persa', ritorno: 0 },
    ],
    margine: [{ id: 'm', gambe: [gg('vinta')], esito: 'vinta', ritorno: 2 }],
  }, multipleBonus: [
    { id: 'MBPC5-2026-10-31', criterio: 'probabilitaConfermate', gambe: [gg('vinta'), gg('vinta'), gg('vinta'), gg('vinta'), gg('persa')], esito: 'persa', ritorno: 0 },
    { id: 'MBP5-2026-10-31', criterio: 'probabilita', gambe: [gg('vinta')], esito: 'vinta', ritorno: 4 },
  ] };
  assert.deepEqual(messaggioIeri({ giornate: [g], inviate: new Set(), oggi: '2026-11-01', adesso: new Date('2026-11-01T07:30:00Z') }), []);
  const m = messaggioIeri({ giornate: [g], inviate: new Set(), oggi: '2026-11-01', adesso: new Date('2026-11-01T08:30:00Z') });
  assert.equal(m.length, 1);
  assert.match(m[0].testo, /Ieri, 31\/10/);
  assert.match(m[0].testo, /Coppie: <b>1 vinte su 2<\/b> · con 1 € a coppia 0,00 €/);
  assert.match(m[0].testo, /Multipla da 5: <b>4 partite giuste su 5<\/b> · persa/);
  assert.doesNotMatch(m[0].testo, /MBP5/);
  assert.equal(m[0].testo.match(/Multipla da/g).length, 1);
  assert.deepEqual(messaggioIeri({ giornate: [g], inviate: new Set([m[0].chiave]), oggi: '2026-11-01', adesso: new Date('2026-11-01T08:30:00Z') }), []);
  // Prima del 31/10 si mandavano le coppie per margine e le multiple per probabilità: il bilancio usa quelle.
  const vecchio = { ...g, data: '2026-10-29' };
  const v = messaggioIeri({ giornate: [vecchio], inviate: new Set(), oggi: '2026-10-30', adesso: new Date('2026-10-30T08:30:00Z') });
  assert.match(v[0].testo, /Coppie: <b>1 vinte su 1<\/b>/);
  assert.match(v[0].testo, /Multipla da 1: <b>1 partite giuste su 1<\/b> · VINTA/);
  // Partite ancora senza esito: si manda lo stesso e lo dice; poi l'aggiornamento quando sono chiuse (o alle 20).
  const aperto = { ...g, coppieQuota2: { probabilitaConfermate: [{ id: 'c', gambe: [gg(null), gg('vinta')], esito: null }] }, multipleBonus: [] };
  const primo = messaggioIeri({ giornate: [aperto], inviate: new Set(), oggi: '2026-11-01', adesso: new Date('2026-11-01T08:30:00Z') });
  assert.match(primo[0].testo, /\(1 senza esito\)/);
  assert.deepEqual(primo[0].segna, ['2026-11-01|ieri|aperte']);
  const dopo = new Set([primo[0].chiave, ...primo[0].segna]);
  assert.deepEqual(messaggioIeri({ giornate: [aperto], inviate: dopo, oggi: '2026-11-01', adesso: new Date('2026-11-01T13:00:00Z') }), []);
  const chiuso = { ...aperto, coppieQuota2: { probabilitaConfermate: [{ id: 'c', gambe: [gg('vinta'), gg('vinta')], esito: 'vinta', ritorno: 1.69 }] } };
  const agg = messaggioIeri({ giornate: [chiuso], inviate: dopo, oggi: '2026-11-01', adesso: new Date('2026-11-01T13:00:00Z') });
  assert.equal(agg[0].chiave, '2026-11-01|ieri|completo');
  assert.match(agg[0].testo, /aggiornamento<\/b>, tutte chiuse[\s\S]*Coppie: <b>1 vinte su 1<\/b>/);
  assert.deepEqual(messaggioIeri({ giornate: [chiuso], inviate: new Set([...dopo, agg[0].chiave]), oggi: '2026-11-01', adesso: new Date('2026-11-01T14:00:00Z') }), []);
  const tardi = messaggioIeri({ giornate: [aperto], inviate: dopo, oggi: '2026-11-01', adesso: new Date('2026-11-01T19:30:00Z') });
  assert.match(tardi[0].testo, /ultimo controllo di oggi[\s\S]*\(1 senza esito\)/);
  // Tutto chiuso già al mattino: nessun aggiornamento.
  const subito = messaggioIeri({ giornate: [chiuso], inviate: new Set(), oggi: '2026-11-01', adesso: new Date('2026-11-01T08:30:00Z') });
  assert.equal(subito[0].segna, undefined);
  assert.deepEqual(messaggioIeri({ giornate: [chiuso], inviate: new Set([subito[0].chiave]), oggi: '2026-11-01', adesso: new Date('2026-11-01T19:30:00Z') }), []);
  // Passa anche il filtro "solo l'essenziale".
  assert.equal(soloEssenziale(m, { giornata: {}, oggi: '2026-11-01' }).manda.length, 1);
});

test('coppie per probabilità confermate: da tutte le partite confermate, non solo le migliori 20 per margine', () => {
  // 22 partite: le ultime due (peggiori per margine, fuori dalle migliori 20) sono le più probabili.
  const gg = Array.from({ length: 22 }, (_, i) => {
    const prob = i >= 20 ? 0.7 : 0.68;
    const quota = i >= 20 ? 1.38 : 1.45 + i * 0.001;
    return { ...gamba(`g${i}`, quota, prob), probModello: prob };
  });
  const c = costruisciCoppieQuota2(gg, { data: 'x' });
  const ids = (l) => l.flatMap((x) => x.gambe.map((y) => y.idPartita));
  assert.ok(ids(c.probabilitaConfermate).includes('g20'));
  assert.ok(!ids(c.confermate).includes('g20'));
});
