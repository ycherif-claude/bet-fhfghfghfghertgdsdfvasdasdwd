// Giro del mattino: dalle raccolte di tutti gli sport (più le notizie di Claude) al file della giornata.
// Uso: node src/giro/giro.js [--anteprima] [--riserva]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { selezionaGiocate } from '../regole/selezione.js';
import { statoBankroll, giocateConProva } from '../bankroll/bankroll.js';
import { giornataDi } from '../bankroll/settimana.js';
import { isoRoma, oraRoma } from '../calcio/testo.js';
import { leggiJson, erroreGiocata, erroreSegnatura } from '../build/costruisci-sito.js';
import { validaNotizie } from './notizie.js';
import { costruisciCandidati, valutaMercati } from './candidati.js';
import { costruisciMultipleBonus, gambePossibili } from '../regole/multipla-bonus.js';
import { costruisciCoppieQuota2 } from '../regole/coppie-quota2.js';
import { leggiCalibrazione, pronosticiGiornata, salvaIstantanea, avvisiPronosticiSenzaEsito } from '../regole/pronostici.js';
import { costruisciSchedinePronostici, rivediSchedine } from '../regole/schedine-pronostici.js';
import { leggiRaccolte } from './raccolte.js';
import { leggiAvvisiFonti } from '../registro/avvisi-fonti.js';
import { leggiQuoteOdss } from '../calcio/odss.js';

const PARTITE_ANTEPRIMA = 5;

const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const scriviJson = (file, dati) => fs.writeFileSync(file, `${JSON.stringify(dati, null, 2)}\n`);

// Si può scrivere il file della giornata? No se è in uso: una giocata segnata o una partita iniziata.
export function puoScrivere(fileEsistente, segnature, adesso, modo) {
  if (!fileEsistente) return { ok: true };
  if (fileEsistente.esempio === true) return { ok: true };
  const vuoto = (k) => !Array.isArray(fileEsistente[k]) || fileEsistente[k].length === 0;
  // La riserva sostituisce un giro di Claude solo se è vuoto perché mancava la raccolta di oggi.
  // Negli altri casi (il caso normale di ogni giorno) non scrive nulla: `silenzioso`.
  if (fileEsistente.giro === 'claude' && modo === 'riserva') {
    const raccoltaMancante = Array.isArray(fileEsistente.erroriGiro)
      && fileEsistente.erroriGiro.some((e) => typeof e === 'string' && e.includes('Raccolta di oggi mancante'));
    if (!(vuoto('candidati') && vuoto('giocate') && raccoltaMancante)) {
      return { ok: false, silenzioso: true, motivo: 'la giornata viene dal giro di Claude: la riserva non la sostituisce' };
    }
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
    // Giornata di prova: tutte le sue giocate sono di prova (fuori dal bankroll).
    for (const g of giocateConProva(contenuto)) {
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
  const prova = inProva(giornataDi(adesso));
  const { candidati, preScartate } = costruisciCandidati(raccolta, null, { adesso, senzaScartoMercato: prova });
  const fuori = new Set(preScartate.map((s) => s.idCandidato));
  const inGara = candidati.filter((c) => !fuori.has(c.id));
  const { giocate } = selezionaGiocate(inGara, stato, { prova });
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
    // `idCandidato: mercato | selezione`: l'id si copia così com'è in `esclusioni`.
    const mercati = inGara.filter((c) => c.idPartita === id).map((c) => `${c.id}: ${c.mercato} | ${c.selezione}`);
    return { idPartita: id, partita: p.partita, inizio: p.inizio, mercati };
  });
  return { partite, righe };
}

// Vero se la giornata è dentro la modalità prova (CONFIG.prova.da – fino, estremi compresi).
export const inProva = (data) => data >= CONFIG.prova.da && data <= CONFIG.prova.fino;

export function eseguiGiro({ dirData, adesso, modo, anteprima = false }) {
  if (modo !== 'claude' && modo !== 'riserva') throw new Error(`Modo del giro non valido: ${modo}`);
  const oggi = giornataDi(adesso);
  // Calcio e sport noti in una sola raccolta: una sola selezione, tetti comuni.
  const { raccolta, errori, lette } = leggiRaccolte(dirData, oggi);
  const { stato, segnature, avvisi } = statoPrecedente(dirData, oggi, adesso);

  if (anteprima) return { scritto: false, giornata: null, anteprima: calcolaAnteprima(raccolta, stato, adesso) };

  // Le notizie servono se c'è la raccolta calcio di oggi (come sempre) o una raccolta di un altro
  // sport con almeno una partita; si validano sulla raccolta unita. La riserva le ignora.
  const servonoNotizie = raccolta !== null && (lette.calcio || lette.partiteSport > 0);
  const notizie = modo === 'claude' && servonoNotizie ? leggiNotizie(dirData, oggi, raccolta) : null;
  const prova = inProva(oggi);
  const { candidati, preScartate, iniziate } = raccolta
    ? costruisciCandidati(raccolta, notizie, { adesso, senzaScartoMercato: prova })
    : { candidati: [], preScartate: [], iniziate: 0 };
  const fuori = new Set(preScartate.map((s) => s.idCandidato));
  const scelta = selezionaGiocate(candidati.filter((c) => !fuori.has(c.id)), stato, { prova });
  // Multiple bonus bet365 (in prova): dai mercati con quota, senza le partite escluse dalle notizie.
  const escluse = new Set((notizie?.esclusioni ?? []).filter((x) => !x.idCandidato).map((x) => x.idPartita));
  const gambeBonus = prova && raccolta ? gambePossibili(valutaMercati(raccolta, notizie, { adesso }).voci, { escluse }) : [];
  const multipleBonus = prova && raccolta ? costruisciMultipleBonus(null, { data: oggi, gambe: gambeBonus }) : [];
  // Coppie a quota 2 (prova): dalle stesse partite della multipla, per margine e, per confronto, per probabilità.
  const coppie = costruisciCoppieQuota2(gambeBonus, { data: oggi });
  // Pronostici sì/no dal solo modello (la quota serve dopo, per decidere se giocare). Quote dei bookmaker
  // italiani (idea 1): dal file scaricato dalla raccolta su GitHub (data/raccolta/<oggi>-odss.json).
  const quoteOdss = leggiQuoteOdss(dirData, oggi);
  const pronostici = raccolta ? pronosticiGiornata(raccolta, leggiCalibrazione(dirData), { adesso, escluse, odss: quoteOdss.eventi }) : [];
  const odssMancante = quoteOdss.mancante && pronostici.some((p) => p.sport === 'calcio')
    ? [`Quote dei bookmaker italiani (odss-api) mancanti: data/raccolta/${oggi}-odss.json`] : [];

  const giornata = {
    data: oggi,
    generataAlle: isoRoma(adesso),
    giro: modo,
    notizieControllate: notizie !== null,
    // Modalità prova: giocate da non giocare, solo per il database della taratura.
    ...(prova ? { prova: true } : {}),
    competizioniNonCoperte: Array.isArray(raccolta?.competizioniNonCoperte) ? raccolta.competizioniNonCoperte : [],
    candidati,
    ...(prova || pronostici.length ? { pronostici } : {}),
    // Modalità prova: ogni giocata porta `prova: true` (fuori da bankroll, da segnare e storico "fatte").
    giocate: prova ? scelta.giocate.map((g) => ({ ...g, prova: true })) : scelta.giocate,
    ...(multipleBonus.length ? { multipleBonus } : {}),
    ...(coppie.margine.length || coppie.probabilita.length ? { coppieQuota2: coppie } : {}),
    scartate: [...preScartate, ...scelta.scartate],
    erroriGiro: [
      ...(Array.isArray(raccolta?.erroriGiro) ? raccolta.erroriGiro : []),
      ...errori,
      ...(modo === 'riserva' ? ['Giro di Claude non eseguito: notizie non controllate'] : []),
      ...(iniziate > 0 ? [iniziate === 1 ? '1 partita già iniziata esclusa' : `${iniziate} partite già iniziate escluse`] : []),
      ...quoteOdss.errori,
      ...odssMancante,
      ...avvisi,
      // Pronostici dei giorni passati che il registro non è riuscito a chiudere.
      ...avvisiPronosticiSenzaEsito(dirData, oggi),
      // Avvisi dei lavori del mattino senza giornata (registro, storico coppe): per esempio ESPN in 403.
      ...leggiAvvisiFonti(dirData, oggi),
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
  if (!verdetto.ok && verdetto.silenzioso) return { scritto: false, giornata, motivo: verdetto.motivo };
  if (!verdetto.ok) {
    const riga = `Giro ${modo} delle ${oraRoma(adesso)} non applicato: giornata già in uso`;
    const errori = Array.isArray(esistente.erroriGiro) ? esistente.erroriGiro : [];
    if (!errori.includes(riga)) scriviJson(file, { ...esistente, erroriGiro: [...errori, riga] });
    return { scritto: false, giornata, motivo: verdetto.motivo };
  }
  // Giro rifatto dopo l'inizio di alcune partite [correzione C4]: i pronostici già pubblicati di quelle
  // partite restano (il nuovo giro non le propone più perché sono iniziate).
  const nuoviId = new Set(pronostici.map((p) => p.idPartita));
  const giaIniziati = (Array.isArray(esistente?.pronostici) ? esistente.pronostici : [])
    .filter((p) => oggetto(p) && !nuoviId.has(p.idPartita) && Date.parse(p.inizio) <= adesso.getTime());
  if (giaIniziati.length) {
    pronostici.push(...giaIniziati);
    pronostici.sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio));
    giornata.pronostici = pronostici;
  }
  // Avvisi delle formazioni (idea 3) già scritti dai controlli: restano sullo stesso pronostico [revisione].
  const avvisiFormazioni = new Map();
  for (const p of Array.isArray(esistente?.pronostici) ? esistente.pronostici : []) {
    for (const x of Array.isArray(p?.pronostici) ? p.pronostici : []) {
      if (oggetto(x) && typeof x.avviso === 'string' && x.avviso) avvisiFormazioni.set(`${p.idPartita}|${x.mercato}|${x.selezione}`, x.avviso);
    }
  }
  if (avvisiFormazioni.size) {
    for (const p of pronostici) {
      p.pronostici = p.pronostici.map((x) => {
        const a = avvisiFormazioni.get(`${p.idPartita}|${x.mercato}|${x.selezione}`);
        return a && !x.avviso ? { ...x, avviso: a } : x;
      });
    }
  }
  // Doppie e triple di pronostici (idea 4): restano quelle già pubblicate con una partita iniziata o con le gambe
  // ancora valide; quelle che cadono si scrivono con il motivo [revisione]. Le altre si rifanno dai pronostici
  // migliori delle partite non iniziate, senza le partite già usate.
  const t = adesso.getTime();
  const { tenute, tolte } = rivediSchedine(esistente?.schedinePronostici, pronostici, { adesso, prova });
  const schedineTolte = [
    ...(Array.isArray(esistente?.schedineTolte) ? esistente.schedineTolte : []),
    ...tolte.map((s) => ({ ...s, alle: isoRoma(adesso) })),
  ];
  if (schedineTolte.length) giornata.schedineTolte = schedineTolte;
  for (const s of tolte) {
    giornata.erroriGiro.push(`${s.tipo === 'tripla' ? 'Tripla' : 'Doppia'} di pronostici tolta dopo un nuovo giro: ${s.motivo}`);
  }
  const occupate = new Set(tenute.flatMap((s) => s.gambe.map((x) => x?.idPartita)));
  const schedinePronostici = [...tenute, ...costruisciSchedinePronostici(pronostici.filter((p) => Date.parse(p.inizio) > t), {
    data: oggi, prova, escluse: occupate, max: CONFIG.pronostici.schedine.max - tenute.length,
  })];
  if ('pronostici' in giornata || schedinePronostici.length) giornata.schedinePronostici = schedinePronostici;
  fs.mkdirSync(cartella, { recursive: true });
  scriviJson(file, giornata);
  // Istantanea dei pronostici pubblicati: il registro li chiude da qui, anche senza la riga della raccolta.
  salvaIstantanea(dirData, oggi, pronostici, adesso, schedinePronostici);
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
