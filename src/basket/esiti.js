// Esiti delle giocate di basket (Eurolega e NBL) dallo storico aggiornato la mattina: punteggio finale,
// supplementari compresi, con le stesse regole dei mercati NBA. Si scrive solo `esito`
// (regole comuni in src/esiti/comune.js).
import { writeFileSync } from 'node:fs';
import { dataRoma, oraRoma } from '../calcio/testo.js';
import { segnateComeGiocate } from '../calcio/esiti.js';
import {
  aperta, avvisoGambaRimborsata, avvisoSettimana, chiusura, gambeDaChiudere as gambeDaChiudereSport, leggiGiornate,
} from '../esiti/comune.js';
import { esitoNba } from '../nba/esiti.js';
import { partiteModello } from './storico.js';
import { codiceSquadra } from './squadre.js';

const QUATTRO_ORE = 4 * 3600 * 1000;
const GIORNO_MS = 86400000;
const CAMPIONATO = { Eurolega: 'eurolega', 'NBL (Australia)': 'nbl' };

const gambeDaChiudere = (g, adesso) => gambeDaChiudereSport(g, 'basket', QUATTRO_ORE, adesso);

// Partita finita con le stesse squadre (per codice) entro un giorno dalla data della gamba; null se manca o è ambigua.
function trova(gamba, finite) {
  const campionato = CAMPIONATO[gamba.competizione];
  const testo = String(gamba.partita);
  const i = testo.indexOf(' - ');
  if (!campionato || i < 0) return null;
  const nomi = { casa: testo.slice(0, i), trasferta: testo.slice(i + 3) };
  const casa = codiceSquadra(campionato, nomi.casa);
  const trasferta = codiceSquadra(campionato, nomi.trasferta);
  if (!casa || !trasferta || casa === trasferta) return null;
  const giorno = Date.parse(`${dataRoma(new Date(gamba.inizio))}T00:00:00Z`);
  const trovate = (finite.get(campionato) ?? []).filter((p) => p.casa === casa && p.trasferta === trasferta
    && Math.abs(Date.parse(`${p.dataUsa}T00:00:00Z`) - giorno) <= GIORNO_MS);
  if (trovate.length !== 1) return null;
  return { ...trovate[0], casa: nomi.casa, trasferta: nomi.trasferta, campionato };
}

function aggiorna(g, finite, adesso) {
  let cambiato = false;
  for (const x of gambeDaChiudere(g, adesso)) {
    const p = trova(x, finite);
    const e = p ? esitoNba(x.mercato, x.selezione, p, (nome) => codiceSquadra(p.campionato, nome)) : null;
    if (e) { x.esito = e; cambiato = true; }
  }
  const esito = chiusura(g);
  if (esito !== null && g.esito !== esito) { g.esito = esito; cambiato = true; }
  return cambiato;
}

// `storici`: Map(campionato → partite salvate). Aggiorna i file delle giornate passate.
export function aggiornaEsitiBasket({ dirData, adesso, storici, raccolta }) {
  const finite = new Map([...storici].map(([c, partite]) => [c, partiteModello(c, partite).righe]));
  const { out: giornate, errori } = leggiGiornate(dirData, adesso);
  const segnate = segnateComeGiocate(dirData);
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
  for (const m of errori) raccolta.erroriGiro.push(`Esiti basket alle ${oraRoma(adesso)}: ${m}`);
  return { aggiornate, file, errori };
}
