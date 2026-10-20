import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eseguiRaccoltaNba, stagioneNba, raccoltaDiErrore, ERRORE_CHIAVI, spiegazioneMercato } from '../../src/nba/raccolta.js';

const adesso = new Date('2026-10-20T05:07:00Z'); // 07:07 a Roma
const chiavi = { balldontlie: 'B', sportsgameodds: 'S' };
const SQ = ['Boston Celtics', 'New York Knicks', 'Miami Heat', 'Chicago Bulls'];

function storico() {
  const out = [];
  let k = 0;
  for (const s of [2025, 2026]) {
    SQ.forEach((a, i) => SQ.forEach((b, j) => {
      if (a === b) return;
      k++;
      const giorno = s === 2026 ? 1 + (k % 15) : 1 + (k % 27);
      out.push({
        id: k, dataUsa: s === 2026 ? `2026-10-${String(giorno).padStart(2, '0')}` : `2026-03-${String(giorno).padStart(2, '0')}`,
        inizio: null, casa: a, trasferta: b, puntiCasa: 105 + ((i + k) % 12), puntiTrasferta: 100 + ((j + 2 * k) % 12),
        finita: true, stagione: s, postseason: false,
      });
    }));
  }
  return out;
}

const bk = (chiave, hq = 1.91) => ({
  chiave,
  mercati: {
    vincente: { casa: 1.55, trasferta: 2.5 },
    handicap: { '-4.5': { casa: hq, trasferta: 1.91 } },
    totale: { '221.5': { over: 1.9, under: 1.92 } },
  },
});
const evento = (extra = {}) => ({
  id: 'e1', casa: 'Boston Celtics', trasferta: 'New York Knicks', inizio: '2026-10-21T01:30:00+02:00',
  bookmaker: [bk('a'), bk('b', 1.93), bk('c', 1.95)], ...extra,
});
const conMeta = (arr, meta = {}) => {
  Object.defineProperty(arr, 'nonRiconosciute', { value: meta.nonRiconosciute ?? [], enumerable: false });
  Object.defineProperty(arr, 'diagnostica', {
    value: meta.diagnostica ?? { lineaMancante: { handicap: 0, totale: 0 }, quoteNonConvertibili: 0, handicapAsimmetrico: 0 },
    enumerable: false,
  });
  return arr;
};
const fonti = (eventi, extra = {}) => ({
  sportsgameodds: { eventi: async () => conMeta(eventi, extra) },
  balldontlie: { partite: async (f) => conMeta(storico().filter((p) => p.stagione === f.stagioni[0])) },
});

test('stagione corrente: da ottobre anno, prima anno - 1', () => {
  assert.equal(stagioneNba('2026-10-20'), 2026);
  assert.equal(stagioneNba('2027-03-01'), 2026);
});

test('partita alle 01:30 di Roma del 21/10 entra nella giornata del 20/10 con idPartita nba-2026-10-20-…', async () => {
  const fuori = evento({ id: 'e2', casa: 'Miami Heat', trasferta: 'Chicago Bulls', inizio: '2026-10-21T10:00:00+02:00' });
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento(), fuori]), chiavi });
  assert.equal(r.partite.length, 1);
  const p = r.partite[0];
  assert.equal(p.idPartita, 'nba-2026-10-20-boston-celtics-new-york-knicks');
  assert.equal(p.inizio, '2026-10-21T01:30:00+02:00');
  assert.equal(p.sport, 'nba');
  assert.equal(p.competizione, 'NBA');
  assert.equal(p.modello, 'nba');
  assert.equal(p.lambda, null);
  assert.deepEqual(r.crediti, { sportsgameodds: { oggetti: 2 } });
  assert.ok(p.ragionamentoBase[0].startsWith('Punti attesi: Boston Celtics '));
  assert.ok(p.ragionamentoBase[0].endsWith('(stagione in corso e precedente)'));
  assert.ok([0.25, 0.5].includes(p.pesoModello));
  assert.deepEqual(Object.keys(p.backToBack), ['casa', 'trasferta']);
});

test('mercati con linea comune, quota mediana, consenso e spiegazione', async () => {
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento()]), chiavi });
  const m = r.partite[0].mercati;
  assert.deepEqual(m.map((x) => `${x.mercato}|${x.selezione}`), [
    'Vincente|Boston Celtics', 'Vincente|New York Knicks',
    'Handicap -4.5|casa', 'Handicap -4.5|trasferta',
    'Totale punti 221.5|Over 221.5', 'Totale punti 221.5|Under 221.5',
  ]);
  const h = m[2];
  assert.equal(h.quota, 1.93);
  assert.equal(h.fonteQuota, 'mediana di 3 bookmaker (SportsGameOdds)');
  assert.equal(h.oraQuota, '2026-10-20T07:07:00+02:00');
  assert.equal(h.etichettaMercato, 'Consenso bookmaker');
  assert.equal(h.frequenzaCampionato, null);
  assert.ok(h.probPinnacle > 0.4 && h.probPinnacle < 0.6);
  assert.ok(h.probModello > 0 && h.probModello < 1);
  assert.equal(h.spiegazione, 'Handicap: vince se i Boston Celtics vincono con almeno 5 punti di scarto, supplementari compresi. '
    + 'Gioca solo su Boston Celtics -4.5 (stessa linea) e quota almeno la minima: con una linea diversa il calcolo non vale.');
  assert.equal(m[3].spiegazione, 'Handicap: vince se i New York Knicks perdono con meno di 5 punti di scarto o vincono, supplementari compresi. '
    + 'Gioca solo su New York Knicks +4.5 (stessa linea) e quota almeno la minima: con una linea diversa il calcolo non vale.');
  assert.match(m[4].spiegazione, /Over vince se le due squadre segnano almeno 222 punti in tutto, supplementari compresi/);
  assert.match(m[0].spiegazione, /^Vincente: vince se Boston Celtics vince la partita, supplementari compresi/);
  assert.equal(m[0].quota, 1.55);
  assert.ok(Math.abs(m[0].probPinnacle + m[1].probPinnacle - 1) < 1e-9);
});

test('meno di 3 bookmaker: nessun mercato, partita esclusa con avviso', async () => {
  const ev = evento({ bookmaker: [bk('a'), bk('b')] });
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([ev]), chiavi });
  assert.equal(r.partite.length, 0);
  assert.ok(r.erroriGiro.some((e) => /nessuna quota utilizzabile/.test(e)));
});

test('diagnostica delle fonti e squadre non riconosciute finiscono in erroriGiro', async () => {
  const meta = {
    nonRiconosciute: ['Seattle Foo'],
    diagnostica: { lineaMancante: { handicap: 3, totale: 0 }, quoteNonConvertibili: 1, handicapAsimmetrico: 0 },
  };
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento()], meta), chiavi });
  assert.ok(r.erroriGiro.includes('SportsGameOdds alle 07:07: 3 handicap senza linea, 1 quota non convertibile'));
  assert.ok(r.erroriGiro.includes('Squadre NBA non riconosciute: Seattle Foo'));
});

test('nessun handicap in nessun bookmaker: avviso esplicito', async () => {
  const senza = (c) => { const b = bk(c); delete b.mercati.handicap; return b; };
  const ev = evento({ bookmaker: [senza('a'), senza('b'), senza('c')] });
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([ev]), chiavi });
  assert.ok(r.erroriGiro.includes('SportsGameOdds alle 07:07: nessun handicap disponibile (controllare il campo spread)'));
  assert.equal(r.partite[0].mercati.length, 4);
});

test('back-to-back dal giorno di New York: chi ha giocato il 19/10 è stanca', async () => {
  const f = fonti([evento()]);
  const base = f.balldontlie.partite;
  f.balldontlie.partite = async (x) => {
    const p = await base(x);
    if (x.stagioni[0] === 2026) p.push({ id: 999, dataUsa: '2026-10-19', inizio: null, casa: 'Boston Celtics', trasferta: 'Miami Heat', puntiCasa: null, puntiTrasferta: null, finita: false, stagione: 2026, postseason: false });
    return p;
  };
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: f, chiavi });
  assert.deepEqual(r.partite[0].backToBack, { casa: true, trasferta: false });
  assert.ok(r.partite[0].ragionamentoBase.includes('Boston Celtics alla seconda partita in due sere'));
});

test('SportsGameOdds giù: partite [], errore in erroriGiro, nessun crash', async () => {
  const f = fonti([]);
  f.sportsgameodds.eventi = async () => { throw new Error('HTTP 500'); };
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: f, chiavi });
  assert.deepEqual(r.partite, []);
  assert.deepEqual(r.erroriGiro, ['SportsGameOdds alle 07:07: HTTP 500']);
});

test('balldontlie giù: partite [] e un errore per stagione', async () => {
  const f = fonti([evento()]);
  f.balldontlie.partite = async () => { throw new Error('HTTP 429'); };
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: f, chiavi });
  assert.deepEqual(r.partite, []);
  assert.equal(r.erroriGiro.filter((e) => /^balldontlie stagione \d+ alle 07:07: HTTP 429$/.test(e)).length, 2);
});

test('chiavi mancanti: partite [] e errore esatto', async () => {
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento()]), chiavi: { balldontlie: 'B' } });
  assert.deepEqual(r.partite, []);
  assert.deepEqual(r.erroriGiro, [ERRORE_CHIAVI]);
});

test('senza chiavi: file con partite [] e errore, uscita 0', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'nba-'));
  const script = fileURLToPath(new URL('../../src/nba/raccolta.js', import.meta.url));
  const env = { ...process.env };
  delete env.BALLDONTLIE_API_KEY;
  delete env.SPORTSGAMEODDS_API_KEY;
  const p = spawnSync(process.execPath, [script, '--data', '2026-10-20'], { cwd, env, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr);
  const file = join(cwd, 'data/raccolta/2026-10-20-nba.json');
  assert.ok(existsSync(file));
  const r = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(r.partite, []);
  assert.deepEqual(r.erroriGiro, ['Mancano le chiavi NBA (BALLDONTLIE_API_KEY, SPORTSGAMEODDS_API_KEY)']);
  assert.deepEqual(r.crediti, { sportsgameodds: { oggetti: 0 } });
});

test('imprevisto: raccolta di ripiego con partite [] e l\'errore (la CLI esce comunque con 0)', () => {
  const r = raccoltaDiErrore('2026-10-20', adesso, new Error('boom'));
  assert.deepEqual(r.partite, []);
  assert.deepEqual(r.erroriGiro, ['NBA alle 07:07: boom']);
  assert.deepEqual(r.crediti, { sportsgameodds: { oggetti: 0 } });
});

test('puntiAttesi nel file arrotondati a 1 decimale; avviso handicap solo sugli eventi del giorno', async () => {
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento()]), chiavi });
  for (const v of Object.values(r.partite[0].puntiAttesi)) assert.equal(v, Math.round(v * 10) / 10);
  const senza = (c) => { const b = bk(c); delete b.mercati.handicap; return b; };
  const fuori = evento({ id: 'e9', casa: 'Miami Heat', trasferta: 'Chicago Bulls', inizio: '2026-10-22T10:00:00+02:00', bookmaker: [senza('a'), senza('b'), senza('c')] });
  const r2 = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento(), fuori]), chiavi });
  assert.ok(!r2.erroriGiro.some((e) => /nessun handicap/.test(e)));
});

test('avviso handicap: evento del giorno senza handicap, evento fuori giorno con handicap → avviso', async () => {
  const senza = (c) => { const b = bk(c); delete b.mercati.handicap; return b; };
  const giorno = evento({ bookmaker: [senza('a'), senza('b'), senza('c')] });
  const fuori = evento({ id: 'e9', casa: 'Miami Heat', trasferta: 'Chicago Bulls', inizio: '2026-10-22T10:00:00+02:00' });
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([giorno, fuori]), chiavi });
  assert.ok(r.erroriGiro.includes('SportsGameOdds alle 07:07: nessun handicap disponibile (controllare il campo spread)'));
});

test('spiegazione Handicap: squadra scelta con la sua linea, per casa e trasferta e con linee intere', () => {
  const nomi = { casa: 'Boston Celtics', trasferta: 'New York Knicks' };
  const sp = (h, sel) => spiegazioneMercato(`Handicap ${h > 0 ? '+' : ''}${h}`, sel, nomi, { handicap: h, totale: null });
  const coda = ' (stessa linea) e quota almeno la minima: con una linea diversa il calcolo non vale.';
  assert.equal(sp(-5, 'casa'), `Handicap: vince se i Boston Celtics vincono con almeno 6 punti di scarto, supplementari compresi (con 5 punti esatti di scarto è rimborsata). Gioca solo su Boston Celtics -5${coda}`);
  assert.equal(sp(-5, 'trasferta'), `Handicap: vince se i New York Knicks perdono con meno di 5 punti di scarto o vincono, supplementari compresi (se perdono con 5 punti esatti di scarto è rimborsata). Gioca solo su New York Knicks +5${coda}`);
  assert.equal(sp(3.5, 'casa'), `Handicap: vince se i Boston Celtics perdono con meno di 4 punti di scarto o vincono, supplementari compresi. Gioca solo su Boston Celtics +3.5${coda}`);
  assert.equal(sp(3.5, 'trasferta'), `Handicap: vince se i New York Knicks vincono con almeno 4 punti di scarto, supplementari compresi. Gioca solo su New York Knicks -3.5${coda}`);
  assert.equal(sp(-0.5, 'trasferta'), `Handicap: vince se i New York Knicks vincono la partita, supplementari compresi. Gioca solo su New York Knicks +0.5${coda}`);
  assert.equal(sp(0, 'trasferta'), `Handicap: vince se i New York Knicks vincono la partita, supplementari compresi. Gioca solo su New York Knicks 0${coda}`);
  assert.equal(sp(-1, 'trasferta'), `Handicap: vince se i New York Knicks vincono la partita, supplementari compresi (se perdono con 1 punto esatto di scarto è rimborsata). Gioca solo su New York Knicks +1${coda}`);
  assert.equal(sp(1, 'trasferta'), `Handicap: vince se i New York Knicks vincono con almeno 2 punti di scarto, supplementari compresi (con 1 punto esatto di scarto è rimborsata). Gioca solo su New York Knicks -1${coda}`);
});

test('mercato con quota ma senza consenso (meno di 3 bookmaker con entrambe le quote): scartato e contato', async () => {
  const c = bk('c', 1.95);
  c.mercati.totale = { '221.5': { over: 1.9 } };
  const meta = { diagnostica: { lineaMancante: { handicap: 2, totale: 0 }, quoteNonConvertibili: 0, handicapAsimmetrico: 0 } };
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento({ bookmaker: [bk('a'), bk('b', 1.93), c] })], meta), chiavi });
  const m = r.partite[0].mercati;
  assert.ok(!m.some((x) => x.mercato.startsWith('Totale punti')));
  assert.ok(m.every((x) => x.probPinnacle !== null));
  assert.ok(r.erroriGiro.includes('SportsGameOdds alle 07:07: 2 handicap senza linea, 1 mercato senza consenso dei bookmaker'));
  const solo = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento({ bookmaker: [bk('a'), bk('b', 1.93), c] })]), chiavi });
  assert.ok(solo.erroriGiro.includes('SportsGameOdds alle 07:07: 1 mercato senza consenso dei bookmaker'));
});

test('stagione precedente non disponibile e squadra con meno di 10 partite: nessun mercato e avviso', async () => {
  const conPrecedenteGiu = (correnti) => ({
    sportsgameodds: { eventi: async () => conMeta([evento()]) },
    balldontlie: {
      partite: async (f) => {
        if (f.stagioni[0] === 2025) throw new Error('HTTP 500');
        return conMeta(correnti);
      },
    },
  });
  const sei = storico().filter((p) => p.stagione === 2026); // 6 partite per squadra
  const r = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: conPrecedenteGiu(sei), chiavi });
  assert.equal(r.partite.length, 0);
  assert.ok(r.erroriGiro.includes('balldontlie stagione 2025 alle 07:07: HTTP 500'));
  assert.ok(r.erroriGiro.includes('NBA: Boston Celtics - New York Knicks senza dati sufficienti (stagione precedente non disponibile)'));
  // Con 12 partite a testa nella stagione in corso la partita resta.
  const dodici = [...sei, ...sei.map((p) => ({ ...p, id: p.id + 1000 }))];
  const r2 = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: conPrecedenteGiu(dodici), chiavi });
  assert.equal(r2.partite.length, 1);
  assert.ok(!r2.erroriGiro.some((e) => e.includes('senza dati sufficienti')));
  // Con la stagione precedente caricata non serve il minimo.
  const r3 = await eseguiRaccoltaNba({ data: '2026-10-20', adesso, fonti: fonti([evento()]), chiavi });
  assert.equal(r3.partite.length, 1);
});
