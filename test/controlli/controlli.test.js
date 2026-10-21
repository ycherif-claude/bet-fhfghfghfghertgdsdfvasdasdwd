import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicaDecisioni, eseguiControlli, esitiRapidiNelGiro, momento, regolaFissa, valuta, vociDi, MOTIVO_NON_ESEGUITO } from '../../src/controlli/controlli.js';
import { quotaCalcio, quotaFormatoNba, trovaEvento } from '../../src/controlli/quote.js';
import { espn, inElenco, stessaSquadra } from '../../src/controlli/espn.js';

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
  // Il cron di GitHub parte ogni 30-43 minuti: primo tentativo 90 minuti prima, ultimo da 45.
  assert.equal(momento(v, ore('19:10')), 'presto');
  assert.equal(momento(v, ore('19:20')), 'tentativo');
  assert.equal(momento(v, ore('19:59')), 'tentativo');
  assert.equal(momento(v, ore('20:01')), 'ultimo');
  const nba = vociDi(giocata({ sport: 'nba' }))[0];
  assert.equal(momento(nba, ore('19:25')), 'presto');
  assert.equal(momento(nba, ore('19:35')), 'tentativo');
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
  assert.ok(stessaSquadra('Inter Milan', 'Internazionale'));
  // Una parola in comune non basta.
  assert.ok(!stessaSquadra('New York Knicks', 'New Orleans Pelicans'));
  assert.ok(!stessaSquadra('New York Knicks', 'New Orleans Pelicans', 'nba'));
  assert.ok(stessaSquadra('LA Clippers', 'Los Angeles Clippers', 'nba'));
  assert.ok(stessaSquadra('Knicks', 'New York Knicks', 'nba'));
  assert.ok(!stessaSquadra('Maccabi Tel Aviv', 'Hapoel Tel Aviv'));
  assert.ok(!stessaSquadra('Maccabi Tel Aviv', 'Hapoel Tel Aviv', 'basket'));
  assert.ok(stessaSquadra('Maccabi Playtika Tel Aviv', 'Maccabi Tel Aviv', 'basket'));
  assert.ok(!stessaSquadra('Manchester United', 'Manchester City'));
  assert.ok(!stessaSquadra('AC Milan', 'Inter Milan'));
  assert.ok(inElenco('Lautaro Martínez', ['Lautaro Martinez']));
  assert.ok(inElenco('Budimir', ['Ante Budimir']));
  assert.ok(!inElenco('Paulo Dybala', ['Matías Soulé']));
  // Stesso cognome, nome diverso: non è lui. Iniziale e cognome bastano.
  assert.ok(!inElenco('Theo Hernández', ['Lucas Hernández']));
  assert.ok(inElenco('Theo Hernández', ['T. Hernandez']));
  assert.ok(inElenco('Jaren Jackson Jr.', ['Jaren Jackson Jr.']));
  // Solo il cognome: vale se nell'elenco ce n'è uno solo.
  assert.ok(!inElenco('Hernández', ['Theo Hernández', 'Lucas Hernández']));
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
  // Knicks e Pelicans non si confondono più ("new" in comune).
  const pelicans = [{ casa: 'New Orleans Pelicans', trasferta: 'Boston Celtics', inizio: '2026-10-23T00:00:00Z' }];
  assert.equal(trovaEvento({ sport: 'nba', partita: 'New York Knicks - Miami Heat', inizio: '2026-10-23T00:00:00Z' }, pelicans), null);
  const telAviv = [{ casa: 'Hapoel Tel Aviv', trasferta: 'Real Madrid', inizio: '2026-10-22T18:00:00Z' }];
  assert.equal(trovaEvento({ sport: 'basket', partita: 'Maccabi Tel Aviv - Olympiacos', inizio: '2026-10-22T18:00:00Z' }, telAviv), null);
  // Lato della selezione: deve essere uno solo.
  const libri = ['pinnacle', 'a', 'b'].map((chiave) => ({ chiave, mercati: { vincente: { casa: 1.8, trasferta: 2.05 } } }));
  assert.equal(quotaFormatoNba({ bookmaker: libri }, { sport: 'nba', partita: 'New York Knicks - New Orleans Pelicans', mercato: 'Vincente', selezione: 'New Orleans Pelicans' }).quota, 2.05);
  assert.equal(quotaFormatoNba({ bookmaker: libri }, { sport: 'nba', partita: 'New York Knicks - New Orleans Pelicans', mercato: 'Vincente', selezione: 'New York' }), null);
});

test('ESPN infortuni: gli Out vanno alla squadra giusta (per id della squadra), mai tutti da una parte', async () => {
  const summary = {
    header: { competitions: [{ competitors: [
      { homeAway: 'home', team: { id: '18', displayName: 'New York Knicks' } },
      { homeAway: 'away', team: { id: '3', displayName: 'New Orleans Pelicans' } },
    ] }] },
    injuries: [
      { team: { id: '3', displayName: 'New Orleans Pelicans' }, injuries: [{ status: 'Out', athlete: { displayName: 'Zion Williamson' } }] },
      { team: { id: '18', displayName: 'New York Knicks' }, injuries: [{ status: 'Out', athlete: { displayName: 'Jalen Brunson' } }, { status: 'Day-To-Day', athlete: { displayName: 'Josh Hart' } }] },
    ],
  };
  const fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(summary) });
  const r = await espn.infortuni('basketball/nba', '1', { casa: 'New York Knicks', trasferta: 'New Orleans Pelicans' }, { fetch });
  assert.deepEqual(r, { casa: ['Jalen Brunson'], trasferta: ['Zion Williamson'] });
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
  // Partita non trovata nella fonte delle quote: in revisione, mai annullata in automatico.
  const assente = valuta(v, null, { assente: true });
  assert.equal(assente.esito, 'revisione');
  assert.deepEqual(assente.problemi.map((p) => p.tipo), ['assente']);
  assert.equal(regolaFissa(assente.problemi).esito, 'revisione');
});

test('controllo: partita assente dalle quote → in revisione, e resta tale anche con le regole fisse (giocata già fatta)', async () => {
  const d = cartella();
  writeFileSync(join(d, 'segnature', 'a.json'), JSON.stringify({ idGiocata: 'calcio-2026-10-22-inter-roma-1x2-1', fatta: true, quotaReale: 1.95, puntataReale: 4, ora: '2026-10-22T10:00:00Z' }));
  const f = fonti();
  f.oddsApi.eventi = async () => ({ eventi: [], rimasti: 200 });
  await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: f, chiavi: { oddsApi: 'K' } });
  const g = leggi(d).giocate[0];
  assert.equal(g.stato, 'in_revisione');
  assert.match(g.motivoStato, /non trovata nella fonte delle quote/);
  // I passaggi dopo non la annullano e non riscrivono niente.
  const prima = readFileSync(join(d, 'raccolta', `${OGGI}-controlli.json`), 'utf8');
  await eseguiControlli({ dirData: d, adesso: ore('20:40'), fonti: f, chiavi: { oddsApi: 'K' } });
  assert.equal(leggi(d).giocate[0].stato, 'in_revisione');
  assert.equal(readFileSync(join(d, 'raccolta', `${OGGI}-controlli.json`), 'utf8'), prima);
});

test('controllo: aspetta le formazioni, poi conferma con quote e formazioni; una richiesta per competizione', async () => {
  const d = cartella();
  const prima = fonti({ formazioni: { casa: { titolari: [], pronta: false }, trasferta: { titolari: [], pronta: false } } });
  let r = await eseguiControlli({ dirData: d, adesso: ore('19:30'), fonti: prima, chiavi: { oddsApi: 'K' } });
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
  const r = await eseguiControlli({ dirData: d, adesso: ore('19:30'), fonti: fonti({ quote: [1.8, 3.6, 4.4] }), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
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

  // Senza decisione, le regole fisse al primo passaggio a meno di 45 minuti (il cron può saltare il resto).
  const d2 = cartella();
  await eseguiControlli({ dirData: d2, adesso: ore('19:30'), fonti: fonti({ quote: [1.8, 3.6, 4.4] }), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
  await eseguiControlli({ dirData: d2, adesso: ore('19:58'), fonti: fonti(), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
  assert.equal(leggi(d2).giocate[0].stato, 'in_revisione');
  await eseguiControlli({ dirData: d2, adesso: ore('20:05'), fonti: fonti(), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
  const g2 = leggi(d2).giocate[0];
  assert.equal(g2.stato, 'annullata');
  assert.match(g2.motivoStato, /regola automatica.*quota 1,80 sotto la minima 1,85/);
});

test('controllo: tetto di 2 avvii di Claude al giorno, poi regole fisse', async () => {
  const d = cartella();
  writeFileSync(join(d, 'raccolta', `${OGGI}-controlli.json`), JSON.stringify({ data: OGGI, voci: {}, claude: { avvii: 2, richieste: ['a', 'b'] } }));
  const r = await eseguiControlli({ dirData: d, adesso: ore('19:30'), fonti: fonti({ quote: [1.8, 3.6, 4.4] }), chiavi: { oddsApi: 'K' }, claudeDisponibile: true });
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

test('decisioni di Claude arrivate dopo l\'inizio: rifiutate e scritte fra gli errori, le altre applicate', async () => {
  const altra = giocata({ id: 'calcio-2026-10-22-milan-lazio-1x2-1', partita: 'Milan - Lazio', idPartita: 'calcio-2026-10-22-milan-lazio', inizio: '2026-10-22T21:30:00+02:00' });
  const d = cartella({ giocate: [giocata({ stato: 'in_revisione' }), { ...altra, stato: 'in_revisione' }] });
  writeFileSync(join(d, 'raccolta', `${OGGI}-controlli-decisioni.json`), JSON.stringify({ decisioni: [
    { idGiocata: 'calcio-2026-10-22-inter-roma-1x2-1', stato: 'confermata', motivo: 'nessuna notizia', fonte: 'ESPN, 20:40' },
    { idGiocata: 'calcio-2026-10-22-milan-lazio-1x2-1', stato: 'annullata', motivo: 'fuori Leão', fonte: 'sito del Milan, 20:40' },
  ] }));
  const r = applicaDecisioni({ dirData: d, adesso: ore('20:50') });
  assert.equal(r.applicate, 1);
  assert.deepEqual(r.rifiutate, ['calcio-2026-10-22-inter-roma-1x2-1']);
  const j = leggi(d);
  assert.equal(j.giocate[0].stato, 'in_revisione');
  assert.equal(j.giocate[1].stato, 'annullata');
  assert.ok(j.erroriGiro.some((e) => /Decisione di Claude per calcio-2026-10-22-inter-roma-1x2-1 arrivata dopo l'inizio/.test(e)));
});

test('esiti rapidi dentro i controlli: gli errori vanno fra gli errori della giornata, una volta sola', async () => {
  const d = cartella();
  const esegui = async () => ({ aggiornate: 0, errori: ['Levante - Athletic Bilbao: site.api.espn.com: HTTP 500'] });
  await esitiRapidiNelGiro({ dirData: d, adesso: ore('22:00'), esegui });
  await esitiRapidiNelGiro({ dirData: d, adesso: ore('22:10'), esegui });
  assert.deepEqual(leggi(d).erroriGiro, ['Esiti rapidi: Levante - Athletic Bilbao: site.api.espn.com: HTTP 500']);
  await esitiRapidiNelGiro({ dirData: d, adesso: ore('22:20'), esegui: async () => { throw new Error('disco pieno'); } });
  assert.equal(leggi(d).erroriGiro.at(-1), 'Esiti rapidi non riusciti: disco pieno');
});
