// Storico di Eurolega e NBL salvato in data/storico/<campionato>.json e aggiornato ogni mattina.
// Si scaricano per giornata (round) solo le partite finite: quella in corso dall'ultima giornata già salvata
// in avanti, fino alla prima giornata senza partite finite; la stagione precedente una volta sola.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoma, isoRoma } from '../calcio/testo.js';
import { codiceSquadra } from './squadre.js';

// Tetto di richieste per stagione e per giorno: una stagione di Eurolega ha 38 giornate più i playoff.
const MAX_GIORNATE = 50;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Stagione = anno d'inizio: da agosto in poi l'anno stesso (Eurolega e NBL iniziano a settembre).
export function stagioneBasket(data) {
  const [anno, mese] = data.split('-').map(Number);
  return mese >= 8 ? anno : anno - 1;
}

const percorso = (dirData, campionato) => join(dirData, 'storico', `${campionato}.json`);

export function leggiStorico(dirData, campionato) {
  const file = percorso(dirData, campionato);
  if (!existsSync(file)) return { partite: [], stagioniComplete: [] };
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return { partite: Array.isArray(j?.partite) ? j.partite : [], stagioniComplete: Array.isArray(j?.stagioniComplete) ? j.stagioniComplete : [] };
}

// `scarica(stagione, giornata)` → { partite, scartate }. Errori in `errore(fonte, e)`: lo storico salvato resta.
export async function aggiornaStorico({ campionato, nomeFonte, dirData, data, adesso, scarica, errore, pausaMs = 1000 }) {
  let salvato;
  try {
    salvato = leggiStorico(dirData, campionato);
  } catch (e) {
    errore(`Storico ${campionato}`, `file illeggibile (${e.message}), si riparte da zero`);
    salvato = { partite: [], stagioniComplete: [] };
  }
  const perId = new Map(salvato.partite.map((p) => [p.id, p]));
  const complete = new Set(salvato.stagioniComplete);
  const corrente = stagioneBasket(data);
  let richieste = 0;
  let scartate = 0;
  let cambiato = false;
  // Prima la stagione in corso (modello di oggi ed esiti): se la fonte limita le richieste, la precedente aspetta domani.
  for (const stagione of [corrente, corrente - 1]) {
    if (complete.has(stagione)) continue;
    const giornate = [...perId.values()].filter((p) => p.stagione === stagione).map((p) => p.giornata);
    let giornata = giornate.length ? Math.max(...giornate) : 1;
    let finita = false;
    for (let n = 0; n < MAX_GIORNATE; n++, giornata++) {
      if (richieste++) await pausa(pausaMs);
      let r;
      try {
        r = await scarica(stagione, giornata);
      } catch (e) {
        errore(`${nomeFonte} stagione ${stagione} giornata ${giornata}`, e);
        break;
      }
      scartate += r.scartate ?? 0;
      const giocate = r.partite.filter((p) => p.finita !== false);
      if (!giocate.length) { finita = true; break; }
      for (const p of giocate) {
        const prima = perId.get(p.id);
        if (!prima || JSON.stringify(prima) !== JSON.stringify(p)) { perId.set(p.id, p); cambiato = true; }
      }
    }
    if (finita && stagione < corrente) { complete.add(stagione); cambiato = true; }
  }
  if (scartate) errore(nomeFonte, `${scartate} ${scartate === 1 ? 'partita illeggibile scartata' : 'partite illeggibili scartate'}`);
  const partite = [...perId.values()].sort((a, b) => (a.inizio ?? a.data).localeCompare(b.inizio ?? b.data) || a.id.localeCompare(b.id));
  if (cambiato) {
    mkdirSync(join(dirData, 'storico'), { recursive: true });
    const j = { campionato, aggiornatoAlle: isoRoma(adesso), stagioniComplete: [...complete].sort(), partite };
    writeFileSync(percorso(dirData, campionato), `${JSON.stringify(j, null, 2)}\n`);
  }
  return { partite, richieste };
}

// Partite per il modello NBA (squadre come codici, `dataUsa` = giorno della partita a Roma) e nomi non riconosciuti.
export function partiteModello(campionato, partite) {
  const ignote = new Set();
  const righe = [];
  for (const p of partite) {
    const codice = (nome) => {
      // L'API Eurolega dà già i codici; TheSportsDB dà i nomi.
      const c = campionato === 'eurolega' ? nome : codiceSquadra(campionato, nome);
      if (!c) ignote.add(nome);
      return c;
    };
    const casa = codice(p.casa);
    const trasferta = codice(p.trasferta);
    if (!casa || !trasferta) continue;
    righe.push({
      id: p.id, casa, trasferta, puntiCasa: p.puntiCasa, puntiTrasferta: p.puntiTrasferta,
      dataUsa: p.data ?? dataRoma(new Date(p.inizio)), stagione: p.stagione, finita: true, postseason: p.postseason === true,
    });
  }
  return { righe, ignote: [...ignote] };
}
