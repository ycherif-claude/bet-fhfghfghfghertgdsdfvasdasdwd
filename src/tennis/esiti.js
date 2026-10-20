// Esiti delle giocate tennis (Vincente incontro): da tennis-data e, se serve, da The Odds API /scores.
// Si scrive solo il campo `esito`, delle giocate e delle loro gambe tennis. Le multiple miste
// si chiudono quando ogni sport ha scritto l'esito delle proprie gambe (come nella Fase 4a).
// Ritiri: con almeno un set completato vince chi passa il turno; prima della fine del primo set,
// o con walkover, la giocata è rimborsata.
import { writeFileSync } from 'node:fs';
import { dataRoma, oraRoma } from '../calcio/testo.js';
import { segnateComeGiocate } from '../calcio/esiti.js';
import { aperta, avvisoSettimana, chiusura, gambeDaChiudere as gambeDaChiudereSport, leggiGiornate } from '../esiti/comune.js';
import { abbinaGiocatore } from './giocatori.js';
import { slamAtp } from './tornei.js';
import { fileNonAncoraPubblicato } from './fonti/tennis-data.js';

const SEI_ORE = 6 * 3600 * 1000;
const GIORNO = 86400000;
const COSTO_SCORES = 2;
const FINESTRA_SCORES = 3 * GIORNO; // /scores con daysFrom=3
const num = (v) => typeof v === 'number' && Number.isFinite(v);

const WALKOVER = /walk\s*-?\s*over|\bw\/o\b/i;
// Ritiro, squalifica, partita assegnata: stessa regola del ritiro.
const RITIRO = /retir|\bret\b|disq|default|\bdef\b|award/i;

const spostaGiorno = (data, n) => {
  const [y, m, g] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, g + n)).toISOString().slice(0, 10);
};

// Circuito dal titolo di The Odds API ("ATP Paris Masters" → 'atp'); null se non si ricava.
export function circuitoDi(competizione) {
  const m = /^\s*(ATP|WTA)\b/i.exec(String(competizione ?? ''));
  return m ? m[1].toLowerCase() : null;
}

// Set completati: un giocatore arriva ad almeno 6 game con 2 di scarto, oppure a 7 (tie-break).
export function setCompletati(setW, setL) {
  const w = Array.isArray(setW) ? setW : [];
  const l = Array.isArray(setL) ? setL : [];
  let n = 0;
  for (let i = 0; i < Math.max(w.length, l.length); i++) {
    if (!num(w[i]) || !num(l[i])) continue;
    const alto = Math.max(w[i], l[i]);
    const basso = Math.min(w[i], l[i]);
    if ((alto >= 6 && alto - basso >= 2) || (alto === 7 && basso === 6)) n++;
  }
  return n;
}

// 'vinta' | 'persa' | 'rimborsata' | null. `selezione`: nome di The Odds API o di tennis-data.
// r.completa = true: risultato già validato come partita finita regolarmente (The Odds API).
export function esitoTennis(selezione, r) {
  if (!r || !r.vincitore || !r.perdente) return null;
  const sel = selezione === r.vincitore || selezione === r.perdente
    ? selezione
    : abbinaGiocatore(selezione, [r.vincitore, r.perdente]);
  if (!sel) return null;
  const esito = sel === r.vincitore ? 'vinta' : 'persa';
  const commento = String(r.commento ?? '').trim();
  if (WALKOVER.test(commento)) return 'rimborsata';
  if (commento) {
    if (!RITIRO.test(commento)) return null;
    return setCompletati(r.setW, r.setL) >= 1 ? esito : 'rimborsata';
  }
  if (r.completa === true) return esito;
  // Partita completa: servono almeno 2 set completati, altrimenti i dati non tornano.
  return setCompletati(r.setW, r.setL) >= 2 ? esito : null;
}

// Righe tennis-data (circuito → righe) come risultati, dalla data `da` in poi.
export function risultatiDaTennisData(storico, da) {
  const out = [];
  for (const [circuito, righe] of storico ?? []) {
    for (const p of righe ?? []) {
      if (!p?.data || p.data < da) continue;
      out.push({
        fonte: 'tennis-data', circuito, data: p.data, vincitore: p.vincitore, perdente: p.perdente,
        setW: p.setW ?? [], setL: p.setL ?? [], commento: p.commento ?? null,
      });
    }
  }
  return out;
}

// Risultati di /scores: si tengono solo le partite finite regolarmente, cioè con il vincitore
// arrivato ai set necessari (2, o 3 negli Slam ATP). Con un ritiro i set non bastano e
// /scores non dice chi è passato: l'esito resta a tennis-data.
export function risultatiDaOdds(lista, titolo, circuito, chiave) {
  const necessari = slamAtp({ chiave, titolo, circuito }) ? 3 : 2;
  const out = [];
  for (const e of lista ?? []) {
    if (!num(e.set1) || !num(e.set2) || !e.inizio) continue;
    const alto = Math.max(e.set1, e.set2);
    const basso = Math.min(e.set1, e.set2);
    if (alto !== necessari || basso >= alto) continue;
    const vincitore = e.set1 > e.set2 ? e.giocatore1 : e.giocatore2;
    const perdente = vincitore === e.giocatore1 ? e.giocatore2 : e.giocatore1;
    if (e.vincitore && e.vincitore !== vincitore) continue;
    out.push({
      fonte: 'the-odds-api', circuito, data: dataRoma(new Date(e.inizio)), vincitore, perdente,
      setW: [], setL: [], commento: null, completa: true,
    });
  }
  return out;
}

// Gambe tennis senza esito, iniziate da più di 6 ore.
const gambeDaChiudere = (g, adesso) => gambeDaChiudereSport(g, 'tennis', SEI_ORE, adesso);

// Gambe tennis ancora da chiudere, di tutte le giornate passate.
export function gambeTennisInAttesa(dirData, adesso) {
  const out = [];
  for (const { dati } of leggiGiornate(dirData, adesso).out) {
    for (const g of dati.giocate) if (aperta(g)) out.push(...gambeDaChiudere(g, adesso));
  }
  return out;
}

function giocatoriDi(gamba) {
  const testo = String(gamba.partita ?? '');
  const i = testo.indexOf(' - ');
  if (i < 0) return null;
  const g1 = testo.slice(0, i).trim();
  const g2 = testo.slice(i + 3).trim();
  return g1 && g2 && g1 !== g2 ? [g1, g2] : null;
}

// Esito della gamba da una fonte: null se il risultato manca o è ambiguo.
function esitoDaFonte(gamba, giocatori, gruppo) {
  const [g1, g2] = giocatori;
  const nomi = [...new Set(gruppo.flatMap((r) => [r.vincitore, r.perdente]))];
  const esatto = gruppo[0].fonte === 'the-odds-api';
  const a = esatto ? (nomi.includes(g1) ? g1 : null) : abbinaGiocatore(g1, nomi);
  const b = esatto ? (nomi.includes(g2) ? g2 : null) : abbinaGiocatore(g2, nomi);
  if (!a || !b || a === b) return null;
  const trovati = gruppo.filter((r) => (r.vincitore === a && r.perdente === b) || (r.vincitore === b && r.perdente === a));
  if (trovati.length !== 1) return null;
  const sel = gamba.selezione === g1 ? a : gamba.selezione === g2 ? b : null;
  if (!sel) return null;
  return esitoTennis(sel, trovati[0]);
}

// Esito di una gamba con i risultati di tutte le fonti (data di Roma ±1 giorno, stesso circuito).
// Fonti in disaccordo: nessun esito e un errore.
function esitoGamba(gamba, risultati, errori) {
  const giocatori = giocatoriDi(gamba);
  if (!giocatori || !Number.isFinite(Date.parse(gamba.inizio))) return null;
  const giorno = dataRoma(new Date(gamba.inizio));
  const giorni = new Set([spostaGiorno(giorno, -1), giorno, spostaGiorno(giorno, 1)]);
  const circuito = circuitoDi(gamba.competizione);
  const candidati = risultati.filter((r) => giorni.has(r.data) && (!circuito || !r.circuito || r.circuito === circuito));
  const perFonte = new Map();
  for (const r of candidati) {
    if (!perFonte.has(r.fonte)) perFonte.set(r.fonte, []);
    perFonte.get(r.fonte).push(r);
  }
  const esiti = [];
  for (const [fonte, gruppo] of perFonte) {
    const e = esitoDaFonte(gamba, giocatori, gruppo);
    if (e) esiti.push({ fonte, e });
  }
  if (!esiti.length) return null;
  if (new Set(esiti.map((x) => x.e)).size > 1) {
    errori.push(`Risultati discordanti per ${gamba.partita} del ${giorno} (${esiti.map((x) => x.fonte).join(' / ')}): esito non assegnato`);
    return null;
  }
  return esiti[0].e;
}

// Aggiorna solo `esito` (della giocata e delle sue gambe tennis). Avviso dopo 7 giorni senza esito
// (per le annullate solo se segnate come giocate).
export function aggiornaEsitiTennis(dirData, risultati, adesso) {
  const { out: giornate, errori } = leggiGiornate(dirData, adesso);
  const segnate = segnateComeGiocate(dirData);
  const avvisi = [];
  const segnalati = new Set();
  let aggiornate = 0;
  const file = [];
  for (const { percorso, dati } of giornate) {
    let cambiato = false;
    for (const g of dati.giocate) {
      if (!aperta(g) || !gambeDaChiudere(g, adesso).length) continue;
      for (const x of gambeDaChiudere(g, adesso)) {
        const nuovi = [];
        const e = esitoGamba(x, risultati ?? [], nuovi);
        for (const m of nuovi) if (!segnalati.has(m)) { segnalati.add(m); errori.push(m); }
        if (e) { x.esito = e; cambiato = true; }
      }
      const esito = chiusura(g);
      if (esito !== null) {
        g.esito = esito;
        cambiato = true;
        aggiornate++;
      } else if (gambeDaChiudere(g, adesso).length) {
        const avviso = avvisoSettimana(g, segnate, adesso);
        if (avviso) avvisi.push(avviso);
      }
    }
    if (cambiato) {
      writeFileSync(percorso, `${JSON.stringify(dati, null, 2)}\n`);
      file.push(percorso);
    }
  }
  errori.push(...avvisi);
  return { aggiornate, file, errori };
}

// Passo della CLI: risultati da tennis-data (lo storico della raccolta, o la stagione scaricata qui),
// poi The Odds API /scores per i tornei con gambe ancora aperte da più di 1 giorno, 2 crediti l'uno,
// solo se il budget residuo del tennis lo permette. Crediti ed errori finiscono nella raccolta.
export async function aggiornaEsitiGiroTennis({ dirData, adesso, fonti, chiavi, raccolta, storico, tornei, budgetResiduo }) {
  const errore = (fonte, e) => raccolta.erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const pendenti = gambeTennisInAttesa(dirData, adesso);
  if (!pendenti.length) return { aggiornate: 0, file: [], errori: [] };

  const piuVecchia = dataRoma(new Date(Math.min(...pendenti.map((x) => Date.parse(x.inizio)))));
  const da = spostaGiorno(piuVecchia, -1);
  const righe = new Map(storico ?? []);
  const servono = new Set(pendenti.flatMap((x) => {
    const c = circuitoDi(x.competizione);
    return c ? [c] : ['atp', 'wta'];
  }));
  const anni = [...new Set([Number(dataRoma(adesso).slice(0, 4)), Number(da.slice(0, 4))])];
  for (const circuito of servono) {
    if (righe.has(circuito)) continue;
    const tutte = [];
    for (const anno of anni) {
      try {
        tutte.push(...await fonti.tennisData.partite(anno, circuito));
      } catch (e) {
        if (!fileNonAncoraPubblicato(e, anno, dataRoma(adesso))) errore(`tennis-data.co.uk ${circuito.toUpperCase()} ${anno} (esiti)`, e);
      }
    }
    righe.set(circuito, tutte);
  }
  const risultati = risultatiDaTennisData(righe, da);
  let out = aggiornaEsitiTennis(dirData, risultati, adesso);
  let aggiornate = out.aggiornate;
  const file = new Set(out.file);

  // The Odds API: tornei attivi con gambe aperte iniziate fra 3 giorni e 1 giorno fa.
  const ancora = chiavi?.oddsApi ? gambeTennisInAttesa(dirData, adesso) : [];
  const ora = adesso.getTime();
  const titoli = [...new Set(ancora.filter((x) => {
    const t = Date.parse(x.inizio);
    return t <= ora - GIORNO && t >= ora - FINESTRA_SCORES;
  }).map((x) => x.competizione))];
  let residuo = Number.isFinite(budgetResiduo) ? budgetResiduo : 0;
  const daOdds = [];
  for (const titolo of titoli) {
    const t = (tornei ?? []).find((x) => x.titolo === titolo);
    if (!t) continue;
    if (residuo < COSTO_SCORES) {
      errore('The Odds API (esiti tennis)', `crediti insufficienti per i risultati di ${titolo}`);
      continue;
    }
    try {
      const lista = await fonti.oddsTennis.risultati(t.chiave, { chiave: chiavi.oddsApi });
      residuo -= COSTO_SCORES;
      raccolta.crediti.usati += COSTO_SCORES;
      if (num(raccolta.crediti.rimasti)) raccolta.crediti.rimasti -= COSTO_SCORES;
      daOdds.push(...risultatiDaOdds(lista, t.titolo, t.circuito, t.chiave));
    } catch (e) {
      errore(`The Odds API (esiti ${titolo})`, e);
    }
  }
  if (daOdds.length) {
    out = aggiornaEsitiTennis(dirData, [...risultati, ...daOdds], adesso);
    aggiornate += out.aggiornate;
    for (const f of out.file) file.add(f);
  }
  for (const m of out.errori) errore('Esiti tennis', new Error(m));
  return { aggiornate, file: [...file], errori: out.errori };
}
