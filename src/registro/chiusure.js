// Quote pre-partita per il registro della taratura [correzione C3]: NON sono quote di chiusura. Quando i
// controlli prima delle partite (45-90 minuti prima dell'inizio) scaricano le quote di una competizione con
// una giocata, si salvano quelle di tutti i mercati delle partite di quella competizione che iniziano entro
// `minuti` (nessuna richiesta in più). Le competizioni senza giocate non hanno quote pre-partita.
// File: data/registro/<data>-prepartita.json = { quote: { partita|mercato|selezione: { quota, prob, alle,
// minutiPrima } }, copertura: { sport|competizione: { alle, partite } } }. `copertura` dice per quali
// competizioni le quote pre-partita sono state cercate: le altre non vanno lette come "quota mancante".
import fs from 'node:fs';
import path from 'node:path';
import { isoRoma } from '../calcio/testo.js';
import { leggiRaccolte } from '../giro/raccolte.js';
import { quotaCalcio, quotaFormatoNba, quotaTennis, squadreDi, trovaEvento } from '../controlli/quote.js';
import { chiaveMercato, filePrePartita, leggiPrePartita } from './registro.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function raccoglitorePrePartita({ dirData, data, adesso, minuti = 90 }) {
  const { raccolta } = leggiRaccolte(dirData, data);
  const partite = raccolta?.partite ?? [];
  const file = filePrePartita(dirData, data);
  const salvato = leggiPrePartita(dirData, data);
  const quote = salvato.quote;
  const copertura = salvato.copertura;
  let cambiato = false;
  const ora = isoRoma(adesso);

  const registra = (sport, competizione, eventi) => {
    const coperte = [];
    for (const p of partite) {
      if ((p.sport ?? 'calcio') !== sport || p.competizione !== competizione) continue;
      const manca = Date.parse(p.inizio) - adesso.getTime();
      if (!(manca >= 0 && manca <= minuti * 60000)) continue;
      // Nel tennis l'ordine dei giocatori può essere invertito fra raccolta e quote.
      const sq = squadreDi(p.partita);
      const e = trovaEvento(p, eventi) ?? (sport === 'tennis' && sq ? trovaEvento({ ...p, partita: `${sq.trasferta} - ${sq.casa}` }, eventi) : null);
      if (!e) continue;
      let conQuota = false;
      for (const m of p.mercati ?? []) {
        const q = sport === 'calcio' ? quotaCalcio(e, m.mercato, m.selezione)
          : sport === 'tennis' ? quotaTennis(e, m.selezione)
            : quotaFormatoNba(e, { partita: p.partita, mercato: m.mercato, selezione: m.selezione });
        if (!q || !num(q.quota)) continue;
        quote[chiaveMercato(p.idPartita, m.mercato, m.selezione)] = {
          quota: q.quota, prob: num(q.prob) ? q.prob : null, alle: ora, minutiPrima: Math.round(manca / 60000),
        };
        conQuota = true;
        cambiato = true;
      }
      if (conQuota) coperte.push(p.idPartita);
    }
    if (coperte.length) {
      const k = `${sport}|${competizione}`;
      const id = [...new Set([...(copertura[k]?.idPartite ?? []), ...coperte])];
      copertura[k] = { alle: ora, partite: id.length, idPartite: id };
    }
  };
  const salva = () => {
    if (!cambiato) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ quote, copertura }, null, 2)}\n`);
    return true;
  };
  return { registra, salva };
}
