// Raccolta mattutina: eventi, quote, CSV storici e probabilità del modello per ogni partita del giorno.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { ALIAS_ESPN_CSV, COMPETIZIONI } from './competizioni.js';
import { abbinaEspn, abbinaSquadra } from './squadre.js';
import { dataRoma, finestraGiornata, isoRoma, oraRoma, slug } from './testo.js';
import { quotaMediana, probPinnacle } from './quote.js';
import { lambda, stimaForze } from './modelli/gol.js';
import { frequenzeGol, mercatiGol } from './modelli/mercati-gol.js';
import { mercatiConteggi } from './modelli/conteggi.js';
import { oddsApi } from './fonti/odds-api.js';
import { footballDataUk } from './fonti/football-data-uk.js';
import { footballDataOrg } from './fonti/football-data-org.js';
import { bloccoEspn } from './fonti/http.js';
import { espn, stessaSquadra } from '../controlli/espn.js';
import { PARAMETRI as ELO, SOLO_COPPE, lambdaCoppa } from '../coppe/elo.js';
import { existsSync, readFileSync } from 'node:fs';
import { aggiornaEsitiGiro } from './esiti.js';
import { abbinaEventiOdss, leggiQuoteOdss, mercatoOdss } from './odss.js';

const TOTALE_MESE = 500;
const COSTO_QUOTE = 2;
const LINEE_LIBERE = [1.5, 2.5, 3.5];

// Crediti spendibili oggi: (rimasti − riserva) diviso i giorni che restano nel mese, oggi compreso.
export function budgetCrediti(rimasti, oggi, totaleMese = TOTALE_MESE) {
  const [anno, mese, giorno] = oggi.split('-').map(Number);
  const giorniNelMese = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  const giorniRimanenti = giorniNelMese - giorno + 1;
  return Math.max(0, Math.floor((rimasti - CONFIG.calcio.riservaCrediti * totaleMese) / giorniRimanenti));
}

// Per priorità, finché 2 crediti per competizione stanno nel budget.
export function scegliCompetizioni(conPartite, budget) {
  const ordinate = [...conPartite].sort((a, b) => a.priorita - b.priorita);
  const scelte = [];
  for (const c of ordinate) {
    if (COSTO_QUOTE * (scelte.length + 1) > budget) break;
    scelte.push(c);
  }
  return { scelte, scoperte: ordinate.slice(scelte.length) };
}

// 'AAAA-MM-GG' → codice stagione football-data (da luglio in poi la nuova stagione).
function stagioneDi(data) {
  const [anno, mese] = data.split('-').map(Number);
  const inizio = mese >= 7 ? anno : anno - 1;
  const yy = (n) => String(n % 100).padStart(2, '0');
  return `${yy(inizio)}${yy(inizio + 1)}`;
}

function stagioniDa(data) {
  const corrente = Number(stagioneDi(data).slice(0, 2));
  const yy = (n) => String(n).padStart(2, '0');
  return [0, 1, 2].map((i) => `${yy(corrente - i)}${yy(corrente - i + 1)}`);
}

const virgola = (n) => n.toFixed(1).replace('.', ',');

export async function eseguiRaccolta({ data, adesso, fonti, chiavi }) {
  const erroriGiro = [];
  const errore = (fonte, e) => erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const ora = isoRoma(adesso);
  const finestra = finestraGiornata(data);
  const dentro = (e) => {
    const t = Date.parse(e.inizio);
    return t >= finestra.da.getTime() && t < finestra.a.getTime();
  };

  // 1. Eventi (gratuiti) e crediti rimasti dalla prima risposta.
  let rimasti = null;
  const eventiPer = new Map();
  for (const c of COMPETIZIONI.filter((x) => x.chiave)) {
    try {
      const r = await fonti.oddsApi.eventi(c.chiave, finestra, { chiave: chiavi.oddsApi });
      if (rimasti === null && r.rimasti !== null && r.rimasti !== undefined) rimasti = r.rimasti;
      const eventi = r.eventi.filter(dentro);
      if (eventi.length) eventiPer.set(c.chiave, eventi);
    } catch (e) {
      // 404/422: competizione ferma, fuori stagione o sconosciuta all'API → nessuna partita, non è un errore.
      if (e?.status === 404 || e?.status === 422) continue;
      errore(`The Odds API (${c.nome})`, e);
    }
  }
  if (rimasti === null) {
    errore('The Odds API', new Error('crediti rimasti sconosciuti'));
    rimasti = 0;
  }

  // 1b. Campionati senza quote: calendario da ESPN o dai file fixtures di football-data.co.uk.
  await calendarioSenzaQuote({ data, fonti, dentro, eventiPer, errore });

  // 1c. Quote di odss-api (fonte principale, tutte le competizioni) [utente, 22/10/2026]: eventi di
  // data/raccolta/<data>-odss.json abbinati alle partite. Le competizioni di The Odds API senza nessuna partita su
  // odss (o tutte, se odss non c'è) tornano a The Odds API, con una riga in erroriGiro.
  const conPartite = COMPETIZIONI.filter((c) => eventiPer.has(chiaveEventi(c)));
  const odssPer = new Map();
  const daOdss = new Set();
  if (fonti.odss !== undefined) {
    const eventiOdss = Array.isArray(fonti.odss?.eventi) ? fonti.odss.eventi : [];
    if (!eventiOdss.length) {
      const motivo = (fonti.odss?.errori ?? []).map((x) => String(x).replace(/^odss-api alle dd:dd: /, '')).join('; ') || 'nessuna partita nel file';
      erroriGiro.push(`odss-api non disponibile alle ${oraRoma(adesso)} (${motivo}): quote del calcio da The Odds API come prima`);
    } else {
      const nostre = conPartite.flatMap((c) => eventiPer.get(chiaveEventi(c)).map((e) => ({
        idPartita: `${chiaveEventi(c)}#${e.id}`, sport: 'calcio', casa: e.casa, trasferta: e.trasferta, inizio: e.inizio,
      })));
      for (const [id, e] of abbinaEventiOdss(nostre, eventiOdss)) odssPer.set(id, e);
      for (const c of conPartite) {
        const eventi = eventiPer.get(chiaveEventi(c));
        const trovate = eventi.filter((e) => odssPer.has(`${chiaveEventi(c)}#${e.id}`)).length;
        if (trovate) daOdss.add(c.nome);
        if (!trovate && c.chiave) erroriGiro.push(`Quote ${c.nome}: nessuna partita su odss-api, quote da The Odds API`);
        else if (trovate < eventi.length) erroriGiro.push(`Quote ${c.nome}: ${eventi.length - trovate} partite su ${eventi.length} non trovate su odss-api, senza quote`);
      }
    }
  }

  // 2. Budget e scelta delle competizioni (solo quelle con le quote di The Odds API spendono crediti).
  const budget = budgetCrediti(rimasti, data);
  const { scelte, scoperte } = scegliCompetizioni(conPartite.filter((c) => c.chiave && !daOdss.has(c.nome)), budget);
  const competizioniNonCoperte = scoperte.map((c) => `${c.nome}: crediti insufficienti`);
  const crediti = { usati: 0, rimasti };

  // 3. Quote.
  const quotePer = new Map();
  for (const c of scelte) {
    try {
      const r = await fonti.oddsApi.quote(c.chiave, finestra, { chiave: chiavi.oddsApi });
      quotePer.set(c.chiave, new Map(r.eventi.map((e) => [e.id, e])));
      // `usati` = spesa di questa raccolta (non il conteggio mensile dell'intestazione); le chiamate fallite non si contano.
      crediti.usati += COSTO_QUOTE;
      crediti.rimasti = r.rimasti ?? crediti.rimasti - COSTO_QUOTE;
    } catch (e) {
      errore(`The Odds API (${c.nome})`, e);
    }
  }

  // 4. CSV: una volta per codice e stagione, un errore non fa perdere le altre stagioni
  // (senza la stagione corrente il modello usa le precedenti, e il buco va in erroriGiro).
  const stagioni = stagioniDa(data);
  const leghe = new Map();
  async function lega(codice, formato) {
    if (leghe.has(codice)) return leghe.get(codice);
    if (formato === 'extra') {
      const stato = await legaExtra(codice, { data, fonti, errore });
      leghe.set(codice, stato);
      return stato;
    }
    const righe = [];
    const perStagione = [];
    for (const stagione of stagioni) {
      try {
        const p = await fonti.footballDataUk.partite(codice, [stagione]);
        perStagione.push(p);
        righe.push(...p);
      } catch (e) {
        perStagione.push(null);
        errore(`football-data.co.uk ${codice} ${stagione}`, e);
      }
    }
    let stato = null;
    const caricate = stagioni.filter((_, i) => perStagione[i]);
    if (!perStagione[0] && caricate.length) {
      errore(`football-data.co.uk ${codice}`, `stagione corrente ${stagioni[0]} mancante, modello dalle stagioni ${caricate.join(', ')}`);
    }
    if (caricate.length) {
      const ultima = perStagione[1] ? new Set(perStagione[1].flatMap((x) => [x.casa, x.trasferta])) : undefined;
      stato = {
        righe,
        nomi: [...new Set(righe.flatMap((x) => [x.casa, x.trasferta]))],
        forze: stimaForze(righe, { oggi: data, squadreUltimaStagione: ultima }),
        frequenze: frequenzeGol(righe, { oggi: data }),
      };
    }
    leghe.set(codice, stato);
    return stato;
  }

  // 5. Partite.
  const partite = [];
  for (const c of conPartite) {
    const quote = quotePer.get(c.chiave);
    const stato = c.modello === 'dixon-coles' ? await lega(c.csv, c.formato) : null;
    for (const base of eventiPer.get(chiaveEventi(c))) {
      const evento = quote?.get(base.id) ?? { ...base, bookmaker: [] };
      const coppa = c.coppa ? eloCoppa(base, fonti) : null;
      const odssEv = odssPer.get(`${chiaveEventi(c)}#${base.id}`) ?? null;
      const partita = costruisciPartita({ c, evento, odssEv, base, stato, coppa, data, ora, errore: (m) => erroriGiro.push(m) });
      if (partita) partite.push(partita);
    }
  }

  const raccolta = { data, generataAlle: ora, crediti, competizioniNonCoperte, erroriGiro, partite };
  // Righe dei CSV scaricate, per gli esiti: non enumerabili, quindi mai scritte nel JSON della raccolta.
  Object.defineProperty(raccolta, 'csv', { value: new Map([...leghe].filter(([, v]) => v).map(([k, v]) => [k, v.righe])) });
  return raccolta;
}

// Quota gratuita e probabilità di Pinnacle per i mercati con quote su The Odds API.
function datiLiberi(evento, mercato, selezione) {
  const vuoto = { quota: null, fonteQuota: null, oraQuota: null, probPinnacle: null };
  let tipo; let sel; let linea;
  if (mercato === '1X2') {
    tipo = 'h2h'; sel = selezione;
  } else {
    const m = /^Under\/Over (\d\.5)$/.exec(mercato);
    if (!m || !LINEE_LIBERE.includes(Number(m[1]))) return vuoto;
    tipo = 'totals'; linea = m[1]; sel = selezione.split(' ')[0];
  }
  const med = quotaMediana(evento, tipo, sel, linea);
  const pin = probPinnacle(evento, tipo, linea)?.[sel] ?? null;
  return { quota: med?.quota ?? null, n: med?.n ?? null, probPinnacle: pin };
}

// Quota (mediana dei bookmaker) e probabilità di mercato da odss-api: Pinnacle senza margine o, senza Pinnacle,
// il consenso senza margine dei bookmaker (etichetta "Consenso bookmaker"). 1X2, doppia chance e Under/Over.
function datiOdss(evento, mercato, selezione) {
  const k = mercatoOdss(mercato, selezione);
  const r = k ? evento?.mercati?.[k.chiave] : null;
  const prob = typeof r?.prob?.[k?.esito] === 'number' ? r.prob[k.esito] : null;
  const med = r?.mediana?.[k?.esito];
  return {
    quota: med?.quota ?? null, n: med?.n ?? null, probPinnacle: prob,
    etichetta: prob !== null && r.fonteProb !== 'Pinnacle' ? 'Consenso bookmaker' : null,
  };
}

function costruisciPartita({ c, evento, odssEv = null, base, stato, coppa = null, data, ora, errore }) {
  const casa = base.casa;
  const trasferta = base.trasferta;
  const voce = (mercato, selezione, probModello, frequenzaCampionato) => {
    const l = odssEv ? datiOdss(odssEv, mercato, selezione) : datiLiberi(evento, mercato, selezione);
    return {
      mercato, selezione, probModello, probPinnacle: l.probPinnacle,
      quota: l.quota ?? null,
      fonteQuota: l.quota != null ? `mediana di ${l.n} bookmaker (${odssEv ? 'odss-api' : 'The Odds API'})` : null,
      oraQuota: l.quota != null ? ora : null,
      frequenzaCampionato,
      ...(l.etichetta ? { etichettaMercato: l.etichetta } : {}),
    };
  };

  let modello = c.modello;
  let lam = null;
  let mercati = [];
  let ragionamentoBase = [];

  if (coppa) {
    // Coppa europea: gol attesi dall'Elo europeo (un punteggio per tutti i club).
    modello = 'elo-europeo';
    lam = coppa.lambda;
    ragionamentoBase = [`Elo europeo: ${casa} ${Math.round(coppa.casa)} – ${trasferta} ${Math.round(coppa.trasferta)}; gol attesi ${virgola(lam.casa)} – ${virgola(lam.trasferta)}`];
    for (const g of mercatiGol(lam.casa, lam.trasferta, 0.45)) mercati.push(voce(g.mercato, g.selezione, g.prob, null));
  } else if (c.coppa && c.modello === 'elo-europeo') {
    errore(`Elo europeo senza punteggi per ${casa} - ${trasferta} (${c.nome})`);
    return null;
  } else if (c.modello === 'solo-pinnacle') {
    ragionamentoBase = ['Coppa o nazionale: probabilità solo da Pinnacle (nessun modello tra campionati diversi)'];
    mercati = soloLiberi(voce);
  } else if (!stato) {
    // Nessun dato storico (errore già registrato): restano le probabilità di Pinnacle.
    mercati = soloLiberi(voce);
  } else {
    const abbina = c.chiave ? (x) => abbinaSquadra(x, stato.nomi) : (x) => abbinaEspn(x, stato.nomi, ALIAS_ESPN_CSV[c.csv]);
    const csvCasa = abbina(casa);
    const csvTrasferta = abbina(trasferta);
    lam = csvCasa && csvTrasferta && csvCasa !== csvTrasferta ? lambda(stato.forze, csvCasa, csvTrasferta) : null;
    if (!lam) {
      const ignote = [];
      if (!csvCasa) ignote.push(casa);
      if (!csvTrasferta) ignote.push(trasferta);
      if (!ignote.length) {
        // Entrambe trovate: stessa squadra del CSV, oppure squadra senza forze stimate.
        if (csvCasa === csvTrasferta) ignote.push(casa, trasferta);
        else {
          if (!stato.forze.attacco.has(csvCasa)) ignote.push(casa);
          if (!stato.forze.attacco.has(csvTrasferta)) ignote.push(trasferta);
          if (!ignote.length) ignote.push(casa, trasferta);
        }
      }
      errore(`Squadre non riconosciute: ${ignote.join(', ')} (${c.nome})`);
      return null;
    }
    if (![lam.casa, lam.trasferta].every((x) => Number.isFinite(x) && x > 0)) {
      errore(`Gol attesi non validi per ${casa} - ${trasferta} (${c.nome})`);
      return null;
    }
    ragionamentoBase = [`Gol attesi: ${casa} ${virgola(lam.casa)} – ${trasferta} ${virgola(lam.trasferta)} (gol e xG, ultime 2 stagioni)`];
    for (const g of mercatiGol(lam.casa, lam.trasferta, stato.forze.quotaPT)) {
      mercati.push(voce(g.mercato, g.selezione, g.prob, stato.frequenze.get(`${g.mercato}|${g.selezione}`) ?? null));
    }
    for (const k of mercatiConteggi(stato.righe, csvCasa, csvTrasferta, { oggi: data, arbitro: null })) {
      mercati.push(voce(k.mercato, k.selezione, k.prob, k.frequenzaCampionato ?? null));
    }
  }

  if (!mercati.length) return null;
  return {
    idPartita: `calcio-${data}-${slug(casa)}-${slug(trasferta)}`,
    competizione: c.nome,
    partita: `${casa} - ${trasferta}`,
    casa,
    trasferta,
    inizio: isoRoma(new Date(base.inizio)),
    modello,
    lambda: lam,
    ragionamentoBase,
    mercati,
    // Campionato senza quote (né The Odds API né odss-api): solo pronostici sì/no e registro, niente giocate.
    ...(c.chiave || mercati.some((m) => m.quota !== null) ? {} : { soloPronostici: true }),
  };
}

// 1X2 e le tre linee Under/Over, solo se Pinnacle dà una probabilità.
function soloLiberi(voce) {
  const out = [];
  for (const s of ['1', 'X', '2']) out.push(voce('1X2', s, null, null));
  for (const l of LINEE_LIBERE) {
    out.push(voce(`Under/Over ${l}`, `Over ${l}`, null, null), voce(`Under/Over ${l}`, `Under ${l}`, null, null));
  }
  return out.filter((m) => m.probPinnacle !== null);
}

// Elo europeo di una partita di coppa: la partita nello storico delle coppe (ESPN, con gli id delle squadre),
// poi i punteggi. null se manca il file dei punteggi o la partita.
function eloCoppa(base, fonti) {
  const elo = fonti.eloEuropeo;
  if (!elo || !Array.isArray(fonti.coppe)) return null;
  const t = Date.parse(base.inizio);
  const f = fonti.coppe.find((p) => p.id === base.id)
    ?? fonti.coppe.find((p) => Math.abs(Date.parse(p.inizio) - t) <= 6 * 3600000
      && stessaSquadra(p.casa.nome, base.casa) && stessaSquadra(p.trasferta.nome, base.trasferta));
  if (!f) return null;
  const punti = (s) => elo.rating[elo.squadreEspn?.[s.id] ?? `espn:${s.id}`] ?? SOLO_COPPE;
  const casa = punti(f.casa);
  const trasferta = punti(f.trasferta);
  const delta = casa - trasferta + (f.neutro ? 0 : (elo.parametri?.H ?? ELO.H));
  return { casa, trasferta, delta, lambda: lambdaCoppa(elo.gol, delta) };
}

// Chiave degli eventi di una competizione: quella di The Odds API, oppure `fd:<codice CSV>` senza quote.
const chiaveEventi = (c) => c.chiave ?? `fd:${c.csv ?? c.nome}`;

// Giorni (AAAA-MM-GG) da chiedere a ESPN: la giornata va dalle 8 di Roma alle 8 del giorno dopo.
const giornoDopo = (data) => {
  const [y, m, g] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, g + 1)).toISOString().slice(0, 10);
};

// Partite dei campionati senza quote: ESPN se c'è, altrimenti il calendario di football-data.co.uk.
async function calendarioSenzaQuote({ data, fonti, dentro, eventiPer, errore }) {
  let fixtures = null;
  // ESPN in 403 [correzione C5]: un solo errore chiaro, poi niente più richieste a ESPN in questa raccolta.
  let espnBloccato = false;
  const saltati = [];
  for (const c of COMPETIZIONI.filter((x) => !x.chiave)) {
    let eventi = [];
    if (espnBloccato && c.espn && fonti.espn) { saltati.push(c.nome); continue; }
    try {
      if (c.espn && fonti.espn) {
        const visti = new Map();
        for (const giorno of [data, giornoDopo(data)]) {
          for (const e of await fonti.espn.partite(c.espn, giorno)) if (e.casa && e.trasferta) visti.set(e.id, e);
        }
        eventi = [...visti.values()];
      } else if (fonti.footballDataUk.calendario) {
        fixtures ??= await fonti.footballDataUk.calendario();
        eventi = fixtures
          .filter((f) => (c.formato === 'extra' ? f.paese === c.paese && f.lega === c.lega : f.codice === c.csv))
          .map((f) => ({ id: `${c.csv}-${f.inizio}-${f.casa}`, casa: f.casa, trasferta: f.trasferta, inizio: f.inizio }));
      }
    } catch (e) {
      if (bloccoEspn(e)) espnBloccato = true;
      errore(c.espn ? `ESPN (${c.nome})` : `Calendario football-data.co.uk (${c.nome})`, e);
      if (!c.espn) fixtures = [];
      continue;
    }
    eventi = eventi.filter(dentro);
    if (eventi.length) eventiPer.set(chiaveEventi(c), eventi);
  }
  if (saltati.length) {
    errore('ESPN', new Error(`accesso negato (HTTP 403): ${saltati.length} campionati senza quote saltati (${saltati.join(', ')}), niente pronostici per loro oggi`));
  }
}

// Storico di un campionato extra: le ultime 3 stagioni con partite giocate fino a `data` (un solo file).
async function legaExtra(codice, { data, fonti, errore }) {
  let tutte;
  try {
    tutte = (await fonti.footballDataUk.partiteExtra(codice)).filter((x) => x.data < data);
  } catch (e) {
    errore(`football-data.co.uk ${codice}`, e);
    return null;
  }
  const stagioni = [...new Set(tutte.map((x) => x.stagione))].sort().reverse().slice(0, 3);
  const righe = tutte.filter((x) => stagioni.includes(x.stagione));
  if (!righe.length) return null;
  const ultima = stagioni[1] ? new Set(righe.filter((x) => x.stagione === stagioni[1]).flatMap((x) => [x.casa, x.trasferta])) : undefined;
  return {
    righe,
    nomi: [...new Set(righe.flatMap((x) => [x.casa, x.trasferta]))],
    forze: stimaForze(righe, { oggi: data, squadreUltimaStagione: ultima }),
    frequenze: frequenzeGol(righe, { oggi: data }),
  };
}

async function principale() {
  const i = process.argv.indexOf('--data');
  const adesso = new Date();
  const data = i > -1 ? process.argv[i + 1] : dataRoma(adesso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: node src/calcio/raccolta.js [--data AAAA-MM-GG]');
    process.exit(1);
  }
  const chiavi = { oddsApi: process.env.ODDS_API_KEY, footballDataOrg: process.env.FOOTBALL_DATA_ORG_KEY };
  if (!chiavi.oddsApi) {
    console.error('Manca ODDS_API_KEY');
    process.exit(1);
  }
  const leggi = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
  // Quote di odss-api scaricate poco prima dallo step della raccolta odss (questo step non ha la chiave).
  const q = leggiQuoteOdss('data', data);
  const fonti = {
    odss: { eventi: q.eventi?.length ? q.eventi : null, errori: q.mancante ? [`file data/raccolta/${data}-odss.json mancante`] : q.errori },
    oddsApi, footballDataUk, footballDataOrg, espn,
    // Coppe europee: punteggi (npm run elo-europeo) e partite con gli id ESPN delle squadre.
    eloEuropeo: leggi('data/storico/elo-europeo.json'),
    coppe: leggi('data/storico/coppe-europee.json')?.partite ?? null,
  };
  const raccolta = await eseguiRaccolta({ data, adesso, fonti, chiavi });
  let esiti = { aggiornate: 0 };
  try {
    esiti = await aggiornaEsitiGiro({ dirData: 'data/giornate', adesso, fonti, chiavi, raccolta, csv: raccolta.csv });
  } catch (e) {
    raccolta.erroriGiro.push(`Esiti alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  }
  mkdirSync('data/raccolta', { recursive: true });
  writeFileSync(`data/raccolta/${data}.json`, `${JSON.stringify(raccolta, null, 2)}\n`);
  console.log(`Raccolta ${data}: ${raccolta.partite.length} partite, ${raccolta.erroriGiro.length} errori, crediti rimasti ${raccolta.crediti.rimasti}`);
  console.log(`Esiti aggiornati: ${esiti.aggiornate}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Raccolta fallita: ${e?.message ?? e}`);
    process.exit(1);
  });
}
