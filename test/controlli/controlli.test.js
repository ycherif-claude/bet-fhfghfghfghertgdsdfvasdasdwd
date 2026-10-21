import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicaDecisioni, eseguiControlli, momento, regolaFissa, valuta, vociDi, MOTIVO_NON_ESEGUITO } from '../../src/controlli/controlli.js';
import { quotaCalcio, quotaFormatoNba, trovaEvento } from '../../src/controlli/quote.js';
import { inElenco, stessaSquadra } from '../../src/controlli/espn.js';

const OGGI = '2026-10-22';
const INIZIO = '2026-10-22T20:45:00+02:00';
const ore = (hhmm) => new Date(`2026-10-22T${hhmm}:00+02:00`);
const giocata = (extra = {}) => ({
  id: 'calcio-2026-10-22-inter-roma-1x2-1', sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Roma', idPartita: 'calcio-2026-10-22-inter-roma',
  inizio: INIZIO, tipo: 'singola', mercato: '1X2', selezione: '1', quota: 1.95, quotaMinima: 1.85, probPinnacle: 0.55, prob: 0.57,
  puntata: { euro: 4, percentuale: 2 }, stato: 'in_attesa', motivoStato: null, oraUltimoControllo: null, esito: null, ...extra,
});

function cartella({ giocate = [giocata()], chiavi = { 'calcio-2026-10-22-inter-roma': { casa: ['Lautaro Martínez'], trasferta: ['Paulo Dybala'] } } } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'bet-controlli-'));
  for (const s of ['giornate', 'raccolta', 'segnature']) mkdirSync(join(d, s));
  writeFileSync(join(d, 'giornate', `${OGGI}.json`), JSON.stringify({ data: OGGI, giocate, erroriGiro: [] }));
  writeFileSync(join(d, 'raccolta', `${OGGI}-notizie.json`), JSON.stringify({ controllateAlle: '2026-10-22T09:10:00+02:00', giocatoriChiave: chiavi }));
  return d;
}
const leggi = (d) => JSON.parse(readFileSync(join(d, 'giornate', `${OGGI}.json`), 'utf8'));
const registro = (d) => JSON.parse(readFileSync(join(d, 'raccolta', `${OGGI}-controlli.json`), 'utf8'));

const bk = (chiave, [c, x, t]) => ({ chiave, mercati: { h2h: { casa: c, pareggio: x, trasferta: t }, totals: { 2.5: { over: 1.9, under: 1.95 } } } });
const titolari = (nomi) => ({ titolari: [...nomi, ...Array.from({ length: 11 - nomi.length }, (_, i) => `Riserva ${i}`)], pronta: true });

function fonti({ formazioni = { casa: titolari(['Lautaro Martínez']), trasferta: titolari(['Paulo Dybala']) }, quote = [1.95, 3.6, 4.2], rimasti = 200, pin = [1.8, 3.9, 4.6] } = {}) {
  const chiamate = [];
  const evento = { id: 'e1', casa: 'Inter Milan', trasferta: 'AS Roma', inizio: '2026-10-22T18:45:00Z' };
  return {
    chiamate,
    espn: {
      partite: async () => { chiamate.push('espn partite'); return [{ id: 'x1', casa: 'Internazionale', trasferta: 'AS Roma', inizio: '2026-10-22T18:45Z' }]; },
      formazioni: async () => { chiamate.push('espn formazioni'); return formazioni; },
      infortuni: async () => ({ casa: [], trasferta: [] }),
    },
    oddsApi: {
      eventi: async () => { chiamate.push('odds eventi'); return { eventi: [evento], rimasti }; },
      quote: async () => {
        chiamate.push('odds quote');
        return { eventi: [{ ...evento, bookmaker: [bk('pinnacle', pin), bk('a', quote), bk('b', quote), bk('c', quote)] }] };
      },
    },
  };
}

test('finestre: presto, tentativo, ultimo, iniziata', () => {
  const v = vociDi(giocata())[0];
  assert.equal(momento(v, ore('19:50')), 'presto');
  assert.equal(momento(v, ore('20:00')), 'tentativo');
  assert.equal(momento(v, ore('20:31')), 'ultimo');
  assert.equal(momento(v, ore('20:45')), 'iniziata');
  const m = vociDi(giocata({ gambe: [giocata({ sport: 'nba' }), giocata()], quotaMinima: 3 }));
  assert.equal(m.length, 2);
  assert.equal(m[0].quotaMinima, null);
});

test('nomi: squadre e giocatori fra fonti diverse', () => {
  assert.ok(stessaSquadra('Inter', 'Internazionale'));
  assert.ok(!stessaSquadra('Inter', 'Roma'));
  assert.ok(stessaSquadra('Athletic Bilbao', 'Athletic Club'));
  assert.ok(stessaSquadra('AS Roma', 'Roma'));
  assert.ok(!stessaSquadra('Real Madrid', 'Real Sociedad'));
  assert.ok(inElenco('Lautaro Martínez', ['Lautaro Martinez']));
  assert.ok(inElenco('Budimir', ['Ante Budimir']));
  assert.ok(!inElenco('Paulo Dybala', ['Matías Soulé']));
});

test('quote: calcio 1X2 e Under/Over con Pinnacle senza margine; formato NBA con la stessa linea', () => {
  const ev = { bookmaker: [bk('pinnacle', [1.8, 3.9, 4.6]), bk('a', [1.95, 3.6, 4.2]), bk('b', [1.9, 3.6, 4.2]), bk('betfair_ex_eu', [5, 5, 5])] };
  const q = quotaCalcio(ev, '1X2', '1');
  assert.equal(q.quota, 1.9);
  assert.equal(q.n, 3);
  const somma = 1 / 1.8 + 1 / 3.9 + 1 / 4.6;
  assert.ok(Math.abs(q.prob - (1 / 1.8) / somma) < 1e-12);
  assert.equal(quotaCalcio(ev, 'Under/Over 2.5', 'Over 2.5').quota, 1.9);
  assert.equal(quotaCalcio(ev, 'Cartellini Under/Over 3.5', 'Under 3.5'), null);
  const nba = { bookmaker: ['pinnacle', 'a', 'b'].map((chiave) => ({ chiave, mercati: { handicap: { '-4.5': { casa: 1.9, trasferta: 1.95 } }, totale: { 221.5: { over: 1.91, under: 1.91 } } } })) };
  assert.equal(quotaFormatoNba(nba, { partita: 'Boston Celtics - New York Knicks', mercato: 'Handicap -4.5', selezione: 'casa' }).quota, 1.9);
  assert.deepEqual(quotaFormatoNba(nba, { partita: 'Boston Celtics - New York Knicks', mercato: 'Handicap -5.5', selezione: 'casa' }), { saltata: 'meno di 3 bookmaker con la stessa linea' });
  assert.equal(trovaEvento({ partita: 'Inter - Roma', inizio: INIZIO }, [{ casa: 'Inter Milan', trasferta: 'Roma', inizio: '2026-10-23T18:45:00Z' }]), null);
  // Basta una squadra se è l'unica partita così; con due candidate no.
  const una = [{ casa: 'Internazionale Milano', trasferta: 'Roma', inizio: '2026-10-22T18:45:00Z' }];
  assert.equal(trovaEvento({ partita: 'Inter - AS Roma', inizio: INIZIO }, una), una[0]);
  assert.equal(trovaEvento({ partita: 'Torino - AS Roma', inizio: INIZIO }, [...una, { casa: 'Lazio', trasferta: 'Roma', inizio: '2026-10-22T18:45:00Z' }]), null);
});

test('valuta e regole fisse [utente]: chiave fuori e quota sotto la minima annullano, il solo mercato no', () => {
  const v = vociDi(giocata())[0];
  assert.equal(valuta(v, { pronta: true, fuori: [], nota: 'ok' }, { quota: 1.9, prob: 0.56 }).esito, 'confermata');
  const r = valuta(v, { pronta: true, fuori: ['Lautaro Martínez'], nota: 'x' }, { quota: 1.8, prob: 0.48 });
  assert.equal(r.esito, 'revisione');
  assert.deepEqual(r.problemi.map((p) => p.tipo), ['chiave', 'quota', 'mercato']);
  assert.equal(regolaFissa(r.problemi).esito, 'annullata');
  const mercato = valuta(v, null, { quota: 1.9, prob: 0.48 });
  assert.equal(regolaFissa(mercato.problemi).esito, 'confermata');
  assert.match(regolaFissa(mercato.problemi).motivo, /confermata con l'avviso/);
  assert.equal(valuta(v, null, { assente: true }).esito, 'annullata');
});

test('controllo: aspetta le formazioni, poi conferma con quote e formazioni; una richiesta per competizione', async () => {
  const d = cartella();
  const prima = fonti({ formazioni: { casa: { titolari: [], pronta: false }, trasferta: { titolari: [], pronta: false } } });
  let r = await eseguiControlli({ dirData: d, adesso: ore('20:00'), fonti: prima, chiavi: { oddsApi: 'K' } });
  assert.equal(r.cambiate, 0);
  assert.ok(!prima.chiamate.includes('odds quote'));
  // In attesa delle formazioni non si scrive nessun file.
  assert.throws(() => registro(d));
  const f = fonti();
  r = await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: f, chiavi: { oddsApi: 'K' } });
  assert.equal(r.cambiate, 1);
  const g = leggi(d).giocate[0];
  assert.equal(g.stato, 'confermata');
  assert.equal(g.motivoStato, 'formazioni ufficiali: tutti i giocatori chiave titolari; quota 1,95 ≥ minima 1,85');
  assert.equal(g.oraUltimoControllo, '2026-10-22T20:10:00+02:00');
  assert.equal(f.chiamate.filter((c) => c === 'odds quote').length, 1);
  // Già decisa: i passaggi successivi non la toccano più.
  const dopo = fonti();
  await eseguiControlli({ dirData: d, adesso: ore('20:20'), fonti: dopo, chiavi: { oddsApi: 'K' } });
  assert.deepEqual(dopo.chiamate, []);
});

test('controllo: formazioni mai uscite → all\'ultimo tentativo si decide con i dati del mattino', async () => {
  const d = cartella();
  const f = fonti({ formazioni: { casa: { titolari: [], pronta: false }, trasferta: { titolari: [], pronta: false } } });
  await eseguiControlli({ dirData: d, adesso: ore('20:35'), fonti: f, chiavi: { oddsApi: 'K' } });
  const g = leggi(d).giocate[0];
  assert.equal(g.stato, 'confermata');
  assert.match(g.motivoStato, /^formazioni non uscite: valutata sui dati del mattino/);
});

test('controllo: chiave fuori senza Claude → annullata con la regola fissa; crediti finiti → solo formazioni', async () => {
  const d = cartella();
  await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: fonti({ formazioni: { casa: titolari([]), trasferta: titolari(['Paulo Dybala']) } }), chiavi: { oddsApi: 'K' } });
  const g = leggi(d).giocate[0];
  assert.equal(g.stato, 'annullata');
  assert.match(g.motivoStato, /^regola automatica \(Claude non disponibile\): giocatore chiave fuori: Lautaro Martínez/);
  const d2 = cartella();
  const f = fonti({ rimasti: 20 });
  await eseguiControlli({ dirData: d2, adesso: ore('20:10'), fonti: f, chiavi: { oddsApi: 'K' } });
  assert.ok(!f.chiamate.includes('odds quote'));
  assert.match(leggi(d2).giocate[0].motivoStato, /quote non controllate \(crediti delle quote finiti\)/);
});

test('controllo con Claude: in revisione, un solo avvio, decisione applicata; senza decisione regole fisse a 5 minuti', async () => {
  const d = cartella();
  const r = await eseguiControlli({ dirData: d, adesso: ore('20:05'), fonti: fonti({ quote: [1.8, 3.6, 4.4] }), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
  assert.deepEqual(r.daMandareAClaude, ['calcio-2026-10-22-inter-roma-1x2-1']);
  assert.equal(leggi(d).giocate[0].stato, 'in_revisione');
  assert.equal(registro(d).claude.avvii, 1);
  writeFileSync(join(d, 'raccolta', `${OGGI}-controlli-decisioni.json`), JSON.stringify({ decisioni: [
    { idGiocata: 'calcio-2026-10-22-inter-roma-1x2-1', stato: 'modificata', quotaMinima: 1.75, motivo: 'la quota scende per il mercato, non per una notizia', fonte: 'Gazzetta, 20:15' },
  ] }));
  applicaDecisioni({ dirData: d, adesso: ore('20:20') });
  const g = leggi(d).giocate[0];
  assert.equal(g.stato, 'modificata');
  assert.equal(g.quotaMinima, 1.75);
  assert.match(g.motivoStato, /^Claude: la quota scende/);
  assert.throws(() => applicaDecisioni({ dirData: d, adesso: ore('20:21') }), /non è in revisione/);

  const d2 = cartella();
  await eseguiControlli({ dirData: d2, adesso: ore('20:05'), fonti: fonti({ quote: [1.8, 3.6, 4.4] }), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
  await eseguiControlli({ dirData: d2, adesso: ore('20:41'), fonti: fonti(), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
  const g2 = leggi(d2).giocate[0];
  assert.equal(g2.stato, 'annullata');
  assert.match(g2.motivoStato, /regola automatica.*quota 1,80 sotto la minima 1,85/);
});

test('controllo: tetto di 2 avvii di Claude al giorno, poi regole fisse', async () => {
  const d = cartella();
  writeFileSync(join(d, 'raccolta', `${OGGI}-controlli.json`), JSON.stringify({ data: OGGI, voci: {}, claude: { avvii: 2, richieste: ['a', 'b'] } }));
  const r = await eseguiControlli({ dirData: d, adesso: ore('20:05'), fonti: fonti({ quote: [1.8, 3.6, 4.4] }), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
  assert.deepEqual(r.daMandareAClaude, []);
  assert.equal(leggi(d).giocate[0].stato, 'annullata');
});

test('controllo non eseguito: partita iniziata senza controllo, una riga sulla scheda', async () => {
  const d = cartella();
  await eseguiControlli({ dirData: d, adesso: ore('20:50'), fonti: fonti(), chiavi: {} });
  const g = leggi(d).giocate[0];
  assert.equal(g.stato, 'in_attesa');
  assert.equal(g.motivoStato, MOTIVO_NON_ESEGUITO);
});
