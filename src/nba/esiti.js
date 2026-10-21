// Esiti delle giocate NBA: dal punteggio finale (supplementari compresi) a vinta / persa / rimborsata.
// Si scrive solo il campo `esito`, della giocata e delle sue gambe NBA: le multiple miste si chiudono
// quando ogni sport ha scritto l'esito delle proprie gambe (regole comuni in src/esiti/comune.js).
import { writeFileSync } from 'node:fs';
import { oraRoma } from '../calcio/testo.js';
import { segnateComeGiocate } from '../calcio/esiti.js';
import {
  aperta, avvisoGambaRimborsata, avvisoSettimana, chiusura, gambeDaChiudere as gambeDaChiudereSport, leggiGiornate,
} from '../esiti/comune.js';
import { squadraNba } from './squadre.js';

const QUATTRO_ORE = 4 * 3600 * 1000;
const GIORNO = 86400000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

const formatoUsa = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});

// Giorno di New York (AAAA-MM-GG) di un istante.
export const dataUsaDi = (istante) => formatoUsa.format(istante);

// 'vinta' | 'persa' | 'rimborsata' | null. Per "Vincente" servono r.casa e r.trasferta (nomi);
// `chi` riconosce una squadra dal nome (il basket europeo passa la sua tabella).
export function esitoNba(mercato, selezione, r, chi = (nome) => squadraNba(nome)?.nome) {
  const { puntiCasa: pc, puntiTrasferta: pt } = r ?? {};
  if (!num(pc) || !num(pt)) return null;
  const vinta = (b) => (b ? 'vinta' : 'persa');
  let m;
  if (mercato === 'Vincente') {
    if (pc === pt) return null;
    const s = chi(selezione);
    if (!s) return null;
    if (s === chi(r.casa)) return vinta(pc > pt);
    if (s === chi(r.trasferta)) return vinta(pt > pc);
    return null;
  }
  if ((m = /^Handicap ([+-]?\d+(?:\.\d+)?)$/.exec(mercato))) {
    if (selezione !== 'casa' && selezione !== 'trasferta') return null;
    const v = pc - pt + Number(m[1]);
    if (v === 0) return 'rimborsata';
    return vinta((v > 0) === (selezione === 'casa'));
  }
  if ((m = /^Totale punti (\d+(?:\.\d+)?)$/.exec(mercato))) {
    const linea = Number(m[1]);
    const sel = /^(Over|Under) (\d+(?:\.\d+)?)$/.exec(selezione);
    if (!sel || Number(sel[2]) !== linea) return null;
    const tot = pc + pt;
    if (tot === linea) return 'rimborsata';
    return vinta((tot > linea) === (sel[1] === 'Over'));
  }
  return null;
}

// Gambe NBA ancora senza esito e finite da più di 4 ore.
const gambeDaChiudere = (g, adesso) => gambeDaChiudereSport(g, 'nba', QUATTRO_ORE, adesso);

export function giocateNbaInAttesa(dirData, adesso) {
  const out = [];
  for (const { dati } of leggiGiornate(dirData, adesso).out) {
    for (const g of dati.giocate) if (aperta(g) && gambeDaChiudere(g, adesso).length) out.push(g);
  }
  return out;
}

// Partita finita per squadre e giorno di New York; null se manca o è ambigua.
function trova(gamba, finite) {
  const testo = String(gamba.partita);
  const i = testo.indexOf(' - ');
  if (i < 0) return null;
  const casa = squadraNba(testo.slice(0, i))?.nome;
  const trasferta = squadraNba(testo.slice(i + 3))?.nome;
  if (!casa || !trasferta || casa === trasferta) return null;
  const giorno = dataUsaDi(new Date(gamba.inizio));
  const trovate = finite.filter((p) => p.casa === casa && p.trasferta === trasferta && p.dataUsa === giorno
    && num(p.puntiCasa) && num(p.puntiTrasferta));
  return trovate.length === 1 ? trovate[0] : null;
}

// Scrive l'esito di ogni gamba NBA risolvibile e chiude la giocata se tutte le gambe hanno un esito.
function aggiorna(g, finite, adesso) {
  let cambiato = false;
  for (const x of gambeDaChiudere(g, adesso)) {
    const p = trova(x, finite);
    const e = p ? esitoNba(x.mercato, x.selezione, p) : null;
    if (e) { x.esito = e; cambiato = true; }
  }
  const esito = chiusura(g);
  if (esito !== null && g.esito !== esito) { g.esito = esito; cambiato = true; }
  return cambiato;
}

// Aggiorna solo `esito` (della giocata e delle sue gambe NBA). Avviso dopo 7 giorni senza esito
// (per le annullate solo se segnate come giocate).
// Le multiple miste si chiudono quando ogni modulo ha scritto l'esito delle proprie gambe.
export function aggiornaEsitiNba(dirData, partiteFinite, adesso) {
  const { out: giornate, errori } = leggiGiornate(dirData, adesso);
  const segnate = segnateComeGiocate(dirData);
  const finite = partiteFinite.filter((p) => p.finita !== false);
  let aggiornate = 0;
  const file = [];
  for (const { percorso, dati } of giornate) {
    let cambiato = false;
    for (const g of dati.giocate) {
      if (!aperta(g) || !gambeDaChiudere(g, adesso).length) continue;
      if (aggiorna(g, finite, adesso)) {
        cambiato = true;
        if (g.esito !== null) {
          aggiornate++;
          const avviso = avvisoGambaRimborsata(g);
          if (avviso) errori.push(avviso);
        }
      }
      if (g.esito === null && gambeDaChiudere(g, adesso).length) {
        const avviso = avvisoSettimana(g, segnate, adesso);
        if (avviso) errori.push(avviso);
      }
    }
    if (cambiato) {
      writeFileSync(percorso, `${JSON.stringify(dati, null, 2)}\n`);
      file.push(percorso);
    }
  }
  return { aggiornate, file, errori };
}

// Passo della CLI: scarica le partite finite degli ultimi 10 giorni e aggiorna i file.
export async function aggiornaEsitiGiroNba({ dirData, adesso, fonti, chiavi, raccolta }) {
  const errore = (fonte, e) => raccolta.erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const pendenti = giocateNbaInAttesa(dirData, adesso);
  const limite = dataUsaDi(new Date(adesso.getTime() - 10 * GIORNO));
  const date = [...new Set(pendenti.flatMap((g) => gambeDaChiudere(g, adesso)).map((x) => dataUsaDi(new Date(x.inizio))))].filter((d) => d >= limite).sort();
  let partite = [];
  if (date.length) {
    try {
      partite = await fonti.balldontlie.partite({ date }, { chiave: chiavi.balldontlie });
    } catch (e) {
      errore('balldontlie (esiti)', e);
    }
  }
  const out = aggiornaEsitiNba(dirData, partite, adesso);
  for (const m of out.errori) errore('Esiti NBA', new Error(m));
  return out;
}
