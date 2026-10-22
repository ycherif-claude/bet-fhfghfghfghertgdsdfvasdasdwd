// Raccolta tennis del mattino: tornei attivi e quote h2h da The Odds API (budget di crediti unico
// con il calcio, che spende per primo), storico da tennis-data, Elo per superficie e mercati
// "Vincente incontro" → data/raccolta/<data>-tennis.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { budgetCrediti } from '../calcio/raccolta.js';
import { dataRoma, finestraGiornata, isoRoma, oraRoma, slug } from '../calcio/testo.js';
import { abbinaGiocatore, normalizzaGiocatore } from './giocatori.js';
import { eventiOdssSport } from '../odss/sport.js';
import { abbinaEventi, inFormatoTennis, tennisSingolare } from '../odss/eventi.js';
import { calcolaElo, eloDefault, pesoModelloPartita, probVittoria } from './elo.js';
import { oddsTennis } from './fonti/odds-tennis.js';
import { conStoricoLocale, fileNonAncoraPubblicato, tennisData } from './fonti/tennis-data.js';
import { bestOfDi, superficieNota } from './tornei.js';
import { aggiornaEsitiGiroTennis } from './esiti.js';

// Giorni oltre i quali lo storico della stagione in corso si segnala come fermo.
const GIORNI_STORICO_FERMO = 7;
const T = CONFIG.tennis;
// Riserva del 20% dei 500 crediti mensili (la stessa di budgetCrediti): mai sotto, qualunque cosa dica il calcio.
const RISERVA_MESE = CONFIG.calcio.riservaCrediti * 500;
const ESCLUSI = new Set(['betfair_ex_eu', 'matchbook', 'smarkets']);
const STAGIONI = 3;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (p) => `${Math.round(p * 100)}%`;
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

export const spiegazioneTennis = (nome) => `Vincente incontro: vince se ${nome} vince la partita. Se un giocatore si ritira dopo almeno un set completo vince chi passa il turno; se si ritira prima, o la partita non si gioca, la giocata è rimborsata`;

const quotaDi = (b, nome) => {
  const q = b?.quote?.[nome];
  return num(q) && q > 1 ? q : null;
};

// Mediana dei bookmaker (exchange esclusi) con la quota di `nome`, come nel calcio: almeno
// minBookmaker, arrotondata per difetto al centesimo. Null se non bastano.
export function quotaMedianaTennis(evento, nome) {
  const quote = (evento?.bookmaker ?? [])
    .filter((b) => !ESCLUSI.has(b.chiave))
    .map((b) => quotaDi(b, nome))
    .filter((q) => q !== null)
    .sort((a, b) => a - b);
  const n = quote.length;
  if (n < T.minBookmaker) return null;
  const meta = n >> 1;
  const mediana = n % 2 ? quote[meta] : (quote[meta - 1] + quote[meta]) / 2;
  return { quota: Math.floor(mediana * 100 + 1e-9) / 100, n };
}

// Probabilità di Pinnacle senza margine per i due giocatori; null se manca una quota.
export function probPinnacleTennis(evento, g1, g2) {
  const pin = (evento?.bookmaker ?? []).find((b) => b.chiave === 'pinnacle');
  const q1 = quotaDi(pin, g1);
  const q2 = quotaDi(pin, g2);
  if (q1 === null || q2 === null) return null;
  const somma = 1 / q1 + 1 / q2;
  return { [g1]: 1 / q1 / somma, [g2]: 1 / q2 / somma };
}

const GENERICHE = new Set(['atp', 'wta', 'open', 'masters', 'master', 'championships', 'championship', 'cup', 'tennis',
  'international', 'internationaux', 'classic', 'trophy', 'tournament', 'the', 'de', 'di', 'of', '1000', '500', '250']);
const parole = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter(Boolean);

// Riga tennis-data più recente dello stesso torneo: tutte le parole significative del titolo
// di The Odds API ("ATP Paris Masters" → "paris") devono comparire nel nome del torneo (Tournament).
// Solo se nessun nome corrisponde si prova la città (Location, "WTA Tokyo" → "Tokyo"): in una città
// con più tornei su superfici diverse (Parigi: Roland Garros e Masters) il risultato è null.
export function torneoTennisData(titolo, righe) {
  const cercate = parole(titolo).filter((p) => !GENERICHE.has(p));
  if (!cercate.length) return null;
  const tutte = (campo) => (righe ?? []).filter((r) => {
    const insieme = new Set(parole(r[campo]));
    return cercate.every((p) => insieme.has(p));
  });
  const recente = (lista) => lista.reduce((m, r) => (!m || r.data > m.data ? r : m), null);
  const perNome = tutte('torneo');
  if (perNome.length) return recente(perNome);
  const perLuogo = tutte('luogo');
  if (new Set(perLuogo.map((r) => r.superficie)).size > 1) return null;
  return recente(perLuogo);
}

// Stesso giocatore su odss-api e su The Odds API: stesso cognome e stessa iniziale ("Sinner J." e "Jannik Sinner").
export function stessoGiocatore(a, b) {
  const x = normalizzaGiocatore(a);
  const y = normalizzaGiocatore(b);
  return Boolean(x.cognome && x.iniziale && x.cognome === y.cognome && x.iniziale === y.iniziale);
}

// Crediti del calcio di oggi: { rimastiInizio, spesiCalcio } | { errore } | null (file assente).
function creditiCalcio(dirData, data) {
  const rel = `data/raccolta/${data}.json`;
  const file = join(dirData, 'raccolta', `${data}.json`);
  if (!existsSync(file)) return null;
  let j;
  try {
    j = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { errore: `file ${rel} illeggibile (${e.message}), crediti dalla prima chiamata gratuita` };
  }
  const c = j?.crediti;
  if (j?.data !== data || !num(c?.rimasti) || !num(c?.usati)) {
    return { errore: `file ${rel} senza crediti validi, crediti dalla prima chiamata gratuita` };
  }
  return { rimastiInizio: c.rimasti + c.usati, spesiCalcio: c.usati };
}

function nascosto(oggetto, chiave, valore) {
  Object.defineProperty(oggetto, chiave, { value: valore, enumerable: false, writable: true, configurable: true });
}

function vuota(data, adesso) {
  const raccolta = {
    data, generataAlle: isoRoma(adesso), crediti: { usati: 0, rimasti: null },
    competizioniNonCoperte: [], erroriGiro: [], partite: [],
  };
  // Per gli esiti, mai scritti nel JSON: storico tennis-data, tornei attivi, crediti ancora spendibili.
  nascosto(raccolta, 'storico', new Map());
  nascosto(raccolta, 'tornei', []);
  nascosto(raccolta, 'budgetResiduo', 0);
  return raccolta;
}

// idPartita del tennis: nomi in ordine alfabetico (nel tennis non c'è casa o trasferta).
export function idPartitaTennis(data, g1, g2) {
  const [x, y] = [slug(g1), slug(g2)].sort();
  return `tennis-${data}-${x}-${y}`;
}

// Budget del mattino: il calcio spende per primo; il tennis tiene da parte la serata per ogni torneo attivo.
function budgetMattino({ data, dirData, rimastiOra, conEventi, errore }) {
  const calcio = creditiCalcio(dirData, data);
  let rimastiInizio;
  let spesiCalcio;
  if (calcio && !calcio.errore) {
    ({ rimastiInizio, spesiCalcio } = calcio);
  } else {
    if (calcio?.errore) errore('Raccolta calcio', calcio.errore);
    // File del calcio assente: quanto ha speso il calcio non si sa, e va detto (solo se il tennis spende).
    else if (conEventi.length) errore('Tennis', 'Crediti del calcio sconosciuti: budget tennis calcolato sui crediti rimasti');
    rimastiInizio = rimastiOra;
    spesiCalcio = 0;
  }
  if (rimastiOra === null && num(rimastiInizio)) rimastiOra = rimastiInizio - spesiCalcio;
  let budget = 0;
  if (!num(rimastiInizio)) {
    if (conEventi.length) errore('The Odds API', 'crediti rimasti sconosciuti');
  } else {
    const sera = T.riservaSeraPerTorneo * conEventi.length;
    budget = Math.max(0, Math.min(
      budgetCrediti(rimastiInizio, data) - spesiCalcio - sera,
      rimastiOra - RISERVA_MESE - sera,
    ));
  }
  return { budget, rimastiOra };
}

// Budget della sera prima (spec §3.2): al massimo 1 credito per torneo con partite notturne, mai sotto la riserva.
export function budgetSerale({ rimastiOra, conEventi, errore }) {
  if (!num(rimastiOra)) {
    if (conEventi.length) errore('The Odds API', 'crediti rimasti sconosciuti');
    return { budget: 0, rimastiOra };
  }
  return { budget: Math.max(0, Math.min(T.creditiPerTorneo * conEventi.length, rimastiOra - RISERVA_MESE)), rimastiOra };
}

export async function eseguiRaccoltaTennis({ data, adesso, fonti, chiavi, dirData = 'data' }) {
  return raccogliTennis({ data, adesso, fonti, chiavi, dirData, finestra: finestraGiornata(data), calcolaBudget: budgetMattino });
}

// Raccolta tennis nella finestra data: eventi di `escludi` (idPartita) saltati, crediti da `calcolaBudget`.
export async function raccogliTennis({ data, adesso, fonti, chiavi, dirData = 'data', finestra, calcolaBudget, escludi = new Set() }) {
  const raccolta = vuota(data, adesso);
  const { erroriGiro } = raccolta;
  const errore = (fonte, e) => erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const ora = raccolta.generataAlle;
  if (!chiavi?.oddsApi) {
    errore('The Odds API', 'manca ODDS_API_KEY');
    return raccolta;
  }
  const opz = { chiave: chiavi.oddsApi };
  const dentro = (e) => {
    const t = Date.parse(e.inizio);
    return t >= finestra.da.getTime() && t < finestra.a.getTime();
  };

  // 1. Tornei attivi (gratuito) ed eventi della giornata (gratuiti, con i crediti rimasti).
  let tornei;
  try {
    tornei = (await fonti.oddsTennis.torneiAttivi(opz)).filter((t) => !/_winner$/.test(t.chiave));
  } catch (e) {
    errore('The Odds API (tornei tennis)', e);
    return raccolta;
  }
  raccolta.tornei = tornei;
  let rimastiOra = null;
  const eventiPer = new Map();
  for (const t of tornei) {
    try {
      const r = await fonti.oddsTennis.eventi(t.chiave, finestra, opz);
      if (rimastiOra === null && num(r.rimasti)) rimastiOra = r.rimasti;
      let incompleti = 0;
      const eventi = [];
      for (const e of r.eventi ?? []) {
        if (!e.giocatore1 || !e.giocatore2 || !Number.isFinite(Date.parse(e.inizio))) { incompleti++; continue; }
        if (dentro(e) && !escludi.has(idPartitaTennis(data, e.giocatore1, e.giocatore2))) eventi.push(e);
      }
      if (incompleti) errore(`The Odds API (${t.titolo})`, plurale(incompleti, 'evento senza giocatori o orario', 'eventi senza giocatori o orario'));
      if (eventi.length) eventiPer.set(t.chiave, eventi);
    } catch (e) {
      // 404/422: torneo fermo o sconosciuto all'API → nessuna partita, non è un errore.
      if (e?.status === 404 || e?.status === 422) continue;
      errore(`The Odds API (${t.titolo})`, e);
    }
  }

  // 1b. Quote di odss-api (fonte principale) [utente, 22/10/2026]: una richiesta (moneyline della giornata) solo se
  // ci sono partite; i tornei senza nessuna partita su odss (o tutti, se odss non risponde) tornano a The Odds API.
  const quotePer = new Map();
  const daOdss = new Set();
  if (chiavi && Object.hasOwn(chiavi, 'odss')) {
    const o = await eventiOdssSport({
      dirData, data, adesso, chiave: chiavi.odss, sport: 'tennis', gruppi: ['moneyline'], finestra, fetch: fonti.fetchOdss,
      attesaMs: fonti.attesaOdssMs, partite: [...eventiPer.values()].flat().length, nome: 'tennis',
    });
    erroriGiro.push(...o.errori);
    for (const t of tornei.filter((x) => eventiPer.has(x.chiave))) {
      const evs = eventiPer.get(t.chiave);
      const abbinati = abbinaEventi(evs.map((e) => ({ id: e.id, casa: e.giocatore1, trasferta: e.giocatore2, inizio: e.inizio })), (o.eventi ?? []).filter(tennisSingolare), { stesso: stessoGiocatore, invertibile: true });
      const conQuote = evs.filter((e) => abbinati.has(e.id))
        .map((e) => ({ ...e, bookmaker: inFormatoTennis(abbinati.get(e.id).evento, e.giocatore1, e.giocatore2, { invertito: abbinati.get(e.id).invertito }) }))
        .filter((e) => e.bookmaker.length);
      if (conQuote.length) {
        daOdss.add(t.chiave);
        quotePer.set(t.chiave, new Map(conQuote.map((e) => [e.id, e])));
        if (conQuote.length < evs.length) erroriGiro.push(`Quote ${t.titolo}: ${evs.length - conQuote.length} partite su ${evs.length} non trovate su odss-api, senza quote`);
      } else {
        erroriGiro.push(`Quote ${t.titolo}: nessuna partita su odss-api, quote da The Odds API`);
      }
    }
  }

  // 2. Crediti (solo per i tornei che tornano a The Odds API).
  const conEventi = tornei.filter((t) => eventiPer.has(t.chiave) && !daOdss.has(t.chiave));
  let budget;
  ({ budget, rimastiOra } = calcolaBudget({ data, dirData, rimastiOra, conEventi, errore }));
  raccolta.crediti.rimasti = rimastiOra;

  // 3. Tornei per data d'inizio più vicina, finché i crediti bastano.
  const primoInizio = (t) => Math.min(...eventiPer.get(t.chiave).map((e) => Date.parse(e.inizio)));
  const ordinati = conEventi.map((t, i) => ({ t, i, inizio: primoInizio(t) }))
    .sort((a, b) => a.inizio - b.inizio || a.i - b.i).map((x) => x.t);
  const scelti = [];
  for (const t of ordinati) {
    if (T.creditiPerTorneo * (scelti.length + 1) > budget) break;
    scelti.push(t);
  }
  raccolta.competizioniNonCoperte.push(...ordinati.slice(scelti.length).map((t) => `${t.titolo}: crediti insufficienti`));

  // 4. Quote h2h (1 credito per torneo); le chiamate fallite non si contano.
  for (const t of scelti) {
    try {
      const r = await fonti.oddsTennis.quote(t.chiave, finestra, opz);
      quotePer.set(t.chiave, new Map((r.eventi ?? []).map((e) => [e.id, e])));
      raccolta.crediti.usati += T.creditiPerTorneo;
      raccolta.crediti.rimasti = num(r.rimasti) ? r.rimasti
        : num(raccolta.crediti.rimasti) ? raccolta.crediti.rimasti - T.creditiPerTorneo : null;
    } catch (e) {
      errore(`The Odds API (${t.titolo})`, e);
    }
  }
  raccolta.budgetResiduo = Math.max(0, budget - raccolta.crediti.usati);

  // Tornei con le quote: prima quelli di odss-api, poi quelli di The Odds API.
  scelti.unshift(...tornei.filter((t) => daOdss.has(t.chiave)));

  // 5. Storico: tre stagioni per circuito; una stagione che manca non fa perdere le altre.
  const anno = Number(data.slice(0, 4));
  const stati = new Map();
  for (const circuito of new Set(scelti.filter((t) => quotePer.has(t.chiave)).map((t) => t.circuito))) {
    const righe = [];
    let caricate = 0;
    for (let i = 0; i < STAGIONI; i++) {
      try {
        righe.push(...await fonti.tennisData.partite(anno - i, circuito));
        caricate++;
      } catch (e) {
        // A gennaio il file dell'anno nuovo può mancare: è previsto, nessun errore.
        if (!fileNonAncoraPubblicato(e, anno - i, data)) errore(`tennis-data.co.uk ${circuito.toUpperCase()} ${anno - i}`, e);
      }
    }
    if (!caricate) continue;
    // Stagione in corso ferma da più di 7 giorni: di solito il file caricato a mano è vecchio.
    const ultima = righe.map((p) => p.data).filter((d) => d.startsWith(`${anno}-`)).sort().at(-1);
    if (ultima && Date.parse(`${data}T00:00:00Z`) - Date.parse(`${ultima}T00:00:00Z`) > GIORNI_STORICO_FERMO * 86400000) {
      erroriGiro.push(`Storico tennis ${circuito.toUpperCase()} fermo al ${ultima.slice(8, 10)}/${ultima.slice(5, 7)}/${ultima.slice(0, 4)}: ricarica il file in data/storico-tennis/${circuito}/${anno}.xlsx`);
    }
    raccolta.storico.set(circuito, righe);
    stati.set(circuito, {
      righe,
      nomi: [...new Set(righe.flatMap((p) => [p.vincitore, p.perdente]))],
      elo: calcolaElo(righe),
    });
  }

  // 6. Partite.
  for (const t of scelti) {
    const quote = quotePer.get(t.chiave);
    if (!quote) continue;
    let stato = stati.get(t.circuito) ?? null;
    const bestOf = bestOfDi(t);
    // Superficie: prima la tabella dei tornei noti, poi lo storico; se resta sconosciuta
    // niente modello (mai tirare a indovinare il cemento): solo Pinnacle.
    let superficie = superficieNota(t) ?? (stato ? torneoTennisData(t.titolo, stato.righe)?.superficie ?? null : null);
    let motivo = 'Storico tennis-data non disponibile: probabilità solo da Pinnacle';
    if (!superficie) {
      superficie = null;
      if (stato) {
        erroriGiro.push(`Superficie sconosciuta per ${t.titolo}: solo Pinnacle`);
        motivo = 'Superficie del torneo sconosciuta: probabilità solo da Pinnacle';
        stato = null;
      }
    }
    let senzaQuota = 0;
    for (const ev of eventiPer.get(t.chiave)) {
      const partita = costruisciPartita({ t, ev, evento: quote.get(ev.id) ?? { ...ev, bookmaker: [] }, stato, superficie, bestOf, motivo, data, ora, erroriGiro, fonte: daOdss.has(t.chiave) ? 'odss-api' : 'The Odds API' });
      if (partita === null) continue;
      if (partita === false) { senzaQuota++; continue; }
      raccolta.partite.push(partita);
    }
    if (senzaQuota) errore(daOdss.has(t.chiave) ? 'odss-api' : 'The Odds API', `${plurale(senzaQuota, 'partita', 'partite')} senza quota utilizzabile (${t.titolo})`);
  }
  return raccolta;
}

// Partita della raccolta; null se un giocatore non si abbina (errore già scritto), false se nessun mercato ha quota.
function costruisciPartita({ t, ev, evento, stato, superficie, bestOf, motivo, data, ora, erroriGiro, fonte = 'The Odds API' }) {
  const g1 = ev.giocatore1;
  const g2 = ev.giocatore2;
  let elo = null;
  let p1 = null;
  let peso = null;
  let ragionamentoBase;
  if (stato) {
    const a = abbinaGiocatore(g1, stato.nomi);
    const b = abbinaGiocatore(g2, stato.nomi);
    const ignoti = [];
    if (!a || a === b) ignoti.push(g1);
    if (!b || a === b) ignoti.push(g2);
    if (ignoti.length) {
      erroriGiro.push(`Giocatori non riconosciuti: ${ignoti.join(', ')} (${t.titolo})`);
      return null;
    }
    const ea = stato.elo.get(a) ?? eloDefault();
    const eb = stato.elo.get(b) ?? eloDefault();
    p1 = probVittoria(ea, eb, superficie, bestOf);
    peso = pesoModelloPartita(stato.elo, a, b, data);
    const voce = (e) => ({ tot: Math.round(e.tot), superficie: Math.round(e[superficie]) });
    elo = { [g1]: voce(ea), [g2]: voce(eb) };
    ragionamentoBase = [
      `Elo complessivo e su ${superficie}: ${g1} ${elo[g1].tot}/${elo[g1].superficie} – ${g2} ${elo[g2].tot}/${elo[g2].superficie} (ultime ${STAGIONI} stagioni tennis-data)`,
      `Al meglio dei ${bestOf} set`,
    ];
    if (peso === T.pesoModelloPocheDati) {
      ragionamentoBase.push(`Meno di ${T.minPartite12Mesi} partite negli ultimi 12 mesi per almeno un giocatore: peso del modello ${pct(peso)}`);
    }
  } else {
    ragionamentoBase = [motivo];
  }

  const pin = probPinnacleTennis(evento, g1, g2);
  const mercati = [];
  for (const [nome, probModello] of [[g1, p1], [g2, p1 === null ? null : 1 - p1]]) {
    const q = quotaMedianaTennis(evento, nome);
    if (!q) continue;
    const probPinnacle = pin?.[nome] ?? null;
    if (probModello === null && probPinnacle === null) continue;
    mercati.push({
      mercato: 'Vincente incontro',
      selezione: nome,
      probModello,
      probPinnacle,
      quota: q.quota,
      fonteQuota: `mediana di ${q.n} bookmaker (${fonte})`,
      oraQuota: ora,
      frequenzaCampionato: null,
      spiegazione: spiegazioneTennis(nome),
    });
  }
  if (!mercati.length) return false;
  return {
    idPartita: idPartitaTennis(data, g1, g2),
    sport: 'tennis',
    competizione: t.titolo,
    partita: `${g1} - ${g2}`,
    casa: g1,
    trasferta: g2,
    inizio: isoRoma(new Date(ev.inizio)),
    modello: 'elo',
    lambda: null,
    elo,
    superficie,
    bestOf,
    pesoModello: peso,
    ragionamentoBase,
    mercati,
  };
}

// Raccolta vuota per un imprevisto: l'errore è registrato e calcio e NBA non vengono bloccati.
export function raccoltaDiErrore(data, adesso, e) {
  const raccolta = vuota(data, adesso);
  raccolta.erroriGiro.push(`Tennis alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  return raccolta;
}

async function principale() {
  const i = process.argv.indexOf('--data');
  const adesso = new Date();
  const data = i > -1 ? process.argv[i + 1] : dataRoma(adesso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: node src/tennis/raccolta.js [--data AAAA-MM-GG]');
    process.exit(1);
  }
  const dirData = 'data';
  const chiavi = { oddsApi: process.env.ODDS_API_KEY, odss: process.env.ODSS_API_KEY };
  const fonti = { oddsTennis, tennisData: conStoricoLocale(tennisData, join(dirData, 'storico-tennis')) };
  let raccolta;
  try {
    raccolta = await eseguiRaccoltaTennis({ data, adesso, fonti, chiavi, dirData });
  } catch (e) {
    // Qualunque imprevisto: file con partite [] e l'errore, uscita 0, così calcio e NBA vengono comunque salvati.
    raccolta = raccoltaDiErrore(data, adesso, e);
  }
  let esiti = { aggiornate: 0 };
  try {
    esiti = await aggiornaEsitiGiroTennis({
      dirData: join(dirData, 'giornate'), adesso, fonti, chiavi, raccolta,
      storico: raccolta.storico, tornei: raccolta.tornei, budgetResiduo: raccolta.budgetResiduo,
    });
  } catch (e) {
    raccolta.erroriGiro.push(`Esiti tennis alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  }
  mkdirSync(join(dirData, 'raccolta'), { recursive: true });
  writeFileSync(join(dirData, 'raccolta', `${data}-tennis.json`), `${JSON.stringify(raccolta, null, 2)}\n`);
  console.log(`Raccolta tennis ${data}: ${raccolta.partite.length} partite, ${raccolta.erroriGiro.length} errori, crediti usati ${raccolta.crediti.usati}`);
  console.log(`Esiti tennis aggiornati: ${esiti.aggiornate}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Raccolta tennis fallita: ${e?.message ?? e}`);
  });
}
