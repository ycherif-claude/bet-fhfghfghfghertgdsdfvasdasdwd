// Raccolta mattutina: eventi, quote, CSV storici e probabilità del modello per ogni partita del giorno.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { COMPETIZIONI } from './competizioni.js';
import { abbinaSquadra } from './squadre.js';
import { dataRoma, finestraGiornata, isoRoma, oraRoma, slug } from './testo.js';
import { quotaMediana, probPinnacle } from './quote.js';
import { lambda, stimaForze } from './modelli/gol.js';
import { frequenzeGol, mercatiGol } from './modelli/mercati-gol.js';
import { mercatiConteggi } from './modelli/conteggi.js';
import { oddsApi } from './fonti/odds-api.js';
import { footballDataUk } from './fonti/football-data-uk.js';
import { footballDataOrg } from './fonti/football-data-org.js';

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
  for (const c of COMPETIZIONI) {
    try {
      const r = await fonti.oddsApi.eventi(c.chiave, finestra, { chiave: chiavi.oddsApi });
      if (rimasti === null && r.rimasti !== null && r.rimasti !== undefined) rimasti = r.rimasti;
      const eventi = r.eventi.filter(dentro);
      if (eventi.length) eventiPer.set(c.chiave, eventi);
    } catch (e) {
      errore(`The Odds API (${c.nome})`, e);
    }
  }
  if (rimasti === null) {
    errore('The Odds API', new Error('crediti rimasti sconosciuti'));
    rimasti = 0;
  }

  // 2. Budget e scelta delle competizioni.
  const conPartite = COMPETIZIONI.filter((c) => eventiPer.has(c.chiave));
  const budget = budgetCrediti(rimasti, data);
  const { scelte, scoperte } = scegliCompetizioni(conPartite, budget);
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

  // 4. CSV: una volta per codice e stagione, un errore non fa perdere le altre stagioni.
  const stagioni = stagioniDa(data);
  const leghe = new Map();
  async function lega(codice) {
    if (leghe.has(codice)) return leghe.get(codice);
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
    if (perStagione[0]) {
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
    const stato = c.modello === 'dixon-coles' ? await lega(c.csv) : null;
    for (const base of eventiPer.get(c.chiave)) {
      const evento = quote?.get(base.id) ?? { ...base, bookmaker: [] };
      const partita = costruisciPartita({ c, evento, base, stato, data, ora, errore: (m) => erroriGiro.push(m) });
      if (partita) partite.push(partita);
    }
  }

  return { data, generataAlle: ora, crediti, competizioniNonCoperte, erroriGiro, partite };
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

function costruisciPartita({ c, evento, base, stato, data, ora, errore }) {
  const casa = base.casa;
  const trasferta = base.trasferta;
  const voce = (mercato, selezione, probModello, frequenzaCampionato) => {
    const l = datiLiberi(evento, mercato, selezione);
    return {
      mercato, selezione, probModello, probPinnacle: l.probPinnacle,
      quota: l.quota ?? null,
      fonteQuota: l.quota != null ? `mediana di ${l.n} bookmaker (The Odds API)` : null,
      oraQuota: l.quota != null ? ora : null,
      frequenzaCampionato,
    };
  };

  let modello = c.modello;
  let lam = null;
  let mercati = [];
  let ragionamentoBase = [];

  if (c.modello === 'solo-pinnacle') {
    ragionamentoBase = ['Coppa o nazionale: probabilità solo da Pinnacle (nessun modello tra campionati diversi)'];
    mercati = soloLiberi(voce);
  } else if (!stato) {
    // Nessun dato storico (errore già registrato): restano le probabilità di Pinnacle.
    mercati = soloLiberi(voce);
  } else {
    const csvCasa = abbinaSquadra(casa, stato.nomi);
    const csvTrasferta = abbinaSquadra(trasferta, stato.nomi);
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
  const raccolta = await eseguiRaccolta({ data, adesso, fonti: { oddsApi, footballDataUk, footballDataOrg }, chiavi });
  mkdirSync('data/raccolta', { recursive: true });
  writeFileSync(`data/raccolta/${data}.json`, `${JSON.stringify(raccolta, null, 2)}\n`);
  console.log(`Raccolta ${data}: ${raccolta.partite.length} partite, ${raccolta.erroriGiro.length} errori, crediti rimasti ${raccolta.crediti.rimasti}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Raccolta fallita: ${e?.message ?? e}`);
    process.exit(1);
  });
}
