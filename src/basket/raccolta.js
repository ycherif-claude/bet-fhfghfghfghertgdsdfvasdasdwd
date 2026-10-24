// Raccolta basket del mattino (Eurolega e NBL): storico dalle fonti gratuite (salvato in data/storico),
// partite e quote da The Odds API (budget di crediti unico con calcio e tennis, che spendono per primi),
// modello NBA con le costanti di CONFIG.basket → data/raccolta/<data>-basket.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { budgetCrediti } from '../calcio/raccolta.js';
import { dataRoma, finestraGiornata, isoRoma, oraRoma, slug } from '../calcio/testo.js';
import { formattaLinea, mercatiNba, pesoModelloPartita, puntiAttesi, stimaForzeNba } from '../nba/modello.js';
import { lineaComune, quotaMedianaNba, riferimentoMercato } from '../nba/quote.js';
import { eventiOdssSport } from '../odss/sport.js';
import { abbinaEventi, femminile, inFormatoNba, legaAmmessa } from '../odss/eventi.js';
import { spiegazioneMercato } from '../nba/raccolta.js';
import { oddsBasket } from './fonti/odds-basket.js';
import { eurolega } from './fonti/eurolega.js';
import { thesportsdb } from './fonti/thesportsdb.js';
import { codiceSquadra } from './squadre.js';
import { aggiornaStorico, partiteModello, stagioneBasket } from './storico.js';
import { aggiornaEsitiBasket } from './esiti.js';

const B = CONFIG.basket;
// Riserva del 20% dei 500 crediti mensili (la stessa di budgetCrediti): mai sotto.
const RISERVA_MESE = CONFIG.calcio.riservaCrediti * 500;
const ESCLUSI = new Set(['betfair_ex_eu', 'matchbook', 'smarkets']);
const GIORNO_MS = 86400000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const decimo = (n) => Math.round(n * 10) / 10;
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

// In ordine di priorità per i crediti. `leagueOdss`: filtro league della richiesta a odss-api (sottostringa del nome);
// `legheOdss`: i soli nomi di campionato ammessi, esatti (collaudo del 23/10/2026: "NBL" porta anche "WNBL",
// "New Zealand - NBL Women", "Czech Republic - NBL"; il ceco si chiama anche solo "NBL" e lo escludono le squadre).
export const CAMPIONATI = Object.freeze([
  Object.freeze({ id: 'eurolega', chiave: 'basketball_euroleague', competizione: 'Eurolega', fonte: 'API Eurolega', pausaMs: 1000, leagueOdss: 'eurol', legheOdss: Object.freeze(['Euroleague', 'Europe - Euroleague', 'Košarka EUROLEAGUE', 'Eurolega']) }),
  Object.freeze({ id: 'nbl', chiave: 'basketball_nbl', competizione: 'NBL (Australia)', fonte: 'TheSportsDB', pausaMs: 6500, leagueOdss: 'nbl', legheOdss: Object.freeze(['NBL', 'Australia - NBL', 'Australia, NBL']) }),
]);

// Crediti di un file di raccolta di oggi: { rimasti, usati, file } | { errore } | null (file assente).
function creditiFile(dirData, data, suffisso) {
  const base = `${data}${suffisso}.json`;
  const file = join(dirData, 'raccolta', base);
  if (!existsSync(file)) return null;
  let j;
  try {
    j = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { errore: `file data/raccolta/${base} illeggibile (${e.message})` };
  }
  const c = j?.crediti;
  if (j?.data !== data || !num(c?.rimasti) || !num(c?.usati)) return { errore: `file data/raccolta/${base} senza crediti validi` };
  return { rimasti: c.rimasti, usati: c.usati, json: j };
}

// Budget del mattino: calcio e tennis spendono per primi; il basket lascia al tennis
// 1 credito per torneo di oggi per la sera (Fase 4b §3.2).
export function budgetBasket({ data, dirData, rimastiOra, errore }) {
  const calcio = creditiFile(dirData, data, '');
  const tennis = creditiFile(dirData, data, '-tennis');
  for (const [nome, f] of [['calcio', calcio], ['tennis', tennis]]) if (f?.errore) errore(`Raccolta ${nome}`, f.errore);
  const validi = [calcio, tennis].filter((f) => f && !f.errore);
  const spesi = validi.reduce((t, f) => t + f.usati, 0);
  // Crediti all'inizio della giornata: dal primo file che li ha (il calcio spende per primo).
  const primo = validi[0];
  let rimastiInizio = primo ? primo.rimasti + primo.usati : rimastiOra;
  if (!calcio && !tennis) {
    errore('Basket', 'Crediti di calcio e tennis sconosciuti: budget basket calcolato sui crediti rimasti');
  }
  if (rimastiOra === null && num(rimastiInizio)) rimastiOra = rimastiInizio - spesi;
  if (!num(rimastiInizio) || !num(rimastiOra)) {
    errore('The Odds API', 'crediti rimasti sconosciuti');
    return { budget: 0, rimastiOra: num(rimastiOra) ? rimastiOra : null };
  }
  const tornei = tennis && !tennis.errore ? new Set((tennis.json.partite ?? []).map((p) => p.competizione)).size : 0;
  const sera = CONFIG.tennis.riservaSeraPerTorneo * tornei;
  const budget = Math.max(0, Math.min(budgetCrediti(rimastiInizio, data) - spesi - sera, rimastiOra - RISERVA_MESE - sera));
  return { budget, rimastiOra };
}

// Bookmaker senza exchange, per mediana e consenso.
const senzaExchange = (ev) => ({ ...ev, bookmaker: ev.bookmaker.filter((b) => !ESCLUSI.has(b.chiave)) });

// Probabilità di riferimento di un mercato: Pinnacle senza margine sulla stessa linea,
// altrimenti il consenso dei bookmaker su quella linea; null senza nessuno dei due.
export function riferimento(evento, tipo, linea) {
  return riferimentoMercato(evento, tipo, linea, B.minBookmaker);
}

// Vero se la squadra ha giocato nei `giorniDoppioTurno` giorni prima della partita (seconda partita in 3 giorni).
export function doppioTurno(righe, squadra, giorno) {
  const t = Date.parse(`${giorno}T00:00:00Z`);
  return righe.some((x) => (x.casa === squadra || x.trasferta === squadra)
    && t - Date.parse(`${x.dataUsa}T00:00:00Z`) > 0
    && t - Date.parse(`${x.dataUsa}T00:00:00Z`) <= B.giorniDoppioTurno * GIORNO_MS);
}

function vuota(data, adesso) {
  return {
    data, generataAlle: isoRoma(adesso), crediti: { usati: 0, rimasti: null },
    competizioniNonCoperte: [], erroriGiro: [], partite: [],
  };
}

// Mercati di una partita: probabilità del modello (o null), riferimento di mercato e quota mediana.
function mercatiPartita({ ev, attesi, forze, nomi, ora, conta, fonte }) {
  const evento = senzaExchange(ev);
  const linee = { handicap: lineaComune(evento, 'handicap'), totale: lineaComune(evento, 'totale') };
  const voci = [
    { mercato: 'Vincente', selezione: nomi.casa, tipo: 'vincente', sel: 'casa', linea: null },
    { mercato: 'Vincente', selezione: nomi.trasferta, tipo: 'vincente', sel: 'trasferta', linea: null },
  ];
  if (linee.handicap !== null) {
    const nome = `Handicap ${formattaLinea(linee.handicap)}`;
    voci.push({ mercato: nome, selezione: 'casa', tipo: 'handicap', sel: 'casa', linea: linee.handicap });
    voci.push({ mercato: nome, selezione: 'trasferta', tipo: 'handicap', sel: 'trasferta', linea: linee.handicap });
  }
  if (linee.totale !== null) {
    const nome = `Totale punti ${linee.totale}`;
    voci.push({ mercato: nome, selezione: `Over ${linee.totale}`, tipo: 'totale', sel: 'over', linea: linee.totale });
    voci.push({ mercato: nome, selezione: `Under ${linee.totale}`, tipo: 'totale', sel: 'under', linea: linee.totale });
  }
  const modello = attesi ? mercatiNba(attesi, {
    handicap: linee.handicap === null ? [] : [linee.handicap],
    totale: linee.totale === null ? [] : [linee.totale],
  }, forze, nomi) : [];
  const probModello = (v) => modello.find((m) => m.mercato === v.mercato && m.selezione === v.selezione)?.probModello ?? null;

  const mercati = [];
  for (const v of voci) {
    const q = quotaMedianaNba(evento, v.tipo, v.sel, v.linea, B.minBookmaker);
    if (!q) continue;
    const rif = riferimento(ev, v.tipo, v.linea);
    // Senza riferimento di mercato il mercato si scarta, come nell'NBA.
    if (rif?.prob?.[v.sel] == null) { conta.senzaRiferimento++; continue; }
    mercati.push({
      mercato: v.mercato,
      selezione: v.selezione,
      probModello: probModello(v),
      probPinnacle: rif.prob[v.sel],
      quota: q.quota,
      fonteQuota: `mediana di ${q.n} bookmaker (${fonte})`,
      oraQuota: ora,
      frequenzaCampionato: null,
      ...(rif.etichetta === 'Pinnacle' ? {} : { etichettaMercato: rif.etichetta }),
      spiegazione: spiegazioneMercato(v.mercato, v.selezione, nomi, linee),
    });
  }
  return mercati;
}

// Raccolta di un campionato già scelto (quote pagate): partite con i loro mercati.
function partiteCampionato({ c, eventi, stato, data, ora, errore, raccolta, fonte = 'The Odds API' }) {
  const conta = { senzaRiferimento: 0, senzaQuota: 0 };
  const ignote = new Set();
  for (const ev of eventi) {
    const casa = codiceSquadra(c.id, ev.casa);
    const trasferta = codiceSquadra(c.id, ev.trasferta);
    if (!casa) ignote.add(ev.casa);
    if (!trasferta) ignote.add(ev.trasferta);
    if (!casa || !trasferta || casa === trasferta) continue;
    const nomi = { casa: ev.casa, trasferta: ev.trasferta };
    const giorno = dataRoma(new Date(ev.inizio));
    let attesi = null;
    let peso = null;
    let ragionamentoBase;
    const salvate = (s) => stato?.salvate.get(s) ?? 0;
    if (!stato) {
      ragionamentoBase = [`Storico ${c.competizione} non disponibile: probabilità solo dal mercato`];
    } else if (salvate(casa) < B.minPartiteModello || salvate(trasferta) < B.minPartiteModello) {
      ragionamentoBase = [`Meno di ${B.minPartiteModello} partite salvate per almeno una squadra: probabilità solo dal mercato`];
    } else {
      const dt = { casa: doppioTurno(stato.righe, casa, giorno), trasferta: doppioTurno(stato.righe, trasferta, giorno) };
      const a = puntiAttesi(stato.forze, casa, trasferta, { b2bCasa: dt.casa, b2bTrasferta: dt.trasferta, cfg: B });
      if (a) {
        attesi = a;
        peso = pesoModelloPartita(stato.forze, casa, trasferta, B);
        ragionamentoBase = [`Punti attesi: ${ev.casa} ${Math.round(a.casa)} – ${ev.trasferta} ${Math.round(a.trasferta)} (stagione in corso e precedente)`];
        if (dt.casa) ragionamentoBase.push(`${ev.casa} alla seconda partita in 3 giorni`);
        if (dt.trasferta) ragionamentoBase.push(`${ev.trasferta} alla seconda partita in 3 giorni`);
        if (peso === B.pesoModelloInizio) ragionamentoBase.push(`Meno di ${B.minPartiteStagione} partite in stagione per almeno una squadra: peso del modello 25%`);
      } else {
        ragionamentoBase = [`Nessun dato storico per ${ev.casa} - ${ev.trasferta}: probabilità solo dal mercato`];
      }
    }
    const mercati = mercatiPartita({ ev, attesi, forze: stato?.forze, nomi, ora, conta, fonte });
    if (!mercati.length) { conta.senzaQuota++; continue; }
    raccolta.partite.push({
      ...(Array.isArray(ev.idOdss) ? { idOdss: ev.idOdss } : {}),
      idPartita: `basket-${data}-${slug(ev.casa)}-${slug(ev.trasferta)}`,
      sport: 'basket',
      competizione: c.competizione,
      partita: `${ev.casa} - ${ev.trasferta}`,
      casa: ev.casa,
      trasferta: ev.trasferta,
      inizio: isoRoma(new Date(ev.inizio)),
      modello: attesi ? 'basket' : 'solo-pinnacle',
      lambda: null,
      puntiAttesi: attesi ? { casa: decimo(attesi.casa), trasferta: decimo(attesi.trasferta) } : null,
      pesoModello: peso,
      ragionamentoBase,
      mercati,
    });
  }
  if (ignote.size) raccolta.erroriGiro.push(`Squadre ${c.competizione} non riconosciute: ${[...ignote].join(', ')}`);
  if (conta.senzaQuota) errore(fonte, `${plurale(conta.senzaQuota, 'partita', 'partite')} senza quota utilizzabile (${c.competizione})`);
  if (conta.senzaRiferimento) errore(fonte, `${plurale(conta.senzaRiferimento, 'mercato', 'mercati')} senza Pinnacle né consenso dei bookmaker (${c.competizione})`);
}

// Storico, forze e partite salvate per squadra di un campionato; null se lo storico non c'è.
function statoCampionato(c, partite, data, erroriGiro) {
  const { righe, ignote } = partiteModello(c.id, partite);
  if (ignote.length) erroriGiro.push(`Squadre ${c.competizione} non riconosciute nello storico: ${ignote.join(', ')}`);
  if (!righe.length) return null;
  const salvate = new Map();
  for (const x of righe) for (const s of [x.casa, x.trasferta]) salvate.set(s, (salvate.get(s) ?? 0) + 1);
  const forze = stimaForzeNba(righe, { oggi: data, stagioneCorrente: stagioneBasket(data), cfg: B });
  return { righe, forze, salvate };
}

const scaricatori = (fonti) => ({
  eurolega: (s, g) => fonti.eurolega.giornata(s, g),
  nbl: (s, g) => fonti.thesportsdb.round(s, g),
});

export async function eseguiRaccoltaBasket({ data, adesso, fonti, chiavi, dirData = 'data', pausaMs }) {
  const raccolta = vuota(data, adesso);
  const { erroriGiro } = raccolta;
  const errore = (fonte, e) => erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const ora = raccolta.generataAlle;

  // 1. Storico (gratuito, anche senza chiave): serve al modello di oggi e agli esiti di ieri.
  const storici = new Map();
  const scarica = scaricatori(fonti);
  for (const c of CAMPIONATI) {
    const { partite } = await aggiornaStorico({
      campionato: c.id, nomeFonte: c.fonte, dirData, data, adesso, scarica: scarica[c.id], errore, pausaMs: pausaMs ?? c.pausaMs,
    });
    storici.set(c.id, partite);
  }
  // Non enumerabile: agli esiti, mai scritto nel JSON.
  Object.defineProperty(raccolta, 'storici', { value: storici, enumerable: false });

  if (!chiavi?.oddsApi) {
    errore('The Odds API', 'manca ODDS_API_KEY');
    return raccolta;
  }
  const opz = { chiave: chiavi.oddsApi };
  const finestra = finestraGiornata(data);
  const dentro = (e) => {
    const t = Date.parse(e.inizio);
    return t >= finestra.da.getTime() && t < finestra.a.getTime();
  };

  // 2. Eventi della giornata (gratuiti, con i crediti rimasti).
  let rimastiOra = null;
  const eventiPer = new Map();
  for (const c of CAMPIONATI) {
    try {
      const r = await fonti.oddsBasket.eventi(c.chiave, finestra, opz);
      if (rimastiOra === null && num(r.rimasti)) rimastiOra = r.rimasti;
      const eventi = (r.eventi ?? []).filter((e) => e.casa && e.trasferta && Number.isFinite(Date.parse(e.inizio)) && dentro(e));
      if (eventi.length) eventiPer.set(c.id, eventi);
    } catch (e) {
      // 404/422: campionato fermo (fuori stagione) → nessuna partita, non è un errore.
      if (e?.status === 404 || e?.status === 422) continue;
      errore(`The Odds API (${c.competizione})`, e);
    }
  }
  const tuttiConEventi = CAMPIONATI.filter((c) => eventiPer.has(c.id));
  if (!tuttiConEventi.length) {
    raccolta.crediti.rimasti = rimastiOra;
    return raccolta;
  }

  // 2b. Quote di odss-api (fonte principale) [utente, 22/10/2026]: una richiesta per campionato con partite (filtro
  // league), squadre abbinate con le tabelle del basket, partite femminili fuori. Un campionato senza partite su odss
  // (o tutti, se odss non risponde) torna a The Odds API.
  const daOdss = new Map();
  // Campionati coperti solo in parte da odss: The Odds API riempie le partite mancanti (mai sopra odss).
  const parziali = new Set();
  const stati = new Map();
  const statoDi = (c) => { if (!stati.has(c.id)) stati.set(c.id, statoCampionato(c, storici.get(c.id), data, erroriGiro)); return stati.get(c.id); };
  if (Object.hasOwn(chiavi, 'odss')) {
    for (const c of tuttiConEventi) {
      const o = await eventiOdssSport({
        dirData, data, adesso, chiave: chiavi.odss, sport: 'basket', budgetSport: 'basket', gruppi: ['moneyline,ah,ou'],
        league: c.leagueOdss, finestra, fetch: fonti.fetchOdss, attesaMs: fonti.attesaOdssMs, nome: c.competizione,
      });
      erroriGiro.push(...o.errori);
      const codice = (x) => codiceSquadra(c.id, x);
      const stesso = (a, b) => Boolean(codice(a)) && codice(a) === codice(b);
      const nostri = eventiPer.get(c.id);
      const abbinati = abbinaEventi(nostri, (o.eventi ?? []).filter((e) => !femminile(e) && legaAmmessa(e.campionato, c.legheOdss)), { stesso });
      let storti = 0;
      const conQuote = nostri.filter((e) => abbinati.has(e.id)).map((e) => {
        const f = inFormatoNba(abbinati.get(e.id).evento);
        if (f.handicapScartato) storti++;
        return { ...e, bookmaker: f.bookmaker, idOdss: String(abbinati.get(e.id).evento.id).split(',') };
      }).filter((e) => e.bookmaker.length);
      if (storti) errore('odss-api', `${plurale(storti, 'handicap scartato', 'handicap scartati')}: linea della casa con il verso opposto al vincente (${c.competizione})`);
      if (conQuote.length) {
        daOdss.set(c.id, conQuote);
        if (conQuote.length < nostri.length) {
          parziali.add(c.id);
          erroriGiro.push(`Quote ${c.competizione}: ${nostri.length - conQuote.length} partite su ${nostri.length} non trovate su odss-api, quote da The Odds API`);
        }
      } else {
        erroriGiro.push(`Quote ${c.competizione}: nessuna partita su odss-api, quote da The Odds API`);
      }
    }
  }
  for (const c of tuttiConEventi.filter((x) => daOdss.has(x.id))) {
    partiteCampionato({ c, eventi: daOdss.get(c.id), stato: statoDi(c), data, ora, errore, raccolta, fonte: 'odss-api' });
  }
  const conEventi = tuttiConEventi.filter((c) => !daOdss.has(c.id) || parziali.has(c.id));
  if (!conEventi.length) {
    raccolta.crediti.rimasti = rimastiOra;
    return raccolta;
  }

  // 3. Crediti: campionati in ordine di priorità finché bastano.
  let budget;
  ({ budget, rimastiOra } = budgetBasket({ data, dirData, rimastiOra, errore }));
  raccolta.crediti.rimasti = rimastiOra;
  const scelti = [];
  for (const c of conEventi) {
    if (B.creditiPerCampionato * (scelti.length + 1) > budget) break;
    scelti.push(c);
  }
  raccolta.competizioniNonCoperte.push(...conEventi.slice(scelti.length).map((c) => `${c.competizione}: crediti insufficienti`));

  // 4. Quote e partite.
  for (const c of scelti) {
    let quote;
    try {
      quote = await fonti.oddsBasket.quote(c.chiave, finestra, opz);
      raccolta.crediti.usati += B.creditiPerCampionato;
      raccolta.crediti.rimasti = num(quote.rimasti) ? quote.rimasti
        : num(raccolta.crediti.rimasti) ? raccolta.crediti.rimasti - B.creditiPerCampionato : null;
    } catch (e) {
      errore(`The Odds API (${c.competizione})`, e);
      continue;
    }
    const giaOdss = daOdss.get(c.id) ?? [];
    const coperta = (e) => giaOdss.some((x) => x.id === e.id || (x.casa === e.casa && x.trasferta === e.trasferta));
    const eventi = (quote.eventi ?? []).filter((e) => e.casa && e.trasferta && Number.isFinite(Date.parse(e.inizio)) && dentro(e) && !coperta(e));
    partiteCampionato({ c, eventi, stato: statoDi(c), data, ora, errore, raccolta });
  }
  return raccolta;
}

// Raccolta vuota per un imprevisto: l'errore è registrato e gli altri sport non vengono bloccati.
export function raccoltaDiErrore(data, adesso, e) {
  const raccolta = vuota(data, adesso);
  raccolta.erroriGiro.push(`Basket alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  return raccolta;
}

async function principale() {
  const i = process.argv.indexOf('--data');
  const adesso = new Date();
  const data = i > -1 ? process.argv[i + 1] : dataRoma(adesso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: node src/basket/raccolta.js [--data AAAA-MM-GG]');
    process.exit(1);
  }
  const dirData = 'data';
  const fonti = { oddsBasket, eurolega, thesportsdb };
  let raccolta;
  try {
    raccolta = await eseguiRaccoltaBasket({ data, adesso, fonti, chiavi: { oddsApi: process.env.ODDS_API_KEY, odss: process.env.ODSS_API_KEY }, dirData });
  } catch (e) {
    // Qualunque imprevisto: file con partite [] e l'errore, uscita 0, così gli altri sport vengono comunque salvati.
    raccolta = raccoltaDiErrore(data, adesso, e);
  }
  let esiti = { aggiornate: 0 };
  try {
    esiti = aggiornaEsitiBasket({ dirData: join(dirData, 'giornate'), adesso, storici: raccolta.storici ?? new Map(), raccolta });
  } catch (e) {
    raccolta.erroriGiro.push(`Esiti basket alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  }
  mkdirSync(join(dirData, 'raccolta'), { recursive: true });
  writeFileSync(join(dirData, 'raccolta', `${data}-basket.json`), `${JSON.stringify(raccolta, null, 2)}\n`);
  console.log(`Raccolta basket ${data}: ${raccolta.partite.length} partite, ${raccolta.erroriGiro.length} errori, crediti usati ${raccolta.crediti.usati}`);
  console.log(`Esiti basket aggiornati: ${esiti.aggiornate}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Raccolta basket fallita: ${e?.message ?? e}`);
  });
}
