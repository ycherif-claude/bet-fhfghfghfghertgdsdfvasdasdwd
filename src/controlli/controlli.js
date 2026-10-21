// Fase 3: controllo prima di ogni partita con una giocata. Ogni 10 minuti (Action controlli.yml):
// formazioni (ESPN), ritiri e quote dell'ultimo momento; se non cambia niente la giocata è Confermata,
// se cambia qualcosa va In revisione e, nei limiti (2 al giorno), si avvia Claude; senza Claude valgono
// le regole fisse. Le decisioni di Claude si applicano con `--applica`.
// Si scrivono solo stato, motivoStato, oraUltimoControllo (e quotaMinima per "modificata").
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { giornataDi } from '../bankroll/settimana.js';
import { finestraGiornata, isoRoma } from '../calcio/testo.js';
import { segnateComeGiocate } from '../calcio/esiti.js';
import { oddsApi } from '../calcio/fonti/odds-api.js';
import { oddsTennis } from '../tennis/fonti/odds-tennis.js';
import { oddsBasket } from '../basket/fonti/odds-basket.js';
import { sportsgameodds } from '../nba/fonti/sportsgameodds.js';
import { oddspapi } from '../pallavolo/fonti/oddspapi.js';
import { CAMPIONATI_ESPN, espn, inElenco } from './espn.js';
import { quoteFresche, squadreDi, trovaEvento } from './quote.js';

const K = CONFIG.controlli;
const MIN = 60000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const virgola = (q) => q.toFixed(2).replace('.', ',');
const testoPieno = (x) => typeof x === 'string' && x.trim() !== '';
export const MOTIVO_NON_ESEGUITO = 'controllo prima della partita non eseguito: valutata sui dati del mattino';

const percorsi = (dirData, data) => ({
  giornata: path.join(dirData, 'giornate', `${data}.json`),
  stato: path.join(dirData, 'raccolta', `${data}-controlli.json`),
  decisioni: path.join(dirData, 'raccolta', `${data}-controlli-decisioni.json`),
  notizie: path.join(dirData, 'raccolta', `${data}-notizie.json`),
});

function leggi(file, ripiego) {
  if (!fs.existsSync(file)) return ripiego;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
const scrivi = (file, x) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(x, null, 2)}\n`);
};

// Voci da controllare: le singole e le gambe delle multiple (una partita ciascuna).
export function vociDi(g) {
  const base = (x, id) => ({
    id, idGiocata: g.id, sport: x.sport ?? g.sport, competizione: x.competizione ?? g.competizione, partita: x.partita,
    idPartita: x.idPartita, inizio: x.inizio, mercato: x.mercato, selezione: x.selezione,
    probPinnacle: num(x.probPinnacle) ? x.probPinnacle : null,
    // La quota minima vale per la singola; nelle multiple è della multipla intera: niente controllo per gamba.
    quotaMinima: Array.isArray(g.gambe) && g.gambe.length ? null : g.quotaMinima,
  });
  return Array.isArray(g.gambe) && g.gambe.length ? g.gambe.map((x, i) => base(x, `${g.id}#${i}`)) : [base(g, g.id)];
}

// Momento della voce rispetto alla sua finestra: 'presto' | 'tentativo' | 'ultimo' | 'iniziata'.
export function momento(voce, adesso) {
  const f = K.finestre[voce.sport] ?? K.finestre.calcio;
  const t = Date.parse(voce.inizio);
  const ora = adesso.getTime();
  if (ora >= t) return 'iniziata';
  if (ora < t - f.primo * MIN) return 'presto';
  return ora >= t - f.ultimo * MIN ? 'ultimo' : 'tentativo';
}

// Giocatori chiave del giro del mattino per una partita: { casa: [...], trasferta: [...] }.
function chiaviDi(notizie, idPartita) {
  const x = notizie?.giocatoriChiave?.[idPartita];
  if (Array.isArray(x)) return { casa: x, trasferta: x };
  return { casa: Array.isArray(x?.casa) ? x.casa : [], trasferta: Array.isArray(x?.trasferta) ? x.trasferta : [] };
}

// Formazioni e assenze di una voce (calcio e NBA): { pronta, fuori: [nomi], nota } oppure null (sport senza formazioni).
async function formazioniVoce(voce, notizie, fonti, adesso) {
  const campionato = voce.sport === 'nba' ? CAMPIONATI_ESPN.NBA : voce.sport === 'calcio' ? CAMPIONATI_ESPN[voce.competizione] : null;
  if (!campionato) return null;
  const chiavi = chiaviDi(notizie, voce.idPartita);
  const tutte = [...chiavi.casa, ...chiavi.trasferta];
  // ESPN usa il giorno UTC (e per l'NBA quello americano): si prova il giorno della partita e quello prima.
  const giorno = new Date(voce.inizio).toISOString().slice(0, 10);
  const prima = new Date(Date.parse(voce.inizio) - 86400000).toISOString().slice(0, 10);
  let evento = null;
  for (const d of [giorno, prima]) {
    evento = trovaEvento(voce, await fonti.espn.partite(campionato, d));
    if (evento) break;
  }
  if (!evento) return { pronta: true, fuori: [], nota: 'partita non trovata su ESPN: formazioni non controllate' };
  const sq = squadreDi(voce.partita);
  if (voce.sport === 'nba') {
    const inf = await fonti.espn.infortuni(campionato, evento.id, sq);
    const fuori = ['casa', 'trasferta'].flatMap((l) => chiavi[l].filter((n) => inElenco(n, inf[l])));
    return { pronta: true, fuori, nota: tutte.length ? `report infortuni: ${fuori.length ? `fuori ${fuori.join(', ')}` : 'giocatori chiave disponibili'}` : 'giocatori chiave non indicati dal giro del mattino' };
  }
  const f = await fonti.espn.formazioni(campionato, evento.id);
  const pronta = Boolean(f.casa?.pronta && f.trasferta?.pronta);
  if (!pronta) return { pronta: false, fuori: [], nota: 'formazioni non uscite: valutata sui dati del mattino' };
  const fuori = ['casa', 'trasferta'].flatMap((l) => chiavi[l].filter((n) => !inElenco(n, f[l].titolari)));
  const nota = !tutte.length ? 'formazioni ufficiali uscite (giocatori chiave non indicati dal giro del mattino)'
    : fuori.length ? `formazioni ufficiali: non titolari ${fuori.join(', ')}` : 'formazioni ufficiali: tutti i giocatori chiave titolari';
  return { pronta: true, fuori, nota };
}

// Esito di una voce dai controlli: { esito, problemi, dettagli }.
export function valuta(voce, formazioni, quote) {
  const problemi = [];
  const dettagli = [];
  if (formazioni) {
    dettagli.push(formazioni.nota);
    if (formazioni.fuori.length) problemi.push({ tipo: 'chiave', testo: `giocatore chiave fuori: ${formazioni.fuori.join(', ')}` });
  }
  if (quote?.assente) return { esito: 'annullata', problemi: [{ tipo: 'assente', testo: 'partita non più in programma (ritiro o rinvio)' }], dettagli };
  if (quote && num(quote.quota)) {
    if (num(voce.quotaMinima) && quote.quota < voce.quotaMinima) {
      problemi.push({ tipo: 'quota', testo: `quota ${virgola(quote.quota)} sotto la minima ${virgola(voce.quotaMinima)}` });
    } else {
      dettagli.push(num(voce.quotaMinima) ? `quota ${virgola(quote.quota)} ≥ minima ${virgola(voce.quotaMinima)}` : `quota ${virgola(quote.quota)}`);
    }
    if (num(quote.prob) && num(voce.probPinnacle) && voce.probPinnacle - quote.prob > K.scartoMercato) {
      problemi.push({ tipo: 'mercato', testo: `mercato contro: da ${Math.round(voce.probPinnacle * 100)}% a ${Math.round(quote.prob * 100)}%` });
    }
  } else if (quote?.saltata) {
    dettagli.push(`quote non controllate (${quote.saltata})`);
  }
  return { esito: problemi.length ? 'revisione' : 'confermata', problemi, dettagli };
}

// Regole fisse senza Claude [utente]: giocatore chiave fuori o quota sotto la minima → annullata;
// il solo movimento del mercato non annulla (confermata con l'avviso).
export function regolaFissa(problemi) {
  const annulla = problemi.filter((p) => p.tipo === 'chiave' || p.tipo === 'quota' || p.tipo === 'assente');
  return annulla.length
    ? { esito: 'annullata', motivo: `regola automatica (Claude non disponibile): ${annulla.map((p) => p.testo).join('; ')}` }
    : { esito: 'confermata', motivo: `regola automatica (Claude non disponibile): ${problemi.map((p) => p.testo).join('; ')}, confermata con l'avviso` };
}

// Stato della giocata dagli esiti delle sue voci (le gambe di una multipla).
function statoGiocata(g, voci, registro) {
  const esiti = voci.map((v) => registro[v.id]).filter(Boolean);
  const annullata = esiti.find((e) => e.esito === 'annullata');
  if (annullata) return { stato: 'annullata', motivoStato: annullata.motivo };
  const revisione = esiti.find((e) => e.esito === 'revisione');
  if (revisione) return { stato: 'in_revisione', motivoStato: revisione.motivo };
  if (esiti.length < voci.length) return null;
  const motivo = esiti.map((e) => e.motivo).join(' · ');
  // Una giocata già modificata dal giro serale resta "modificata": il controllo aggiunge il suo esito.
  if (g.stato === 'modificata') return { stato: 'modificata', motivoStato: `${g.motivoStato ?? 'modificata'} · controllo prima della partita: ${motivo}` };
  return { stato: 'confermata', motivoStato: motivo };
}

const fonteDefault = () => ({ espn, oddsApi, oddsTennis, oddsBasket, sportsgameodds, oddspapi });

// Un passaggio dei controlli. `claudeDisponibile`: secrets della routine presenti.
// Restituisce { cambiate, daMandareAClaude: [idGiocata], errori }.
export async function eseguiControlli({ dirData, adesso, fonti = fonteDefault(), chiavi = {}, claudeDisponibile = false }) {
  const data = giornataDi(adesso);
  const f = percorsi(dirData, data);
  const giornata = leggi(f.giornata, null);
  const errori = [];
  // Senza l'ora: lo stesso errore in più passaggi finisce una volta sola fra gli errori della giornata.
  const errore = (fonte, e) => { const m = `Controlli prima delle partite (${fonte}): ${e?.message ?? e}`; if (!errori.includes(m)) errori.push(m); };
  if (!giornata || !Array.isArray(giornata.giocate)) return { cambiate: 0, daMandareAClaude: [], errori };
  let notizie = null;
  try { notizie = leggi(f.notizie, null); } catch (e) { errore('File notizie', e); }
  const reg = leggi(f.stato, { data, voci: {}, claude: { avvii: 0, richieste: [] } });
  const regPrima = JSON.stringify(reg);
  const ora = isoRoma(adesso);

  // 1. Voci nella finestra, non ancora decise.
  const daFare = [];
  for (const g of giornata.giocate) {
    if (!oggetto(g) || g.stato === 'annullata') continue;
    for (const v of vociDi(g)) {
      const r = reg.voci[v.id];
      const m = momento(v, adesso);
      // Revisione senza decisione a ridosso dell'inizio: regole fisse.
      if (r?.esito === 'revisione' && Date.parse(v.inizio) - adesso.getTime() <= K.minutiDecisioneClaude * MIN) {
        const x = regolaFissa(r.problemi);
        reg.voci[v.id] = { ...r, esito: x.esito, motivo: x.motivo, alle: ora, regola: true };
        continue;
      }
      if (r) continue;
      if (m === 'iniziata') { reg.voci[v.id] = { esito: 'non-eseguito', motivo: MOTIVO_NON_ESEGUITO, alle: ora }; continue; }
      if (m !== 'presto') daFare.push({ v, ultimo: m === 'ultimo' });
    }
  }

  // 2. Formazioni (si aspetta che escano, fino all'ultimo tentativo), poi le quote di quelle pronte.
  const pronte = [];
  for (const { v, ultimo } of daFare) {
    let form = null;
    try {
      form = await formazioniVoce(v, notizie, fonti, adesso);
    } catch (e) {
      errore('ESPN', e);
      form = { pronta: true, fuori: [], nota: 'formazioni non disponibili (ESPN non raggiungibile)' };
    }
    if (form && !form.pronta && !ultimo) continue;
    pronte.push({ v, form });
  }
  const quote = pronte.length ? await quoteFresche(pronte.map((x) => x.v), { fonti, chiavi, finestra: finestraGiornata(data), errore }) : new Map();

  // 3. Esiti; le revisioni nuove vanno a Claude se c'è posto, altrimenti regole fisse.
  const nuoveRevisioni = [];
  for (const { v, form } of pronte) {
    const r = valuta(v, form, quote.get(v.id));
    if (r.esito === 'revisione') {
      const tempo = Date.parse(v.inizio) - adesso.getTime() > (K.minutiDecisioneClaude + 5) * MIN;
      if (claudeDisponibile && tempo && (reg.claude.avvii < K.maxClaude || reg.claude.richieste.includes(v.idGiocata) || nuoveRevisioni.includes(v.idGiocata))) {
        reg.voci[v.id] = { esito: 'revisione', motivo: `in revisione: ${r.problemi.map((p) => p.testo).join('; ')}`, problemi: r.problemi, dettagli: r.dettagli, alle: ora };
        if (!nuoveRevisioni.includes(v.idGiocata) && !reg.claude.richieste.includes(v.idGiocata)) nuoveRevisioni.push(v.idGiocata);
        continue;
      }
      const x = regolaFissa(r.problemi);
      reg.voci[v.id] = { esito: x.esito, motivo: x.motivo, problemi: r.problemi, dettagli: r.dettagli, alle: ora, regola: true };
      continue;
    }
    const motivo = r.esito === 'annullata' ? r.problemi.map((p) => p.testo).join('; ') : r.dettagli.join('; ') || 'nessun cambiamento';
    reg.voci[v.id] = { esito: r.esito, motivo, problemi: r.problemi, dettagli: r.dettagli, alle: ora };
  }
  if (nuoveRevisioni.length) {
    // Un avvio di Claude per tutte le revisioni nuove dello stesso passaggio.
    reg.claude.avvii++;
    reg.claude.richieste.push(...nuoveRevisioni);
  }

  // 4. Stati delle giocate.
  const segnate = segnateComeGiocate(path.join(dirData, 'giornate'));
  let cambiate = 0;
  const giocate = giornata.giocate.map((g) => {
    if (!oggetto(g) || g.stato === 'annullata') return g;
    const voci = vociDi(g);
    if (voci.every((v) => reg.voci[v.id]?.esito === 'non-eseguito')) {
      if (g.motivoStato === MOTIVO_NON_ESEGUITO || g.stato !== 'in_attesa') return g;
      cambiate++;
      return { ...g, motivoStato: MOTIVO_NON_ESEGUITO };
    }
    const nuovo = statoGiocata(g, voci.filter((v) => reg.voci[v.id]?.esito !== 'non-eseguito'), reg.voci);
    if (!nuovo) return g;
    if (nuovo.stato === 'annullata' && segnate.has(g.id)) nuovo.motivoStato += ' (attenzione: la giocata risulta già fatta)';
    if (g.stato === nuovo.stato && g.motivoStato === nuovo.motivoStato) return g;
    cambiate++;
    return { ...g, ...nuovo, oraUltimoControllo: ora };
  });
  const erroriGiro = Array.isArray(giornata.erroriGiro) ? giornata.erroriGiro : [];
  const nuoviErrori = errori.filter((e) => !erroriGiro.includes(e));
  if (cambiate || nuoviErrori.length) scrivi(f.giornata, { ...giornata, giocate, erroriGiro: [...erroriGiro, ...nuoviErrori] });
  // Solo se qualcosa è cambiato: mentre si aspettano le formazioni non si riscrive niente (niente commit a vuoto).
  if (JSON.stringify(reg) !== regPrima) scrivi(f.stato, reg);
  return { cambiate, daMandareAClaude: nuoveRevisioni, errori };
}

// Decisioni di Claude sulle giocate in revisione: { decisioni: [{ idGiocata, stato, motivo, fonte, quotaMinima? }] }.
export function applicaDecisioni({ dirData, adesso }) {
  const data = giornataDi(adesso);
  const f = percorsi(dirData, data);
  const giornata = leggi(f.giornata, null);
  const dec = leggi(f.decisioni, null);
  if (!giornata || !Array.isArray(giornata.giocate)) throw new Error(`Giornata mancante: data/giornate/${data}.json`);
  if (!oggetto(dec) || !Array.isArray(dec.decisioni)) throw new Error(`Decisioni mancanti o illeggibili: data/raccolta/${data}-controlli-decisioni.json`);
  const perId = new Map(giornata.giocate.filter(oggetto).map((g) => [g.id, g]));
  const errori = [];
  for (const [i, d] of dec.decisioni.entries()) {
    const err = (m) => errori.push(`Decisione ${i + 1} (${d?.idGiocata}): ${m}`);
    const g = perId.get(d?.idGiocata);
    if (!g) { err('giocata inesistente nella giornata'); continue; }
    if (g.stato !== 'in_revisione') { err(`la giocata non è in revisione (stato ${g.stato})`); continue; }
    if (!['confermata', 'modificata', 'annullata'].includes(d.stato)) err(`stato non valido: ${d.stato}`);
    if (!testoPieno(d.motivo)) err('motivo mancante');
    if (!testoPieno(d.fonte)) err('fonte mancante');
    if (d.quotaMinima !== undefined && (d.stato !== 'modificata' || !num(d.quotaMinima) || d.quotaMinima <= 1)) err('quotaMinima solo con "modificata" e maggiore di 1');
    if (d.stato === 'modificata' && d.quotaMinima === undefined) err('"modificata" richiede la nuova quotaMinima');
  }
  if (errori.length) throw new Error(`Decisioni non valide, nessun file scritto:\n${errori.map((x) => `- ${x}`).join('\n')}`);
  const reg = leggi(f.stato, { data, voci: {}, claude: { avvii: 0, richieste: [] } });
  const ora = isoRoma(adesso);
  const segnate = segnateComeGiocate(path.join(dirData, 'giornate'));
  const decisioni = new Map(dec.decisioni.map((d) => [d.idGiocata, d]));
  const giocate = giornata.giocate.map((g) => {
    const d = decisioni.get(g?.id);
    if (!d) return g;
    let motivo = `Claude: ${d.motivo} (${d.fonte})`;
    if (d.stato === 'annullata' && segnate.has(g.id)) motivo += ' (attenzione: la giocata risulta già fatta)';
    for (const v of vociDi(g)) if (reg.voci[v.id]?.esito === 'revisione') reg.voci[v.id] = { ...reg.voci[v.id], esito: d.stato, motivo, alle: ora, claude: true };
    return { ...g, stato: d.stato, motivoStato: motivo, oraUltimoControllo: ora, ...(d.stato === 'modificata' ? { quotaMinima: d.quotaMinima } : {}) };
  });
  scrivi(f.giornata, { ...giornata, giocate });
  scrivi(f.stato, reg);
  return { applicate: decisioni.size };
}

async function principale() {
  const adesso = new Date();
  if (process.argv.includes('--applica')) {
    const r = applicaDecisioni({ dirData: 'data', adesso });
    console.log(`Decisioni del controllo applicate: ${r.applicate}`);
    return;
  }
  const chiavi = {
    oddsApi: process.env.ODDS_API_KEY, sportsgameodds: process.env.SPORTSGAMEODDS_API_KEY, oddspapi: process.env.ODDSPAPI_API_KEY,
  };
  const claudeDisponibile = Boolean(process.env.ROUTINE_CONTROLLI_URL && process.env.ROUTINE_CONTROLLI_TOKEN);
  const r = await eseguiControlli({ dirData: 'data', adesso, chiavi, claudeDisponibile });
  for (const e of r.errori) console.log(`- ${e}`);
  console.log(`Controlli: ${r.cambiate} giocate aggiornate`);
  // Riga letta dal workflow per avviare la routine Claude.
  if (r.daMandareAClaude.length) console.log(`AVVIA_CLAUDE ${r.daMandareAClaude.join(',')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Controlli falliti: ${e?.message ?? e}`);
    process.exit(1);
  });
}
