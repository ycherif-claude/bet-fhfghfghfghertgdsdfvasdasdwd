// Giro della sera prima, tennis (spec §3.1): le partite notturne (dall'orario serale alle 08:00 di Roma)
// si aggiungono alla giornata di oggi senza mai cambiare le giocate già proposte.
// Uso: node src/tennis/serale.js --raccolta | --conta | --errori | --aggiungi
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { selezionaGiocate } from '../regole/selezione.js';
import { statoBankroll, giocateConProva } from '../bankroll/bankroll.js';
import { giornataDi } from '../bankroll/settimana.js';
import { finestraGiornata, oraRoma } from '../calcio/testo.js';
import { leggiJson, erroreGiocata, erroreSegnatura } from '../build/costruisci-sito.js';
import { validaNotizie } from '../giro/notizie.js';
import { costruisciCandidati } from '../giro/candidati.js';
import { istanteRoma, orarioSerale } from '../nba/serale.js';
import { budgetSerale, raccogliTennis, raccoltaDiErrore } from './raccolta.js';
import { oddsTennis } from './fonti/odds-tennis.js';
import { conStoricoLocale, tennisData } from './fonti/tennis-data.js';

export const MOTIVO_MULTIPLA = 'nessuna multipla nel giro serale';
export const MOTIVO_LIMITE_SINGOLE = 'limite giornaliero singole';

const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const elenco = (x) => (Array.isArray(x) ? x : []);
const cent = (n) => Math.round(n * 100) / 100;
const multipla = (g) => Array.isArray(g?.gambe);
const scriviJson = (file, dati) => fs.writeFileSync(file, `${JSON.stringify(dati, null, 2)}\n`);

const percorsi = (dirData, data) => ({
  giornata: [path.join(dirData, 'giornate', `${data}.json`), `data/giornate/${data}.json`],
  serale: [path.join(dirData, 'raccolta', `${data}-serale-tennis.json`), `data/raccolta/${data}-serale-tennis.json`],
  notizie: [path.join(dirData, 'raccolta', `${data}-serale-tennis-notizie.json`), `data/raccolta/${data}-serale-tennis-notizie.json`],
});

// Oggetto JSON del file, null se manca. `nome` per i messaggi ("Giornata di oggi", "Raccolta serale tennis").
function leggi([file, rel], nome) {
  if (!fs.existsSync(file)) return null;
  let x;
  try {
    x = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${nome} illeggibile: ${rel} (${e.message})`);
  }
  if (!oggetto(x)) throw new Error(`${nome} illeggibile: ${rel} (non contiene un oggetto)`);
  return x;
}

// Dall'orario del giro serale alle 08:00 di Roma del giorno dopo `data`.
export function finestraNotturna(data, orario) {
  return { da: new Date(orario.getTime()), a: finestraGiornata(data).a };
}

// Orario del giro serale: quello dell'NBA se ci sono giocate NBA, altrimenti le 22:00.
const orarioDi = (giornata, data) => (giornata ? orarioSerale(giornata, data) : null) ?? istanteRoma(data, CONFIG.nba.oraSerale);

const idPartiteCandidate = (giornata) => new Set(elenco(giornata?.candidati).filter(oggetto).map((c) => c.idPartita));

// Raccolta serale: solo le partite della finestra notturna (mai prima di adesso) non già fra i
// candidati della giornata; 1 credito per torneo con partite notturne, mai sotto la riserva.
// Scrive data/raccolta/<data>-serale-tennis.json e la restituisce.
export async function raccoltaSeraleTennis({ data, adesso, orario = null, fonti, chiavi, dirData = 'data' }) {
  const f = percorsi(dirData, data);
  let giornata = null;
  let raccolta;
  try {
    giornata = leggi(f.giornata, 'Giornata di oggi');
    const notte = finestraNotturna(data, orario ?? orarioDi(giornata, data));
    // Una partita già iniziata bloccherebbe l'aggiunta: la finestra parte al più presto da adesso.
    const finestra = { da: new Date(Math.max(notte.da.getTime(), adesso.getTime())), a: notte.a };
    raccolta = await raccogliTennis({
      data, adesso, fonti, chiavi, dirData, finestra, calcolaBudget: budgetSerale, escludi: idPartiteCandidate(giornata),
    });
  } catch (e) {
    raccolta = raccoltaDiErrore(data, adesso, e);
  }
  fs.mkdirSync(path.dirname(f.serale[0]), { recursive: true });
  scriviJson(f.serale[0], raccolta);
  return raccolta;
}

// Numero di partite nel file serale (0 se manca o è illeggibile). Serve al workflow.
export function partiteNotturne(dirData, data) {
  try {
    return elenco(leggi(percorsi(dirData, data).serale, 'Raccolta serale tennis')?.partite).length;
  } catch {
    return 0;
  }
}

// Errori della raccolta serale nella giornata di oggi (una riga ciascuno, mai ripetuta), anche con
// zero partite notturne: il workflow li salva subito, prima e indipendentemente dall'avvio della routine.
// Raccolta mancante o illeggibile: una riga con il motivo. Non lancia mai: l'NBA va avanti.
export function erroriSeraleTennis({ dirData, adesso }) {
  const data = giornataDi(adesso);
  const f = percorsi(dirData, data);
  let giornata;
  try {
    giornata = leggi(f.giornata, 'Giornata di oggi');
  } catch (e) {
    return { aggiunti: 0, avvisi: [`${e.message}: errori serali tennis non salvati`] };
  }
  if (!giornata) return { aggiunti: 0, avvisi: [`Giornata di oggi mancante: ${f.giornata[1]}, errori serali tennis non salvati`] };
  const fonte = `Tennis serale alle ${oraRoma(adesso)}`;
  let righe;
  try {
    const serale = leggi(f.serale, 'Raccolta serale tennis');
    righe = serale
      ? elenco(serale.erroriGiro).filter((e) => typeof e === 'string')
      : [`${fonte}: raccolta serale mancante (${f.serale[1]})`];
  } catch (e) {
    righe = [`${fonte}: ${e.message}`];
  }
  const erroriGiro = elenco(giornata.erroriGiro);
  const nuovi = [...new Set(righe.filter((e) => !erroriGiro.includes(e)))];
  if (nuovi.length) scriviJson(f.giornata[0], { ...giornata, erroriGiro: [...erroriGiro, ...nuovi] });
  return { aggiunti: nuovi.length, avvisi: [] };
}

// Stato del bankroll su tutte le giornate, compresa quella di oggi (le segnate di oggi contano),
// più le proposte di oggi non annullate e non ancora segnate, contate come già giocate.
function statoCorretto(dirData, giornata, adesso) {
  const scarti = [];
  const avvisi = [];
  const avvisa = (file, errore) => avvisi.push(`Bankroll: ${file} ignorato (${errore})`);
  const giocate = [];
  for (const { file, contenuto } of leggiJson(dirData, 'giornate', scarti)) {
    if (!Array.isArray(contenuto.giocate)) { avvisa(file, 'giornata senza giocate'); continue; }
    // Le giornate di prova contano come prova anche se scritte prima del campo per giocata.
    for (const g of giocateConProva(contenuto)) {
      const motivo = erroreGiocata(g);
      if (motivo) avvisa(file, motivo);
      else giocate.push(g);
    }
  }
  const segnature = [];
  for (const { file, contenuto: s } of leggiJson(dirData, 'segnature', scarti)) {
    const motivo = erroreSegnatura(s);
    if (motivo) avvisa(file, motivo);
    else segnature.push(s);
  }
  for (const x of scarti) avvisa(x.file, x.errore);
  const stato = statoBankroll(giocate, segnature, adesso);
  const segnate = new Set(segnature.map((s) => s.idGiocata));
  // Le giocate di prova non occupano il tetto.
  const proposteAperte = cent(giocateConProva(giornata)
    .filter((g) => oggetto(g) && g.prova !== true && g.stato !== 'annullata' && !segnate.has(g.id))
    // Una puntata illeggibile non si sa quanto valga: per prudenza nessuna nuova giocata.
    .reduce((s, g) => s + (Number.isFinite(g.puntata?.euro) ? g.puntata.euro : Infinity), 0));
  // Giocate di oggi non valide (il bankroll le ignora) ma segnate come fatte: i soldi sono in gioco,
  // contano con la puntata reale dell'ultima segnatura (illeggibile: per prudenza nessuna nuova giocata).
  const ultima = new Map();
  for (const s of segnature) {
    const prec = ultima.get(s.idGiocata);
    if (!prec || Date.parse(s.ora) >= Date.parse(prec.ora)) ultima.set(s.idGiocata, s);
  }
  const fatteNonValide = cent(giocateConProva(giornata)
    .filter((g) => oggetto(g) && g.prova !== true && erroreGiocata(g) && ultima.get(g.id)?.fatta === true)
    .reduce((s, g) => {
      const reale = ultima.get(g.id).puntataReale;
      return s + (Number.isFinite(reale) ? reale : Infinity);
    }, 0));
  const inGiocoOggi = cent(stato.inGiocoOggi + proposteAperte + fatteNonValide);
  // Oggi già in caso C (qualche giocata con puntata fissa): le aggiunte della sera a 1 € fisso, senza tetto.
  const giornataPiena = giocateConProva(giornata).some((g) => oggetto(g) && g.prova !== true && oggetto(g.puntata) && oggetto(g.puntata.fissa));
  return {
    stato: { bankroll: stato.bankroll, inGiocoOggi, giornataPiena },
    proposteAperte,
    avvisi,
  };
}

function leggiNotizie(f, raccolta) {
  const notizie = leggi(f.notizie, 'File notizie serale tennis');
  if (!notizie) throw new Error(`File notizie mancante: ${f.notizie[1]} (serve quando ci sono partite notturne), nessun file scritto`);
  const errori = validaNotizie(notizie, raccolta);
  if (errori.length) {
    const e = new Error(`Notizie non valide in ${f.notizie[1]}, nessun file scritto:\n${errori.map((x) => `- ${x}`).join('\n')}`);
    e.errori = errori;
    throw e;
  }
  return notizie;
}

// Aggiunge le partite notturne alla giornata di oggi. Niente di ciò che c'è già cambia.
// Nessuna scrittura se qualcosa non va. { aggiunte: nuove giocate, candidati: nuovi candidati }.
export function aggiungiSeraleTennis({ dirData, adesso }) {
  const data = giornataDi(adesso);
  const f = percorsi(dirData, data);
  const giornata = leggi(f.giornata, 'Giornata di oggi');
  if (!giornata) throw new Error(`Giornata di oggi mancante: ${f.giornata[1]}, nessun file scritto`);
  for (const k of ['candidati', 'giocate', 'scartate']) {
    if (!Array.isArray(giornata[k])) throw new Error(`Giornata di oggi senza ${k}: ${f.giornata[1]}, nessun file scritto`);
  }
  const serale = leggi(f.serale, 'Raccolta serale tennis');
  if (!serale) throw new Error(`Raccolta serale tennis mancante: ${f.serale[1]}, nessun file scritto`);
  if (!Array.isArray(serale.partite)) throw new Error(`Raccolta serale tennis illeggibile: ${f.serale[1]} (manca l'elenco delle partite)`);
  if (serale.data !== data) throw new Error(`Raccolta serale tennis di un altro giorno: ${f.serale[1]} (il file è del ${serale.data})`);
  if (!serale.partite.length) return { aggiunte: 0, candidati: 0 };

  const notizie = leggiNotizie(f, serale);

  // Le partite già fra i candidati di oggi non si ripetono; quelle nuove non devono essere iniziate.
  const presenti = idPartiteCandidate(giornata);
  const t = adesso.getTime();
  const iniziate = serale.partite.filter((p) => !presenti.has(p?.idPartita) && !(Date.parse(p?.inizio) > t));
  if (iniziate.length) {
    throw new Error(`Partita notturna già iniziata, nessun file scritto: ${iniziate.map((p) => `${p.partita} (${p.inizio})`).join(', ')}`);
  }

  // Modalità prova della giornata (vedi giro.js): stesse regole larghe anche per il tennis della sera.
  const prova = giornata.prova === true;
  const { candidati, preScartate } = costruisciCandidati(serale, notizie, { adesso, senzaScartoMercato: prova });
  const esistenti = new Map(giornata.candidati.filter(oggetto).map((c) => [c.id, JSON.stringify(c)]));
  const idGiocate = new Set(giornata.giocate.filter(oggetto).flatMap((g) => [g.id, ...elenco(g.gambe).map((x) => x?.id)]));
  const nuovi = [];
  for (const c of candidati) {
    if (esistenti.has(c.id)) {
      // Rieseguire con gli stessi dati: lo stesso candidato si salta. Contenuto diverso: errore.
      if (esistenti.get(c.id) !== JSON.stringify(c)) {
        throw new Error(`Candidato ${c.id} già presente con un contenuto diverso nella giornata di oggi, nessun file scritto`);
      }
      continue;
    }
    if (presenti.has(c.idPartita)) continue;
    if (idGiocate.has(c.id)) throw new Error(`Giocata ${c.id} già presente nella giornata di oggi, nessun file scritto`);
    nuovi.push(c);
  }
  const idNuovi = new Set(nuovi.map((c) => c.id));
  const preNuove = preScartate.filter((s) => idNuovi.has(s.idCandidato));

  // Errori della raccolta serale: una riga ciascuno, mai ripetuta.
  const erroriGiro = elenco(giornata.erroriGiro);
  const nuoviErrori = [...new Set(elenco(serale.erroriGiro).filter((e) => typeof e === 'string' && !erroriGiro.includes(e)))];
  if (!nuovi.length && !nuoviErrori.length) return { aggiunte: 0, candidati: 0 };

  const { stato, avvisi } = statoCorretto(dirData, giornata, adesso);
  const fuori = new Set(preNuove.map((s) => s.idCandidato));
  const ammessi = nuovi.filter((c) => !fuori.has(c.id));
  const scartate = [...preNuove];
  // 1. Senza tetto: value, range, una giocata per partita, limiti delle singole. Le multiple si tolgono
  //    qui, prima del tetto, così non consumano il tetto giornaliero delle singole.
  const scelta = selezionaGiocate(ammessi, { bankroll: stato.bankroll, inGiocoOggi: -Infinity }, { prova });
  scartate.push(...scelta.scartate);
  // 2. Per value decrescente, una giocata alla volta: al massimo 10 singole (e speciali) nella giornata,
  //    poi il tetto giornaliero con selezionaGiocate su quella sola giocata e il residuo aggiornato:
  //    se non entra intera viene ridotta a quanto resta; se ridotta scenderebbe sotto 1 €, 1,00 € fissa
  //    (mai scartata). Giornata già piena: 1,00 € fissa senza tetto. Dati non numerici: nessuna puntata.
  const giaProposte = giornata.giocate.filter((g) => oggetto(g) && !multipla(g) && g.tipo !== 'builder').length;
  const posti = Math.max(0, (prova ? CONFIG.prova.massimiSingole : CONFIG.massimiGiornalieri.singole) - giaProposte);
  const perId = new Map(ammessi.map((c) => [c.id, c]));
  // Giocata tenuta con la puntata decisa dal secondo passaggio (ridotta o fissa se non entra intera nel residuo).
  const tenute = new Map();
  let residuo = stato;
  let singole = 0;
  for (const g of [...scelta.giocate].sort((a, b) => b.value - a.value)) {
    if (multipla(g)) { scartate.push({ idCandidato: g.id, motivo: MOTIVO_MULTIPLA }); continue; }
    if (g.tipo !== 'builder' && singole >= posti) { scartate.push({ idCandidato: g.id, motivo: MOTIVO_LIMITE_SINGOLE }); continue; }
    const una = selezionaGiocate([perId.get(g.id)], residuo, { prova });
    scartate.push(...una.scartate);
    if (!una.giocate.length) continue;
    residuo = { ...residuo, inGiocoOggi: cent(residuo.inGiocoOggi + una.giocate[0].puntata.euro) };
    if (g.tipo !== 'builder') singole++;
    tenute.set(g.id, una.giocate[0]);
  }
  // L'ordine delle giocate resta quello di selezionaGiocate.
  const nuoveGiocate = scelta.giocate.filter((g) => tenute.has(g.id)).map((g) => (prova ? { ...tenute.get(g.id), prova: true } : tenute.get(g.id)));

  scriviJson(f.giornata[0], {
    ...giornata,
    candidati: [...giornata.candidati, ...nuovi],
    giocate: [...giornata.giocate, ...nuoveGiocate],
    scartate: [...giornata.scartate, ...scartate],
    ...(nuoviErrori.length ? { erroriGiro: [...erroriGiro, ...nuoviErrori] } : {}),
  });
  return { aggiunte: nuoveGiocate.length, candidati: nuovi.length, avvisi };
}

// --- riga di comando ---

const USO = 'Uso: node src/tennis/serale.js --raccolta | --conta | --errori | --aggiungi';

async function principale() {
  const argomenti = process.argv.slice(2);
  if (argomenti.length !== 1 || !['--raccolta', '--conta', '--errori', '--aggiungi'].includes(argomenti[0])) {
    console.error(USO);
    process.exit(1);
  }
  // SERALE_ADESSO e SERALE_DIR_DATA servono solo ai test.
  const adesso = process.env.SERALE_ADESSO ? new Date(process.env.SERALE_ADESSO) : new Date();
  const dirData = process.env.SERALE_DIR_DATA ? path.resolve(process.env.SERALE_DIR_DATA) : path.resolve('data');
  const data = giornataDi(adesso);
  const comando = argomenti[0];
  if (comando === '--conta') {
    console.log(String(partiteNotturne(dirData, data)));
    return;
  }
  if (comando === '--errori') {
    const r = erroriSeraleTennis({ dirData, adesso });
    for (const a of r.avvisi) console.log(a);
    console.log(`Errori serali tennis ${data}: ${r.aggiunti} errori aggiunti alla giornata`);
    return;
  }
  if (comando === '--raccolta') {
    const r = await raccoltaSeraleTennis({
      data, adesso, fonti: { oddsTennis, tennisData: conStoricoLocale(tennisData, path.join(dirData, 'storico-tennis')) }, chiavi: { oddsApi: process.env.ODDS_API_KEY }, dirData,
    });
    console.log(`Raccolta serale tennis ${data}: ${r.partite.length} partite notturne, ${r.erroriGiro.length} errori, crediti usati ${r.crediti.usati}`);
    for (const e of r.erroriGiro) console.log(`- ${e}`);
    return;
  }
  const r = aggiungiSeraleTennis({ dirData, adesso });
  for (const a of r.avvisi ?? []) console.log(a);
  console.log(`Giro serale tennis ${data} alle ${oraRoma(adesso)}: ${r.aggiunte} giocate aggiunte, ${r.candidati} candidati nuovi`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Giro serale tennis fallito: ${e?.message ?? e}`);
    process.exit(1);
  });
}
