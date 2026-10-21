// Esiti delle giocate di pallavolo dallo storico TheSportsDB aggiornato la mattina: set vinti dalle due
// squadre. Le squadre si riconoscono come nella raccolta (nomi di OddsPapi → id di TheSportsDB).
// Si scrive solo `esito` (regole comuni in src/esiti/comune.js).
import { writeFileSync } from 'node:fs';
import { dataRoma, oraRoma } from '../calcio/testo.js';
import { segnateComeGiocate } from '../calcio/esiti.js';
import {
  aperta, avvisoGambaRimborsata, avvisoSettimana, chiusura, gambeDaChiudere as gambeDaChiudereSport, leggiGiornate,
} from '../esiti/comune.js';
import { CAMPIONATI_PALLAVOLO } from './campionati.js';
import { abbinaSquadra, squadreStorico } from './squadre.js';

const QUATTRO_ORE = 4 * 3600 * 1000;
const GIORNO_MS = 86400000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// 'vinta' | 'persa' | 'rimborsata' | null dal risultato in set { casa, trasferta, setCasa, setTrasferta }.
export function esitoPallavolo(mercato, selezione, r) {
  const { setCasa: sc, setTrasferta: st } = r ?? {};
  if (!num(sc) || !num(st) || sc === st) return null;
  const vinta = (b) => (b ? 'vinta' : 'persa');
  let m;
  if (mercato === 'Vincente') {
    if (selezione === r.casa) return vinta(sc > st);
    if (selezione === r.trasferta) return vinta(st > sc);
    return null;
  }
  if ((m = /^Handicap set ([+-]\d+(?:\.\d+)?)$/.exec(mercato))) {
    if (selezione !== 'casa' && selezione !== 'trasferta') return null;
    const v = sc - st + Number(m[1]);
    if (v === 0) return 'rimborsata';
    return vinta((v > 0) === (selezione === 'casa'));
  }
  if ((m = /^Totale set (\d+(?:\.\d+)?)$/.exec(mercato))) {
    const linea = Number(m[1]);
    const sel = /^(Over|Under) (\d+(?:\.\d+)?)$/.exec(selezione);
    if (!sel || Number(sel[2]) !== linea) return null;
    const tot = sc + st;
    if (tot === linea) return 'rimborsata';
    return vinta((tot > linea) === (sel[1] === 'Over'));
  }
  return null;
}

const gambeDaChiudere = (g, adesso) => gambeDaChiudereSport(g, 'pallavolo', QUATTRO_ORE, adesso);

// Partita finita con le stesse squadre entro un giorno dalla data della gamba; null se manca o è ambigua.
function trova(gamba, perCompetizione) {
  const c = CAMPIONATI_PALLAVOLO.find((x) => x.competizione === gamba.competizione);
  const testo = String(gamba.partita);
  const i = testo.indexOf(' - ');
  if (!c || i < 0) return null;
  const partite = perCompetizione.get(c.id) ?? [];
  const squadre = squadreStorico(partite);
  const nomi = { casa: testo.slice(0, i), trasferta: testo.slice(i + 3) };
  const idCasa = abbinaSquadra(nomi.casa, squadre);
  const idTrasferta = abbinaSquadra(nomi.trasferta, squadre);
  if (!idCasa || !idTrasferta || idCasa === idTrasferta) return null;
  const giorno = Date.parse(`${dataRoma(new Date(gamba.inizio))}T00:00:00Z`);
  const trovate = partite.filter((p) => p.finita !== false && p.idCasa === idCasa && p.idTrasferta === idTrasferta
    && num(p.puntiCasa) && num(p.puntiTrasferta)
    && Math.abs(Date.parse(`${dataRoma(new Date(p.inizio))}T00:00:00Z`) - giorno) <= GIORNO_MS);
  if (trovate.length !== 1) return null;
  return { casa: nomi.casa, trasferta: nomi.trasferta, setCasa: trovate[0].puntiCasa, setTrasferta: trovate[0].puntiTrasferta };
}

// `storici`: Map(id del campionato → partite salvate). Aggiorna i file delle giornate passate.
export function aggiornaEsitiPallavolo({ dirData, adesso, storici, raccolta }) {
  const { out: giornate, errori } = leggiGiornate(dirData, adesso);
  const segnate = segnateComeGiocate(dirData);
  let aggiornate = 0;
  const file = [];
  for (const { percorso, dati } of giornate) {
    let cambiato = false;
    for (const g of dati.giocate) {
      if (!aperta(g) || !gambeDaChiudere(g, adesso).length) continue;
      let toccata = false;
      for (const x of gambeDaChiudere(g, adesso)) {
        const r = trova(x, storici);
        const e = r ? esitoPallavolo(x.mercato, x.selezione, r) : null;
        if (e) { x.esito = e; toccata = true; }
      }
      const esito = chiusura(g);
      if (esito !== null && g.esito !== esito) { g.esito = esito; toccata = true; }
      if (toccata) {
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
  for (const m of errori) raccolta.erroriGiro.push(`Esiti pallavolo alle ${oraRoma(adesso)}: ${m}`);
  return { aggiornate, file, errori };
}
