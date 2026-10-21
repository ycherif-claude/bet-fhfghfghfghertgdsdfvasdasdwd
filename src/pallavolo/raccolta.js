// Raccolta pallavolo del mattino (Fase 4d): storico da TheSportsDB salvato in data/storico, palinsesto
// e quote da OddsPapi (250 richieste al mese: poche partite al giorno, per priorità del campionato),
// Elo con il margine in set → data/raccolta/<data>-pallavolo.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { dataRoma, finestraGiornata, isoRoma, oraRoma, slug } from '../calcio/testo.js';
import { quotaMedianaNba } from '../nba/quote.js';
import { riferimento } from '../basket/raccolta.js';
import { thesportsdb } from '../basket/fonti/thesportsdb.js';
import { aggiornaStorico, stagioneBasket } from '../basket/storico.js';
import { CAMPIONATI_PALLAVOLO } from './campionati.js';
import { oddspapi } from './fonti/oddspapi.js';
import { abbinaSquadra, squadreStorico } from './squadre.js';
import { calcolaEloPallavolo, mercatiPallavolo, pesoModelloPallavolo, probPartita } from './modello.js';
import { aggiornaEsitiPallavolo } from './esiti.js';

const P = CONFIG.pallavolo;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

export const fileStorico = (c) => `pallavolo-${c.id}`;

// Righe per il modello e gli esiti: partite finite con un risultato in set valido (3-0, 3-1, 3-2).
export function righePallavolo(partite) {
  return partite.filter((p) => p.idCasa && p.idTrasferta && num(p.puntiCasa) && num(p.puntiTrasferta)
    && Math.max(p.puntiCasa, p.puntiTrasferta) === 3 && Math.min(p.puntiCasa, p.puntiTrasferta) <= 2)
    .map((p) => ({
      id: p.id, idCasa: p.idCasa, idTrasferta: p.idTrasferta, setCasa: p.puntiCasa, setTrasferta: p.puntiTrasferta,
      data: dataRoma(new Date(p.inizio)), stagione: p.stagione,
    }));
}

// Richieste del mese: dal conto di OddsPapi (gratuito) o, se non le dice, dal contatore locale.
const fileStato = (dirData) => join(dirData, 'stato', 'oddspapi.json');
function leggiStato(dirData, mese) {
  try {
    const j = JSON.parse(readFileSync(fileStato(dirData), 'utf8'));
    return j?.mese === mese && num(j.richieste) ? j.richieste : 0;
  } catch {
    return 0;
  }
}
function scriviStato(dirData, mese, richieste, adesso) {
  mkdirSync(join(dirData, 'stato'), { recursive: true });
  writeFileSync(fileStato(dirData), `${JSON.stringify({ mese, richieste, aggiornatoAlle: isoRoma(adesso) }, null, 2)}\n`);
}

// Richieste spendibili oggi: (limite − usate − riserva del 20%) diviso i giorni che restano nel mese, oggi compreso.
export function budgetRichieste(limite, usate, data) {
  const [anno, mese, giorno] = data.split('-').map(Number);
  const rimanenti = new Date(Date.UTC(anno, mese, 0)).getUTCDate() - giorno + 1;
  return Math.max(0, Math.floor((limite - usate - P.riservaRichieste * limite) / rimanenti));
}

const spiegazioni = {
  Vincente: (sel) => `Vincente: vince se ${sel} vince la partita.`,
  'Handicap set -1.5': (sel, n) => (sel === 'casa'
    ? `Handicap set: ${n.casa} -1,5 vince se ${n.casa} vince 3-0 o 3-1.`
    : `Handicap set: ${n.trasferta} +1,5 vince se ${n.trasferta} vince la partita o perde 2-3.`),
  'Handicap set +1.5': (sel, n) => (sel === 'casa'
    ? `Handicap set: ${n.casa} +1,5 vince se ${n.casa} vince la partita o perde 2-3.`
    : `Handicap set: ${n.trasferta} -1,5 vince se ${n.trasferta} vince 3-0 o 3-1.`),
  'Totale set 3.5': (sel) => (sel.startsWith('Over')
    ? 'Totale set: Over 3.5 vince se si gioca il quarto set (la partita finisce 3-1, 1-3, 3-2 o 2-3).'
    : 'Totale set: Under 3.5 vince se la partita finisce 3-0 o 0-3.'),
};

const VOCI = (nomi) => [
  { mercato: 'Vincente', selezione: nomi.casa, tipo: 'vincente', sel: 'casa', linea: null },
  { mercato: 'Vincente', selezione: nomi.trasferta, tipo: 'vincente', sel: 'trasferta', linea: null },
  { mercato: 'Handicap set -1.5', selezione: 'casa', tipo: 'handicap', sel: 'casa', linea: -1.5 },
  { mercato: 'Handicap set -1.5', selezione: 'trasferta', tipo: 'handicap', sel: 'trasferta', linea: -1.5 },
  { mercato: 'Handicap set +1.5', selezione: 'casa', tipo: 'handicap', sel: 'casa', linea: 1.5 },
  { mercato: 'Handicap set +1.5', selezione: 'trasferta', tipo: 'handicap', sel: 'trasferta', linea: 1.5 },
  { mercato: 'Totale set 3.5', selezione: 'Over 3.5', tipo: 'totale', sel: 'over', linea: 3.5 },
  { mercato: 'Totale set 3.5', selezione: 'Under 3.5', tipo: 'totale', sel: 'under', linea: 3.5 },
];

// Quota bet365 di un mercato (sulla scheda accanto alla mediana), o null.
function quotaBet365(bookmaker, v) {
  const m = bookmaker.find((b) => b.chiave === 'bet365')?.mercati?.[v.tipo];
  const c = v.linea === null ? m : m?.[String(v.linea)];
  return num(c?.[v.sel]) ? c[v.sel] : null;
}

export function costruisciMercati({ bookmaker, probCasa, nomi, ora, conta }) {
  const evento = { bookmaker };
  const modello = probCasa === null ? [] : mercatiPallavolo(probCasa, nomi);
  const mercati = [];
  for (const v of VOCI(nomi)) {
    const q = quotaMedianaNba(evento, v.tipo, v.sel, v.linea, P.minBookmaker);
    if (!q) continue;
    const rif = riferimento(evento, v.tipo, v.linea);
    if (rif?.prob?.[v.sel] == null) { conta.senzaRiferimento++; continue; }
    const b365 = quotaBet365(bookmaker, v);
    mercati.push({
      mercato: v.mercato,
      selezione: v.selezione,
      probModello: modello.find((m) => m.mercato === v.mercato && m.selezione === v.selezione)?.probModello ?? null,
      probPinnacle: rif.prob[v.sel],
      quota: q.quota,
      fonteQuota: `mediana di ${q.n} bookmaker (OddsPapi)`,
      oraQuota: ora,
      ...(b365 === null ? {} : { quotaBet365: b365, oraQuotaBet365: ora }),
      frequenzaCampionato: null,
      ...(rif.etichetta === 'Pinnacle' ? {} : { etichettaMercato: rif.etichetta }),
      spiegazione: spiegazioni[v.mercato](v.selezione, nomi),
    });
  }
  return mercati;
}

function vuota(data, adesso) {
  return {
    data, generataAlle: isoRoma(adesso), crediti: { oddspapi: { usate: 0, rimaste: null } },
    competizioniNonCoperte: [], erroriGiro: [], partite: [],
  };
}

export async function eseguiRaccoltaPallavolo({ data, adesso, fonti, chiavi, dirData = 'data', pausaMs }) {
  const raccolta = vuota(data, adesso);
  const { erroriGiro } = raccolta;
  const errore = (fonte, e) => erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const ora = raccolta.generataAlle;
  const corrente = stagioneBasket(data);

  // 1. Storico (gratuito, anche senza chiave): modello di oggi ed esiti dei giorni passati.
  const storici = new Map();
  for (const c of CAMPIONATI_PALLAVOLO.filter((x) => x.thesportsdb)) {
    const { partite } = await aggiornaStorico({
      campionato: fileStorico(c), nomeFonte: `TheSportsDB (${c.competizione})`, dirData, data, adesso, errore,
      scarica: (s, g) => fonti.thesportsdb.round(s, g, {}, c.thesportsdb),
      pausaMs: pausaMs ?? P.pausaTheSportsDbMs, maxRichieste: P.maxGiornateGiorno,
    });
    storici.set(c.id, partite);
  }
  Object.defineProperty(raccolta, 'storici', { value: storici, enumerable: false });
  // Coperti solo i campionati con partite finite nella stagione in corso: servono agli esiti.
  const attivi = CAMPIONATI_PALLAVOLO.filter((c) => (storici.get(c.id) ?? []).some((p) => p.stagione === corrente && p.finita !== false));

  if (!chiavi?.oddspapi) {
    errore('OddsPapi', 'manca ODDSPAPI_API_KEY');
    return raccolta;
  }
  const opz = { chiave: chiavi.oddspapi };
  const mese = data.slice(0, 7);

  // 2. Richieste disponibili oggi.
  let conto = null;
  try {
    conto = await fonti.oddspapi.conto(opz);
  } catch (e) {
    errore('OddsPapi (conto)', e);
  }
  const limite = conto?.limite ?? P.richiesteMese;
  let usate = conto?.usate ?? leggiStato(dirData, mese);
  const budget = budgetRichieste(limite, usate, data);
  raccolta.crediti.oddspapi.rimaste = limite - usate;
  // Servono almeno l'elenco delle partite e le quote di una partita.
  if (budget < 2) {
    raccolta.competizioniNonCoperte.push('Pallavolo: richieste OddsPapi finite per oggi');
    return raccolta;
  }
  let spese = 0;
  const spendi = () => { spese++; usate++; };

  // 3. Palinsesto (1 richiesta per tutti i campionati).
  const finestra = finestraGiornata(data);
  let elenco = [];
  try {
    elenco = await fonti.oddspapi.partite(finestra, opz);
    spendi();
  } catch (e) {
    errore('OddsPapi (partite)', e);
  }
  const perTorneo = new Map(CAMPIONATI_PALLAVOLO.map((c) => [c.oddspapi, c]));
  const daGiocare = elenco.filter((f) => perTorneo.has(f.torneo) && f.casa && f.trasferta
    && Date.parse(f.inizio) >= Math.max(finestra.da.getTime(), adesso.getTime()) && Date.parse(f.inizio) < finestra.a.getTime());
  const senzaStorico = new Set();
  const candidate = [];
  const ignote = new Map();
  for (const f of daGiocare) {
    const c = perTorneo.get(f.torneo);
    if (!attivi.includes(c)) { senzaStorico.add(c.competizione); continue; }
    const squadre = squadreStorico(storici.get(c.id));
    const idCasa = abbinaSquadra(f.casa, squadre);
    const idTrasferta = abbinaSquadra(f.trasferta, squadre);
    if (!idCasa || !idTrasferta || idCasa === idTrasferta) {
      // Squadra non riconosciuta: niente richiesta delle quote (né modello né esito).
      if (!ignote.has(c.competizione)) ignote.set(c.competizione, new Set());
      for (const [n, id] of [[f.casa, idCasa], [f.trasferta, idTrasferta]]) if (!id || idCasa === idTrasferta) ignote.get(c.competizione).add(n);
      continue;
    }
    candidate.push({ f, c, idCasa, idTrasferta, priorita: CAMPIONATI_PALLAVOLO.indexOf(c) });
  }
  for (const comp of senzaStorico) raccolta.competizioniNonCoperte.push(`${comp}: senza storico gratuito della stagione in corso`);
  for (const [comp, nomi] of ignote) erroriGiro.push(`Squadre ${comp} non riconosciute: ${[...nomi].join(', ')}`);
  candidate.sort((a, b) => a.priorita - b.priorita || Date.parse(a.f.inizio) - Date.parse(b.f.inizio));

  // 4. Quote, una partita alla volta, finché bastano le richieste.
  const modelli = new Map();
  const conta = { senzaRiferimento: 0, senzaQuota: 0 };
  const scoperte = new Map();
  for (const x of candidate) {
    if (spese >= budget) {
      scoperte.set(x.c.competizione, (scoperte.get(x.c.competizione) ?? 0) + 1);
      continue;
    }
    await pausa(pausaMs ?? P.pausaOddsPapiMs);
    let bookmaker;
    try {
      bookmaker = await fonti.oddspapi.quote(x.f.id, opz);
      spendi();
    } catch (e) {
      errore(`OddsPapi (${x.f.casa} - ${x.f.trasferta})`, e);
      continue;
    }
    if (!modelli.has(x.c.id)) modelli.set(x.c.id, calcolaEloPallavolo(righePallavolo(storici.get(x.c.id))));
    const { elo, giocate } = modelli.get(x.c.id);
    const nomi = { casa: x.f.casa, trasferta: x.f.trasferta };
    const poche = Math.min(giocate.get(x.idCasa) ?? 0, giocate.get(x.idTrasferta) ?? 0) < P.minPartiteModello;
    const probCasa = poche ? null : probPartita(elo.get(x.idCasa), elo.get(x.idTrasferta));
    const mercati = costruisciMercati({ bookmaker, probCasa, nomi, ora, conta });
    if (!mercati.length) { conta.senzaQuota++; continue; }
    const pct = (p) => `${Math.round(p * 100)}%`;
    raccolta.partite.push({
      idPartita: `pallavolo-${data}-${slug(x.f.casa)}-${slug(x.f.trasferta)}`,
      sport: 'pallavolo',
      competizione: x.c.competizione,
      partita: `${x.f.casa} - ${x.f.trasferta}`,
      casa: x.f.casa,
      trasferta: x.f.trasferta,
      inizio: isoRoma(new Date(x.f.inizio)),
      modello: poche ? 'solo-pinnacle' : 'elo',
      lambda: null,
      elo: poche ? null : { [x.f.casa]: Math.round(elo.get(x.idCasa)), [x.f.trasferta]: Math.round(elo.get(x.idTrasferta)) },
      pesoModello: poche ? null : pesoModelloPallavolo(giocate, x.idCasa, x.idTrasferta),
      ragionamentoBase: poche
        ? [`Meno di ${P.minPartiteModello} partite salvate per almeno una squadra: probabilità solo dal mercato`]
        : [`Elo: ${x.f.casa} ${Math.round(elo.get(x.idCasa))} – ${x.f.trasferta} ${Math.round(elo.get(x.idTrasferta))}, vantaggio campo compreso: vittoria della casa ${pct(probCasa)} (ultime 2 stagioni TheSportsDB)`],
      mercati,
    });
  }
  for (const [comp, n] of scoperte) raccolta.competizioniNonCoperte.push(`${comp}: richieste OddsPapi finite (${plurale(n, 'partita', 'partite')})`);
  if (conta.senzaQuota) errore('OddsPapi', `${plurale(conta.senzaQuota, 'partita', 'partite')} senza quota utilizzabile`);
  if (conta.senzaRiferimento) errore('OddsPapi', `${plurale(conta.senzaRiferimento, 'mercato', 'mercati')} senza Pinnacle né consenso dei bookmaker`);
  raccolta.crediti.oddspapi = { usate: spese, rimaste: limite - usate };
  scriviStato(dirData, mese, usate, adesso);
  return raccolta;
}

// Raccolta vuota per un imprevisto: l'errore è registrato e gli altri sport non vengono bloccati.
export function raccoltaDiErrore(data, adesso, e) {
  const raccolta = vuota(data, adesso);
  raccolta.erroriGiro.push(`Pallavolo alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  return raccolta;
}

async function principale() {
  const i = process.argv.indexOf('--data');
  const adesso = new Date();
  const data = i > -1 ? process.argv[i + 1] : dataRoma(adesso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: node src/pallavolo/raccolta.js [--data AAAA-MM-GG]');
    process.exit(1);
  }
  const dirData = 'data';
  let raccolta;
  try {
    raccolta = await eseguiRaccoltaPallavolo({ data, adesso, fonti: { oddspapi, thesportsdb }, chiavi: { oddspapi: process.env.ODDSPAPI_API_KEY }, dirData });
  } catch (e) {
    raccolta = raccoltaDiErrore(data, adesso, e);
  }
  let esiti = { aggiornate: 0 };
  try {
    esiti = aggiornaEsitiPallavolo({ dirData: join(dirData, 'giornate'), adesso, storici: raccolta.storici ?? new Map(), raccolta });
  } catch (e) {
    raccolta.erroriGiro.push(`Esiti pallavolo alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  }
  if (!existsSync(join(dirData, 'raccolta'))) mkdirSync(join(dirData, 'raccolta'), { recursive: true });
  writeFileSync(join(dirData, 'raccolta', `${data}-pallavolo.json`), `${JSON.stringify(raccolta, null, 2)}\n`);
  console.log(`Raccolta pallavolo ${data}: ${raccolta.partite.length} partite, ${raccolta.erroriGiro.length} errori, richieste OddsPapi ${raccolta.crediti.oddspapi.usate}`);
  console.log(`Esiti pallavolo aggiornati: ${esiti.aggiornate}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Raccolta pallavolo fallita: ${e?.message ?? e}`);
  });
}
