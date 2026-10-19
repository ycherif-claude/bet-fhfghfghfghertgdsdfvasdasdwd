// Giro del mattino: dalla raccolta (più le notizie di Claude) al file della giornata.
// Uso: node src/giro/giro.js [--anteprima] [--riserva]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { selezionaGiocate } from '../regole/selezione.js';
import { statoBankroll } from '../bankroll/bankroll.js';
import { giornataDi } from '../bankroll/settimana.js';
import { isoRoma, oraRoma } from '../calcio/testo.js';
import { leggiJson, erroreGiocata, erroreSegnatura } from '../build/costruisci-sito.js';
import { validaNotizie } from './notizie.js';
import { costruisciCandidati, valutaMercati } from './candidati.js';

const PARTITE_ANTEPRIMA = 5;

const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const scriviJson = (file, dati) => fs.writeFileSync(file, `${JSON.stringify(dati, null, 2)}\n`);

// Si può scrivere il file della giornata? No se è in uso: una giocata segnata o una partita iniziata.
export function puoScrivere(fileEsistente, segnature, adesso, modo) {
  if (!fileEsistente) return { ok: true };
  if (fileEsistente.esempio === true) return { ok: true };
  const vuoto = (k) => !Array.isArray(fileEsistente[k]) || fileEsistente[k].length === 0;
  // Un giro di Claude senza candidati né giocate (raccolta mancante) si può sostituire, anche dalla riserva.
  if (fileEsistente.giro === 'claude' && modo === 'riserva' && !(vuoto('candidati') && vuoto('giocate'))) {
    return { ok: false, motivo: 'la giornata viene dal giro di Claude: la riserva non la sostituisce' };
  }
  const voci = [];
  for (const g of Array.isArray(fileEsistente.giocate) ? fileEsistente.giocate : []) {
    if (!oggetto(g)) continue;
    voci.push(g);
    if (Array.isArray(g.gambe)) voci.push(...g.gambe.filter(oggetto));
  }
  voci.push(...(Array.isArray(fileEsistente.candidati) ? fileEsistente.candidati.filter(oggetto) : []));
  const ids = new Set(voci.map((v) => v.id).filter((id) => typeof id === 'string'));
  if ((segnature ?? []).some((s) => ids.has(s?.idGiocata))) return { ok: false, motivo: 'una giocata ha già una segnatura' };
  const t = adesso.getTime();
  if (voci.some((v) => Date.parse(v.inizio) <= t)) return { ok: false, motivo: 'una partita è già iniziata' };
  return { ok: true };
}

function leggiRaccolta(dirData, oggi) {
  const rel = `data/raccolta/${oggi}.json`;
  const file = path.join(dirData, 'raccolta', `${oggi}.json`);
  if (!fs.existsSync(file)) return { raccolta: null, errore: `Raccolta di oggi mancante: ${rel}` };
  let r;
  try {
    r = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { raccolta: null, errore: `Raccolta di oggi illeggibile: ${rel} (${e.message})` };
  }
  if (!oggetto(r) || !Array.isArray(r.partite)) return { raccolta: null, errore: `Raccolta di oggi illeggibile: ${rel} (manca l'elenco delle partite)` };
  if (r.data !== oggi) return { raccolta: null, errore: `Raccolta di oggi mancante: ${rel} (il file è del ${r.data})` };
  return { raccolta: r, errore: null };
}

function leggiNotizie(dirData, oggi, raccolta) {
  const rel = `data/raccolta/${oggi}-notizie.json`;
  const file = path.join(dirData, 'raccolta', `${oggi}-notizie.json`);
  if (!fs.existsSync(file)) throw new Error(`File notizie mancante: ${rel}`);
  let notizie;
  try {
    notizie = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`File notizie illeggibile: ${rel} (${e.message})`);
  }
  const errori = validaNotizie(notizie, raccolta);
  if (errori.length) {
    const e = new Error(`Notizie non valide in ${rel}, nessun file scritto:\n${errori.map((x) => `- ${x}`).join('\n')}`);
    e.errori = errori;
    throw e;
  }
  return notizie;
}

// Stato del bankroll senza la giornata di oggi: giocate e segnature valide. Ogni file o voce
// ignorata finisce in `avvisi` ("Bankroll: <file> ignorato (<errore>)"): mai uno scarto silenzioso.
function statoPrecedente(dirData, oggi, adesso) {
  const scarti = [];
  const avvisi = [];
  const avvisa = (file, errore) => avvisi.push(`Bankroll: ${file} ignorato (${errore})`);
  const giornate = leggiJson(dirData, 'giornate', scarti)
    .filter(({ file, contenuto }) => contenuto.data !== oggi && file !== `giornate/${oggi}.json`);
  const giocate = [];
  for (const { file, contenuto } of giornate) {
    if (!Array.isArray(contenuto.giocate)) { avvisa(file, 'giornata senza giocate'); continue; }
    for (const g of contenuto.giocate) {
      const motivo = erroreGiocata(g);
      if (motivo) avvisa(file, motivo);
      else giocate.push(g);
    }
  }
  const lette = leggiJson(dirData, 'segnature', scarti);
  const tutte = lette.map((x) => x.contenuto);
  const valide = [];
  for (const { file, contenuto: s } of lette) {
    const motivo = erroreSegnatura(s);
    if (motivo) avvisa(file, motivo);
    else valide.push(s);
  }
  // Il file di oggi illeggibile ferma il giro più avanti: qui non si ripete.
  for (const x of scarti) if (x.file !== `giornate/${oggi}.json`) avvisa(x.file, x.errore);
  return { stato: statoBankroll(giocate, valide, adesso), segnature: tutte, avvisi };
}

const idPartiteGiocata = (g) => (Array.isArray(g.gambe) ? g.gambe.map((x) => x.idPartita) : [g.idPartita]);

function calcolaAnteprima(raccolta, stato, adesso) {
  if (!raccolta) return { partite: [], righe: [] };
  const { candidati, preScartate } = costruisciCandidati(raccolta, null, { adesso });
  const fuori = new Set(preScartate.map((s) => s.idCandidato));
  const inGara = candidati.filter((c) => !fuori.has(c.id));
  const { giocate } = selezionaGiocate(inGara, stato);
  const partite = [];
  const aggiungi = (id) => { if (!partite.includes(id)) partite.push(id); };
  giocate.forEach((g) => idPartiteGiocata(g).forEach(aggiungi));

  // Le partite successive per miglior value, anche negativo: una notizia può alzarlo.
  const migliore = new Map();
  for (const v of valutaMercati(raccolta, null, { adesso }).voci) {
    if (v.value === null) continue;
    const id = v.partita.idPartita;
    if (!migliore.has(id) || v.value > migliore.get(id)) migliore.set(id, v.value);
  }
  [...migliore].filter(([id]) => !partite.includes(id)).sort((a, b) => b[1] - a[1])
    .slice(0, PARTITE_ANTEPRIMA).forEach(([id]) => aggiungi(id));

  const righe = partite.map((id) => {
    const p = raccolta.partite.find((x) => x.idPartita === id) ?? {};
    const mercati = inGara.filter((c) => c.idPartita === id).map((c) => `${c.mercato} ${c.selezione}`);
    return { idPartita: id, partita: p.partita, inizio: p.inizio, mercati };
  });
  return { partite, righe };
}

export function eseguiGiro({ dirData, adesso, modo, anteprima = false }) {
  if (modo !== 'claude' && modo !== 'riserva') throw new Error(`Modo del giro non valido: ${modo}`);
  const oggi = giornataDi(adesso);
  const { raccolta, errore } = leggiRaccolta(dirData, oggi);
  const { stato, segnature, avvisi } = statoPrecedente(dirData, oggi, adesso);

  if (anteprima) return { scritto: false, giornata: null, anteprima: calcolaAnteprima(raccolta, stato, adesso) };

  // Le notizie servono solo se c'è la raccolta di oggi; la riserva le ignora.
  const notizie = modo === 'claude' && raccolta ? leggiNotizie(dirData, oggi, raccolta) : null;
  const { candidati, preScartate, iniziate } = raccolta
    ? costruisciCandidati(raccolta, notizie, { adesso })
    : { candidati: [], preScartate: [], iniziate: 0 };
  const fuori = new Set(preScartate.map((s) => s.idCandidato));
  const scelta = selezionaGiocate(candidati.filter((c) => !fuori.has(c.id)), stato);

  const giornata = {
    data: oggi,
    generataAlle: isoRoma(adesso),
    giro: modo,
    notizieControllate: notizie !== null,
    competizioniNonCoperte: Array.isArray(raccolta?.competizioniNonCoperte) ? raccolta.competizioniNonCoperte : [],
    candidati,
    giocate: scelta.giocate,
    scartate: [...preScartate, ...scelta.scartate],
    erroriGiro: [
      ...(Array.isArray(raccolta?.erroriGiro) ? raccolta.erroriGiro : []),
      ...(errore ? [errore] : []),
      ...(modo === 'riserva' ? ['Giro di Claude non eseguito: notizie non controllate'] : []),
      ...(iniziate > 0 ? [iniziate === 1 ? '1 partita già iniziata esclusa' : `${iniziate} partite già iniziate escluse`] : []),
      ...avvisi,
    ],
  };

  const cartella = path.join(dirData, 'giornate');
  const file = path.join(cartella, `${oggi}.json`);
  let esistente = null;
  if (fs.existsSync(file)) {
    try {
      esistente = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`Giornata di oggi illeggibile: data/giornate/${oggi}.json (${e.message}); non la sovrascrivo`);
    }
    if (!oggetto(esistente)) throw new Error(`Giornata di oggi illeggibile: data/giornate/${oggi}.json; non la sovrascrivo`);
  }

  const verdetto = puoScrivere(esistente, segnature, adesso, modo);
  if (!verdetto.ok) {
    const riga = `Giro ${modo} delle ${oraRoma(adesso)} non applicato: giornata già in uso`;
    const errori = Array.isArray(esistente.erroriGiro) ? esistente.erroriGiro : [];
    if (!errori.includes(riga)) scriviJson(file, { ...esistente, erroriGiro: [...errori, riga] });
    return { scritto: false, giornata, motivo: verdetto.motivo };
  }
  fs.mkdirSync(cartella, { recursive: true });
  scriviJson(file, giornata);
  return { scritto: true, giornata };
}

function principale() {
  const argomenti = process.argv.slice(2);
  const ignoti = argomenti.filter((a) => a !== '--anteprima' && a !== '--riserva');
  if (ignoti.length) {
    console.error(`Opzione sconosciuta: ${ignoti.join(' ')}\nUso: node src/giro/giro.js [--anteprima] [--riserva]`);
    process.exit(1);
  }
  const modo = argomenti.includes('--riserva') ? 'riserva' : 'claude';
  const anteprima = argomenti.includes('--anteprima');
  let r;
  try {
    r = eseguiGiro({ dirData: path.resolve('data'), adesso: new Date(), modo, anteprima });
  } catch (e) {
    console.error(`Giro fallito: ${e?.message ?? e}`);
    process.exit(1);
  }
  if (anteprima) {
    if (!r.anteprima.righe.length) console.log('Anteprima: nessuna partita (raccolta di oggi mancante o vuota)');
    for (const x of r.anteprima.righe) {
      console.log(`${x.idPartita} · ${x.partita} · ${x.inizio} · ${x.mercati.length ? x.mercati.join(', ') : 'nessun mercato in gara'}`);
    }
    return;
  }
  const g = r.giornata;
  if (r.scritto) {
    console.log(`Giornata ${g.data} scritta (giro ${modo}): ${g.candidati.length} candidati, ${g.giocate.length} giocate, ${g.scartate.length} scartate`);
  } else {
    console.log(`Giornata ${g.data} non modificata: ${r.motivo}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principale();
