// Giro serale NBA (spec §3.1): orario del controllo, quote fresche, decisioni di Claude
// (confermata / modificata / annullata) e avviso se il controllo non è stato eseguito.
// Uso: node src/nba/serale.js --quando | --quote | --applica | --scaduto
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { giornataDi } from '../bankroll/settimana.js';
import { quotaMinima, probValida } from '../regole/value.js';
import { finestraGiornata, isoRoma, oraRoma, slug } from '../calcio/testo.js';
import { leggiJson, erroreSegnatura } from '../build/costruisci-sito.js';
import { probUsata } from '../giro/candidati.js';
import { sportsgameodds } from './fonti/sportsgameodds.js';
import { consensoNba, quotaMedianaNba } from './quote.js';

const EPS = 1e-9;
const N = CONFIG.nba;
const { correzioneMax, probMin, probMax } = CONFIG.calcio;
const STATI = new Set(['confermata', 'modificata', 'annullata']);
export const MOTIVO_SCADUTO = 'controllo serale non eseguito';

const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const numerico = (x) => typeof x === 'number' && Number.isFinite(x);
const testoPieno = (x) => typeof x === 'string' && x.trim() !== '';
const numero = (n) => String(Math.round(n * 1e6) / 1e6);
const scriviJson = (file, dati) => fs.writeFileSync(file, `${JSON.stringify(dati, null, 2)}\n`);

// --- giocate NBA della giornata ---

const multipla = (g) => Array.isArray(g?.gambe);
const singolaNba = (g) => oggetto(g) && !multipla(g) && g.sport === 'nba';
const multiplaNba = (g) => oggetto(g) && multipla(g) && g.gambe.some((x) => x?.sport === 'nba');
const giocataNba = (g) => singolaNba(g) || multiplaNba(g);
const giocateNba = (giornata) => (Array.isArray(giornata?.giocate) ? giornata.giocate.filter(giocataNba) : []);
const iniziata = (g, adesso) => !(Date.parse(g.inizio) > adesso.getTime());

// Inizi delle partite NBA di una giocata (le gambe NBA, per le multiple).
const iniziNba = (g) => (multipla(g) ? g.gambe.filter((x) => x?.sport === 'nba') : [g])
  .map((x) => Date.parse(x.inizio)).filter(Number.isFinite);

// Istante delle HH:MM di Roma del giorno `data` (ora legale compresa).
export function istanteRoma(data, hhmm) {
  const [y, m, g] = data.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  for (const offset of [1, 2]) {
    const d = new Date(Date.UTC(y, m - 1, g, h - offset, mi));
    if (isoRoma(d).startsWith(`${data}T${hhmm}`)) return d;
  }
  throw new Error(`Orario non valido: ${data} ${hhmm}`);
}

// Orario del giro serale, oppure null se non ci sono giocate NBA non annullate.
export function orarioSerale(giornata, data) {
  const inizi = giocateNba(giornata).filter((g) => g.stato !== 'annullata').flatMap(iniziNba);
  if (!inizi.length) return null;
  const prima = Math.min(...inizi);
  if (prima < istanteRoma(data, N.sogliaAnticipo).getTime()) {
    const minimo = istanteRoma(data, N.serale.oraMinima).getTime();
    return new Date(Math.max(prima - N.anticipoMinuti * 60000, minimo));
  }
  return istanteRoma(data, N.oraSerale);
}

// Vero se l'orario è entro 60 minuti (o passato), c'è ancora una giocata NBA da controllare
// e il giro di oggi non è già stato avviato.
export function daAvviare(giornata, data, adesso, statoSerale) {
  if (statoSerale?.avviatoAlle) return false;
  const orario = orarioSerale(giornata, data);
  if (!orario) return false;
  if (!giocateNba(giornata).some((g) => g.stato !== 'annullata' && !iniziata(g, adesso))) return false;
  return adesso.getTime() >= orario.getTime() - 60 * 60000;
}

// --- quote fresche ---

// Dal mercato della giocata alle chiavi delle quote: { tipo, sel, linea } oppure null.
function chiaviQuote(g, evento) {
  if (g.mercato === 'Vincente') {
    const sel = g.selezione === evento.casa ? 'casa' : g.selezione === evento.trasferta ? 'trasferta' : null;
    return sel ? { tipo: 'vincente', sel, linea: null } : null;
  }
  let m = /^Handicap (0|[+-]\d+(?:\.\d+)?)$/.exec(g.mercato ?? '');
  if (m && (g.selezione === 'casa' || g.selezione === 'trasferta')) return { tipo: 'handicap', sel: g.selezione, linea: Number(m[1]) };
  m = /^Totale punti (\d+(?:\.\d+)?)$/.exec(g.mercato ?? '');
  const lato = /^(Over|Under) /.exec(g.selezione ?? '')?.[1];
  if (m && lato) return { tipo: 'totale', sel: lato.toLowerCase(), linea: Number(m[1]) };
  return null;
}

// Consenso e quota mediana freschi per la stessa linea della giocata (null se mancano).
function fresco(g, quote) {
  const evento = (Array.isArray(quote?.partite) ? quote.partite : []).find((p) => p?.idPartita === g.idPartita);
  if (!evento || !Array.isArray(evento.bookmaker)) return { consensoFresco: null, quotaFresca: null };
  const k = chiaviQuote(g, evento);
  if (!k) return { consensoFresco: null, quotaFresca: null };
  return {
    consensoFresco: consensoNba(evento, k.tipo, k.linea)?.[k.sel] ?? null,
    quotaFresca: quotaMedianaNba(evento, k.tipo, k.sel, k.linea)?.quota ?? null,
  };
}

const singoleNba = (giornata) => giocateNba(giornata).flatMap((g) => (multipla(g) ? g.gambe.filter((x) => x?.sport === 'nba') : [g]));

// Quote fresche delle sole partite delle giocate NBA: una chiamata a SportsGameOdds.
export async function scaricaQuoteSerali({ data, adesso, fonti, chiavi, giornata }) {
  const erroriGiro = [];
  const out = { data, scaricateAlle: isoRoma(adesso), crediti: { sportsgameodds: { oggetti: 0 } }, erroriGiro, partite: [], giocate: [] };
  const singole = singoleNba(giornata);
  const ids = new Set(singole.map((g) => g.idPartita));
  if (!chiavi?.sportsgameodds) {
    erroriGiro.push('Manca la chiave SPORTSGAMEODDS_API_KEY: quote serali non scaricate');
  } else if (ids.size) {
    try {
      const eventi = await fonti.sportsgameodds.eventi(finestraGiornata(data), { chiave: chiavi.sportsgameodds });
      out.crediti.sportsgameodds.oggetti = eventi.length;
      for (const e of eventi) {
        const idPartita = `nba-${data}-${slug(e.casa)}-${slug(e.trasferta)}`;
        if (ids.has(idPartita)) out.partite.push({ idPartita, ...e });
      }
    } catch (e) {
      erroriGiro.push(`SportsGameOdds alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
    }
  }
  const viste = new Set();
  for (const g of singole) {
    if (viste.has(g.id)) continue;
    viste.add(g.id);
    out.giocate.push({ idGiocata: g.id, idPartita: g.idPartita, mercato: g.mercato, selezione: g.selezione, ...fresco(g, out) });
  }
  return out;
}

// --- decisioni ---

// Elenco degli errori (vuoto se va tutto bene). `adesso` decide quali partite sono già iniziate.
export function validaDecisioni(dec, giornata, adesso = new Date()) {
  const errori = [];
  if (!oggetto(dec)) return ['Il file decisioni non contiene un oggetto'];
  if (typeof dec.controllateAlle !== 'string' || !Number.isFinite(Date.parse(dec.controllateAlle))) {
    errori.push('controllateAlle mancante o non valido (serve un orario ISO, per esempio 2026-10-20T21:25:00+02:00)');
  }
  if (!Array.isArray(dec.decisioni)) {
    errori.push('decisioni deve essere un elenco');
    return errori;
  }
  const nba = new Map(giocateNba(giornata).map((g) => [g.id, g]));
  const viste = new Set();
  dec.decisioni.forEach((d, i) => {
    const nome = `Decisione ${i + 1} (${d?.idGiocata})`;
    const err = (motivo) => errori.push(`${nome}: ${motivo}`);
    if (!oggetto(d)) return err('non è un oggetto');
    const g = nba.get(d.idGiocata);
    if (!g) return err('non è una giocata NBA della giornata');
    if (viste.has(d.idGiocata)) return err('più di una decisione per la stessa giocata');
    viste.add(d.idGiocata);
    if (!STATI.has(d.stato)) return err(`stato non valido: ${d.stato} (confermata, modificata o annullata)`);
    if (!testoPieno(d.motivo)) err('motivo mancante');
    if (!testoPieno(d.fonte)) err('fonte mancante');
    if (d.delta === undefined) return undefined;
    if (d.stato !== 'modificata') return err('delta solo con "modificata"');
    if (multipla(g)) return err('una multipla non si corregge: niente delta, solo lo stato');
    if (!numerico(d.delta)) return err('delta non numerico');
    if (Math.abs(d.delta) > correzioneMax + EPS) return err(`delta ${numero(d.delta)} oltre il massimo di ±${correzioneMax}`);
    if (!numerico(g.probModello)) return err('probabilità del modello assente: non si può correggere');
    const nuova = g.probModello + d.delta;
    if (nuova < probMin - EPS || nuova > probMax + EPS) {
      err(`il modello passerebbe da ${numero(g.probModello)} a ${numero(nuova)}, fuori dall'intervallo ${probMin}–${probMax}`);
    }
    return undefined;
  });
  for (const g of nba.values()) {
    if (!iniziata(g, adesso) && !viste.has(g.id)) errori.push(`manca la decisione per ${g.id}`);
  }
  return errori;
}

// --- lettura dei file ---

function leggi(file, rel, { obbligatorio = true } = {}) {
  if (!fs.existsSync(file)) {
    if (obbligatorio) throw new Error(`File mancante: ${rel}`);
    return null;
  }
  let x;
  try {
    x = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`File illeggibile: ${rel} (${e.message})`);
  }
  if (!oggetto(x)) throw new Error(`File illeggibile: ${rel} (non contiene un oggetto)`);
  return x;
}

const percorsi = (dirData, data) => ({
  giornata: [path.join(dirData, 'giornate', `${data}.json`), `data/giornate/${data}.json`],
  decisioni: [path.join(dirData, 'raccolta', `${data}-serale-nba.json`), `data/raccolta/${data}-serale-nba.json`],
  quote: [path.join(dirData, 'raccolta', `${data}-serale-quote.json`), `data/raccolta/${data}-serale-quote.json`],
  stato: [path.join(dirData, 'raccolta', `${data}-serale-stato.json`), `data/raccolta/${data}-serale-stato.json`],
  nba: [path.join(dirData, 'raccolta', `${data}-nba.json`), `data/raccolta/${data}-nba.json`],
});

// Giocate già segnate come fatte: ultima segnatura valida (per `ora`), letta come la build.
function giaSegnate(dirData) {
  const ultima = new Map();
  for (const { contenuto: s } of leggiJson(dirData, 'segnature', [])) {
    if (erroreSegnatura(s)) continue;
    const prec = ultima.get(s.idGiocata);
    if (!prec || Date.parse(s.ora) >= Date.parse(prec.ora)) ultima.set(s.idGiocata, s);
  }
  return new Set([...ultima.values()].filter((s) => s.fatta === true).map((s) => s.idGiocata));
}

// Peso del modello: dalla giocata, poi dalla partita della raccolta NBA del mattino, poi 0,5.
function pesoDi(g, raccoltaNba) {
  if (numerico(g.pesoModello)) return g.pesoModello;
  const p = (Array.isArray(raccoltaNba?.partite) ? raccoltaNba.partite : []).find((x) => x?.idPartita === g.idPartita);
  return numerico(p?.pesoModello) ? p.pesoModello : N.pesoModello;
}

const clamp = (p) => Math.min(probMax, Math.max(probMin, p));

// Applica le decisioni di Claude alla giornata di oggi. Nessuna scrittura se qualcosa non va.
export function applicaSerale({ dirData, adesso }) {
  const data = giornataDi(adesso);
  const f = percorsi(dirData, data);
  const giornata = leggi(...f.giornata);
  if (!Array.isArray(giornata.giocate)) throw new Error(`Giornata senza giocate: ${f.giornata[1]}`);
  const dec = leggi(...f.decisioni);
  const quote = leggi(...f.quote, { obbligatorio: false });
  const raccoltaNba = leggi(...f.nba, { obbligatorio: false });
  const avvisi = quote ? [] : [`Quote serali mancanti (${f.quote[1]}): si usa il consenso del mattino`];

  const errori = validaDecisioni(dec, giornata, adesso);
  if (errori.length) {
    const e = new Error(`Decisioni serali non valide in ${f.decisioni[1]}, nessun file scritto:\n${errori.map((x) => `- ${x}`).join('\n')}`);
    e.errori = errori;
    throw e;
  }

  const segnate = giaSegnate(dirData);
  const perId = new Map(dec.decisioni.map((d) => [d.idGiocata, d]));
  const ora = isoRoma(adesso);
  let cambiate = 0;
  const giocate = giornata.giocate.map((g) => {
    const d = giocataNba(g) ? perId.get(g.id) : null;
    if (!d || iniziata(g, adesso)) return g;
    const nuovo = { stato: d.stato, motivoStato: `${d.motivo} (${d.fonte})` };
    if (d.stato === 'modificata' && !multipla(g) && !segnate.has(g.id)) {
      const { consensoFresco } = fresco(g, quote);
      const mercato = consensoFresco ?? g.probPinnacle;
      const modello = numerico(g.probModello) ? clamp(g.probModello + (d.delta ?? 0)) : null;
      const prob = probUsata(modello, mercato, pesoDi(g, raccoltaNba));
      if (!probValida(prob)) throw new Error(`Giocata ${g.id}: probabilità non valida dopo la modifica, nessun file scritto`);
      nuovo.prob = prob;
      nuovo.quotaMinima = quotaMinima({ ...g, prob }, g.tipo);
    }
    if (Object.entries(nuovo).every(([k, v]) => g[k] === v)) return g;
    cambiate++;
    return { ...g, ...nuovo, oraUltimoControllo: ora };
  });
  if (cambiate) scriviJson(f.giornata[0], { ...giornata, giocate });
  return { cambiate, avvisi };
}

// Dopo l'orario serale più `ritardoAvvisoOre`, senza decisioni: avviso sulle giocate NBA non iniziate.
export function segnaScaduto({ dirData, adesso }) {
  const data = giornataDi(adesso);
  const f = percorsi(dirData, data);
  const giornata = leggi(...f.giornata, { obbligatorio: false });
  if (!giornata || !Array.isArray(giornata.giocate)) return { cambiate: 0 };
  const orario = orarioSerale(giornata, data);
  if (!orario || fs.existsSync(f.decisioni[0])) return { cambiate: 0 };
  if (adesso.getTime() < orario.getTime() + N.serale.ritardoAvvisoOre * 3600000) return { cambiate: 0 };
  let cambiate = 0;
  const giocate = giornata.giocate.map((g) => {
    if (!giocataNba(g) || iniziata(g, adesso) || g.motivoStato === MOTIVO_SCADUTO) return g;
    cambiate++;
    return { ...g, motivoStato: MOTIVO_SCADUTO };
  });
  if (cambiate) scriviJson(f.giornata[0], { ...giornata, giocate });
  return { cambiate };
}

// --- riga di comando ---

const USO = 'Uso: node src/nba/serale.js --quando | --quote | --applica | --scaduto';

async function principale() {
  const argomenti = process.argv.slice(2);
  const comandi = ['--quando', '--quote', '--applica', '--scaduto'];
  if (argomenti.length !== 1 || !comandi.includes(argomenti[0])) {
    console.error(USO);
    process.exit(1);
  }
  // SERALE_ADESSO e SERALE_DIR_DATA servono solo ai test.
  const adesso = process.env.SERALE_ADESSO ? new Date(process.env.SERALE_ADESSO) : new Date();
  const dirData = process.env.SERALE_DIR_DATA ? path.resolve(process.env.SERALE_DIR_DATA) : path.resolve('data');
  const data = giornataDi(adesso);
  const f = percorsi(dirData, data);
  const comando = argomenti[0];

  if (comando === '--quando') {
    // Solo lettura. Un file illeggibile vale come assente: si aspetta.
    let risposta = 'attendi';
    try {
      const giornata = leggi(...f.giornata, { obbligatorio: false });
      const stato = leggi(...f.stato, { obbligatorio: false });
      if (giornata && daAvviare(giornata, data, adesso, stato)) risposta = 'avvia';
    } catch (e) {
      console.error(`Giro serale: ${e.message}`);
    }
    console.log(risposta);
    return;
  }
  if (comando === '--quote') {
    let giornata = null;
    try { giornata = leggi(...f.giornata); } catch (e) { console.error(e.message); }
    const quote = await scaricaQuoteSerali({
      data, adesso, fonti: { sportsgameodds }, chiavi: { sportsgameodds: process.env.SPORTSGAMEODDS_API_KEY }, giornata,
    });
    if (!giornata) quote.erroriGiro.push(`Giornata di oggi mancante o illeggibile: ${f.giornata[1]}`);
    fs.mkdirSync(path.dirname(f.quote[0]), { recursive: true });
    scriviJson(f.quote[0], quote);
    console.log(`Quote serali ${data}: ${quote.partite.length} partite, ${quote.erroriGiro.length} errori`);
    for (const e of quote.erroriGiro) console.log(`- ${e}`);
    return;
  }
  if (comando === '--applica') {
    const r = applicaSerale({ dirData, adesso });
    for (const a of r.avvisi) console.log(a);
    console.log(`Giro serale ${data}: ${r.cambiate} giocate aggiornate`);
    return;
  }
  const r = segnaScaduto({ dirData, adesso });
  console.log(`Controllo serale scaduto ${data}: ${r.cambiate} giocate segnalate`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Giro serale fallito: ${e?.message ?? e}`);
    process.exit(1);
  });
}
