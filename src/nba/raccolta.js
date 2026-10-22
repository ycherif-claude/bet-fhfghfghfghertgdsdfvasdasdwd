// Raccolta NBA: partite della giornata da SportsGameOdds, storico da balldontlie,
// punti attesi, linee comuni, quote mediane e consenso dei bookmaker.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { dataRoma, finestraGiornata, isoRoma, oraRoma, slug } from '../calcio/testo.js';
import { balldontlie } from './fonti/balldontlie.js';
import { sportsgameodds } from './fonti/sportsgameodds.js';
import { backToBack, formattaLinea, mercatiNba, pesoModelloPartita, puntiAttesi, stimaForzeNba } from './modello.js';
import { consensoNba, lineaComune, quotaMedianaNba, riferimentoMercato } from './quote.js';
import { squadraNba } from './squadre.js';
import { eventiOdssSport } from '../odss/sport.js';
import { femminile, inFormatoNba, legaAmmessa, unisciEventi } from '../odss/eventi.js';

// Nomi esatti del campionato NBA su odss-api (il filtro league "nba" porta anche WNBA e "NBA - Fantasy Matches").
export const LEGHE_NBA = Object.freeze(['NBA', 'USA ~ NBA', 'NBA Cup', 'NBA Cup - Fase a Gironi', 'Košarka NBA']);
import { aggiornaEsitiGiroNba, dataUsaDi } from './esiti.js';

export const ERRORE_CHIAVI = 'Mancano le chiavi NBA (BALLDONTLIE_API_KEY, SPORTSGAMEODDS_API_KEY)';

// Stagione balldontlie = anno d'inizio: da ottobre in poi l'anno stesso, prima l'anno precedente.
export function stagioneNba(data) {
  const [anno, mese] = data.split('-').map(Number);
  return mese >= 10 ? anno : anno - 1;
}

const decimo = (n) => Math.round(n * 10) / 10;
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

const puntiEsatti = (n) => (n === 1 ? '1 punto esatto' : `${n} punti esatti`);

// Handicap dal punto di vista della squadra scelta, con la sua linea (con il segno).
function spiegaHandicap(squadra, linea) {
  const i = `i ${squadra}`;
  if (linea === 0) return `vince se ${i} vincono la partita, supplementari compresi`;
  const intera = Number.isInteger(linea);
  if (linea < 0) {
    const k = Math.floor(-linea) + 1;
    return `vince se ${i} vincono con almeno ${k} punti di scarto, supplementari compresi${intera ? ` (con ${puntiEsatti(-linea)} di scarto è rimborsata)` : ''}`;
  }
  const soglia = intera ? linea : Math.ceil(linea);
  const base = soglia <= 1
    ? `vince se ${i} vincono la partita`
    : `vince se ${i} perdono con meno di ${soglia} punti di scarto o vincono`;
  return `${base}, supplementari compresi${intera ? ` (se perdono con ${puntiEsatti(linea)} di scarto è rimborsata)` : ''}`;
}

function spiegaTotale(lato, linea) {
  const rimborso = Number.isInteger(linea) ? ` (con ${linea} esatti è rimborsata)` : '';
  if (lato === 'Over') return `Over vince se le due squadre segnano almeno ${Math.floor(linea) + 1} punti in tutto, supplementari compresi${rimborso}`;
  return `Under vince se le due squadre segnano al massimo ${Math.ceil(linea) - 1} punti in tutto, supplementari compresi${rimborso}`;
}

const CODA = 'e quota almeno la minima';

// Una riga in italiano per ogni mercato (spec §5.5). Per l'handicap parla della squadra scelta
// e della sua linea: sulla scheda della trasferta la linea è quella opposta al nome del mercato.
export function spiegazioneMercato(mercato, selezione, nomi, linee) {
  if (mercato === 'Vincente') {
    return `Vincente: vince se ${selezione} vince la partita, supplementari compresi. Gioca solo con quota almeno la minima.`;
  }
  if (mercato.startsWith('Handicap ')) {
    const h = linee.handicap;
    const sq = selezione === 'casa' ? nomi.casa : nomi.trasferta;
    const lineaSq = selezione === 'casa' ? h : -h;
    return `Handicap: ${spiegaHandicap(sq, lineaSq)}. Gioca solo su ${sq} ${formattaLinea(lineaSq)} (stessa linea) ${CODA}: con una linea diversa il calcolo non vale.`;
  }
  const lato = selezione.split(' ')[0];
  return `${mercato}: ${spiegaTotale(lato, linee.totale)}. Gioca solo con la stessa linea (${linee.totale}) ${CODA}: con una linea diversa il calcolo non vale.`;
}

// Partite NBA dagli eventi di odss-api: squadre NBA (le altre, WNBA compresa, fuori), più eventi della stessa partita
// (stesse squadre, inizio vicino) uniti, bookmaker nel formato NBA. { eventi, handicapScartati }.
export function partiteNbaDaOdss(eventi) {
  const gruppi = [];
  const ordinati = (eventi ?? []).filter((e) => !femminile(e) && legaAmmessa(e.campionato, LEGHE_NBA)).sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio));
  for (const e of ordinati) {
    const casa = squadraNba(e.casa);
    const trasferta = squadraNba(e.trasferta);
    if (!casa || !trasferta || casa.abbr === trasferta.abbr) continue;
    const g = gruppi.find((x) => x.casa.abbr === casa.abbr && x.trasferta.abbr === trasferta.abbr
      && Math.abs(Date.parse(e.inizio) - Date.parse(x.eventi[0].inizio)) <= CONFIG.odss.toleranzaOre * 3600000);
    if (g) g.eventi.push(e);
    else gruppi.push({ casa, trasferta, eventi: [e] });
  }
  let handicapScartati = 0;
  const out = [];
  for (const g of gruppi) {
    const unito = unisciEventi(g.eventi);
    const f = inFormatoNba(unito);
    if (f.handicapScartato) handicapScartati++;
    if (f.bookmaker.length) out.push({ id: unito.id, casa: g.casa.nome, trasferta: g.trasferta.nome, inizio: g.eventi[0].inizio, bookmaker: f.bookmaker });
  }
  return { eventi: out, handicapScartati };
}

export async function eseguiRaccoltaNba({ data, adesso, fonti, chiavi, dirData = 'data' }) {
  const erroriGiro = [];
  const errore = (fonte, e) => erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const ora = isoRoma(adesso);
  const raccolta = {
    data, generataAlle: ora, crediti: { sportsgameodds: { oggetti: 0 } },
    competizioniNonCoperte: [], erroriGiro, partite: [],
  };
  if (!chiavi?.balldontlie || (!chiavi?.sportsgameodds && !chiavi?.odss)) {
    erroriGiro.push(ERRORE_CHIAVI);
    return raccolta;
  }

  const finestra = finestraGiornata(data);
  const dentroFinestra = (x) => Number.isFinite(Date.parse(x)) && Date.parse(x) >= finestra.da.getTime() && Date.parse(x) < finestra.a.getTime();

  // 1. Storico (stagione corrente e precedente) da balldontlie: serve al modello e, con le partite non ancora giocate,
  // è il calendario della giornata con cui si controlla la copertura di odss [revisione, 23/10/2026].
  const stagione = stagioneNba(data);
  const storico = [];
  const ignoteStorico = [];
  let senzaData = 0;
  let caricate = 0;
  let precedente = false;
  for (const s of [stagione, stagione - 1]) {
    try {
      const p = await fonti.balldontlie.partite({ stagioni: [s] }, { chiave: chiavi.balldontlie });
      storico.push(...p);
      ignoteStorico.push(...(p.nonRiconosciute ?? []));
      senzaData += p.diagnostica?.senzaData ?? 0;
      caricate++;
      if (s === stagione - 1) precedente = true;
    } catch (e) {
      errore(`balldontlie stagione ${s}`, e);
    }
  }
  const calendario = caricate ? [...new Map(storico.filter((g) => dentroFinestra(g.inizio)).map((g) => [g.id, g])).values()] : null;

  // 2. Partite della giornata con le quote: prima odss-api (fonte principale) [utente, 22/10/2026], una richiesta
  // (league "nba") solo se il calendario ha partite (senza calendario: solo in stagione, ottobre-giugno). Se odss non
  // risponde, non ha partite NBA o non copre tutte le partite del calendario: SportsGameOdds per la giornata.
  let eventi = null;
  let fonteQuote = 'SportsGameOdds';
  let daOdss = null;
  if (Object.hasOwn(chiavi, 'odss')) {
    const mese = Number(data.slice(5, 7));
    const inStagione = mese >= 10 || mese <= 6;
    const partite = calendario ? calendario.length : inStagione ? null : 0;
    const o = await eventiOdssSport({
      dirData, data, adesso, chiave: chiavi.odss, sport: 'basket', budgetSport: 'nba', gruppi: ['moneyline,ah,ou'], league: 'nba',
      finestra, fetch: fonti.fetchOdss, attesaMs: fonti.attesaOdssMs, partite, nome: 'NBA',
    });
    erroriGiro.push(...o.errori);
    const p = partiteNbaDaOdss(o.eventi);
    if (p.handicapScartati) errore('odss-api', plurale(p.handicapScartati, 'handicap NBA scartato: linea della casa con il verso opposto al vincente', 'handicap NBA scartati: linea della casa con il verso opposto al vincente'));
    const coperta = (g) => p.eventi.some((e) => e.casa === g.casa && e.trasferta === g.trasferta
      && Math.abs(Date.parse(e.inizio) - Date.parse(g.inizio)) <= CONFIG.odss.toleranzaOre * 3600000);
    const mancanti = calendario ? calendario.filter((g) => !coperta(g)).length : 0;
    if (p.eventi.length) daOdss = Object.defineProperty(p.eventi, 'nonRiconosciute', { value: [], enumerable: false });
    if (p.eventi.length && !mancanti) {
      eventi = daOdss;
      fonteQuote = 'odss-api';
    } else if (p.eventi.length) {
      erroriGiro.push(`NBA: ${mancanti} partite su ${calendario.length} non coperte da odss-api, quote da SportsGameOdds`);
    } else if (partite !== 0) {
      erroriGiro.push(`Quote NBA: nessuna partita NBA su odss-api, quote da SportsGameOdds`);
    }
  }
  if (!eventi) {
    if (!chiavi.sportsgameodds) {
      if (!daOdss) { erroriGiro.push(ERRORE_CHIAVI); return raccolta; }
      eventi = daOdss;
      fonteQuote = 'odss-api';
    } else {
      try {
        eventi = await fonti.sportsgameodds.eventi(finestra, { chiave: chiavi.sportsgameodds });
        raccolta.crediti.sportsgameodds.oggetti = eventi.length;
      } catch (e) {
        errore('SportsGameOdds', e);
        // SportsGameOdds giù: meglio le partite che odss copre che niente.
        if (!daOdss) return raccolta;
        eventi = daOdss;
        fonteQuote = 'odss-api';
      }
    }
  }
  const ignote = [...(eventi.nonRiconosciute ?? []), ...ignoteStorico];
  // Riga di diagnostica di SportsGameOdds: si scrive alla fine, con i mercati scartati senza consenso.
  const d = eventi.diagnostica;
  const parti = [];
  if (d) {
    if (d.lineaMancante?.handicap) parti.push(`${d.lineaMancante.handicap} handicap senza linea`);
    if (d.lineaMancante?.totale) parti.push(`${d.lineaMancante.totale} totali senza linea`);
    if (d.quoteNonConvertibili) parti.push(plurale(d.quoteNonConvertibili, 'quota non convertibile', 'quote non convertibili'));
    if (d.handicapAsimmetrico) parti.push(`${d.handicapAsimmetrico} handicap con linee non opposte`);
  }
  let senzaConsenso = 0;
  const diagnostica = () => {
    if (senzaConsenso) parti.push(plurale(senzaConsenso, 'mercato senza consenso dei bookmaker', 'mercati senza consenso dei bookmaker'));
    if (parti.length) errore(fonteQuote, parti.join(', '));
  };
  const dentro = (e) => {
    if (!e.inizio) {
      errore(fonteQuote, `evento ${e.casa} - ${e.trasferta} senza orario d'inizio`);
      return false;
    }
    const t = Date.parse(e.inizio);
    return t >= finestra.da.getTime() && t < finestra.a.getTime();
  };
  const delGiorno = eventi.filter(dentro);
  if (delGiorno.length && !delGiorno.some((e) => e.bookmaker.some((b) => b.mercati?.handicap))) {
    errore(fonteQuote, fonteQuote === 'odss-api' ? 'nessun handicap disponibile' : 'nessun handicap disponibile (controllare il campo spread)');
  }

  if (senzaData) errore('balldontlie', plurale(senzaData, 'partita senza data', 'partite senza data'));
  if (ignote.length) erroriGiro.push(`Squadre NBA non riconosciute: ${[...new Set(ignote)].join(', ')}`);
  if (!caricate || !delGiorno.length) {
    diagnostica();
    return raccolta;
  }

  // 3. Forze e partite.
  const forze = stimaForzeNba(storico, { oggi: data, stagioneCorrente: stagione });
  const intero = (n) => String(Math.round(n));
  // Senza la stagione precedente, a inizio stagione le forze poggiano su troppo poche partite.
  const poche = (sq) => (forze.partiteStagione?.get(sq) ?? 0) < CONFIG.nba.minPartiteStagione;
  for (const ev of delGiorno) {
    const nomi = { casa: ev.casa, trasferta: ev.trasferta };
    if (!precedente && (poche(ev.casa) || poche(ev.trasferta))) {
      erroriGiro.push(`NBA: ${ev.casa} - ${ev.trasferta} senza dati sufficienti (stagione precedente non disponibile)`);
      continue;
    }
    const dataUsa = dataUsaDi(new Date(ev.inizio));
    const b2b = { casa: backToBack(storico, ev.casa, dataUsa), trasferta: backToBack(storico, ev.trasferta, dataUsa) };
    const attesi = puntiAttesi(forze, ev.casa, ev.trasferta, { b2bCasa: b2b.casa, b2bTrasferta: b2b.trasferta });
    if (!attesi) {
      errore('Modello NBA', `nessun dato storico per ${ev.casa} - ${ev.trasferta}`);
      continue;
    }
    const linee = { handicap: lineaComune(ev, 'handicap'), totale: lineaComune(ev, 'totale') };
    const modello = mercatiNba(attesi, {
      handicap: linee.handicap === null ? [] : [linee.handicap],
      totale: linee.totale === null ? [] : [linee.totale],
    }, forze, nomi);

    const mercati = [];
    for (const m of modello) {
      let tipo; let sel; let linea = null;
      if (m.mercato === 'Vincente') {
        tipo = 'vincente'; sel = m.selezione === nomi.casa ? 'casa' : 'trasferta';
      } else if (m.mercato.startsWith('Handicap ')) {
        tipo = 'handicap'; sel = m.selezione; linea = linee.handicap;
      } else {
        tipo = 'totale'; sel = m.selezione.startsWith('Over') ? 'over' : 'under'; linea = linee.totale;
      }
      const q = quotaMedianaNba(ev, tipo, sel, linea);
      if (!q) continue;
      // Senza consenso (meno di minBookmaker con entrambe le quote) il mercato non si propone.
      // odss-api: Pinnacle se c'è, altrimenti il consenso; SportsGameOdds: il consenso di tutti, come sempre.
      const rif = fonteQuote === 'odss-api' ? riferimentoMercato(ev, tipo, linea)
        : (() => { const c = consensoNba(ev, tipo, linea); return c ? { prob: c, etichetta: 'Consenso bookmaker' } : null; })();
      const consenso = rif?.prob;
      if (consenso?.[sel] == null) { senzaConsenso++; continue; }
      mercati.push({
        mercato: m.mercato,
        selezione: m.selezione,
        probModello: m.probModello,
        probPinnacle: consenso[sel],
        quota: q.quota,
        fonteQuota: `mediana di ${q.n} bookmaker (${fonteQuote})`,
        oraQuota: ora,
        frequenzaCampionato: null,
        ...(rif.etichetta === 'Pinnacle' ? {} : { etichettaMercato: rif.etichetta }),
        spiegazione: spiegazioneMercato(m.mercato, m.selezione, nomi, linee),
      });
    }
    if (!mercati.length) {
      errore(fonteQuote, `nessuna quota utilizzabile per ${ev.casa} - ${ev.trasferta}`);
      continue;
    }
    const ragionamentoBase = [`Punti attesi: ${ev.casa} ${intero(attesi.casa)} – ${ev.trasferta} ${intero(attesi.trasferta)} (stagione in corso e precedente)`];
    if (b2b.casa) ragionamentoBase.push(`${ev.casa} alla seconda partita in due sere`);
    if (b2b.trasferta) ragionamentoBase.push(`${ev.trasferta} alla seconda partita in due sere`);
    raccolta.partite.push({
      idPartita: `nba-${data}-${slug(ev.casa)}-${slug(ev.trasferta)}`,
      sport: 'nba',
      competizione: 'NBA',
      partita: `${ev.casa} - ${ev.trasferta}`,
      casa: ev.casa,
      trasferta: ev.trasferta,
      inizio: isoRoma(new Date(ev.inizio)),
      modello: 'nba',
      lambda: null,
      puntiAttesi: { casa: decimo(attesi.casa), trasferta: decimo(attesi.trasferta) },
      pesoModello: pesoModelloPartita(forze, ev.casa, ev.trasferta),
      backToBack: b2b,
      ragionamentoBase,
      mercati,
    });
  }
  diagnostica();
  return raccolta;
}

// Raccolta vuota per un imprevisto: l'errore è registrato e il calcio non viene bloccato.
export function raccoltaDiErrore(data, adesso, e) {
  return {
    data, generataAlle: isoRoma(adesso), crediti: { sportsgameodds: { oggetti: 0 } },
    competizioniNonCoperte: [], erroriGiro: [`NBA alle ${oraRoma(adesso)}: ${e?.message ?? e}`], partite: [],
  };
}

async function principale() {
  const i = process.argv.indexOf('--data');
  const adesso = new Date();
  const data = i > -1 ? process.argv[i + 1] : dataRoma(adesso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: node src/nba/raccolta.js [--data AAAA-MM-GG]');
    process.exit(1);
  }
  const chiavi = { balldontlie: process.env.BALLDONTLIE_API_KEY, sportsgameodds: process.env.SPORTSGAMEODDS_API_KEY, odss: process.env.ODSS_API_KEY };
  const fonti = { balldontlie, sportsgameodds };
  let raccolta;
  try {
    raccolta = await eseguiRaccoltaNba({ data, adesso, fonti, chiavi });
  } catch (e) {
    // Qualunque imprevisto: file con partite [] e l'errore, uscita 0, così il calcio viene comunque salvato.
    raccolta = raccoltaDiErrore(data, adesso, e);
  }
  let esiti = { aggiornate: 0 };
  if (chiavi.balldontlie) {
    try {
      esiti = await aggiornaEsitiGiroNba({ dirData: 'data/giornate', adesso, fonti, chiavi, raccolta });
    } catch (e) {
      raccolta.erroriGiro.push(`Esiti NBA alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
    }
  }
  mkdirSync('data/raccolta', { recursive: true });
  writeFileSync(`data/raccolta/${data}-nba.json`, `${JSON.stringify(raccolta, null, 2)}\n`);
  console.log(`Raccolta NBA ${data}: ${raccolta.partite.length} partite, ${raccolta.erroriGiro.length} errori`);
  console.log(`Esiti NBA aggiornati: ${esiti.aggiornate}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Raccolta NBA fallita: ${e?.message ?? e}`);
  });
}
