// Quote di chiusura per il registro della taratura: quando i controlli prima delle partite scaricano le
// quote di una competizione, si salvano quelle di tutti i mercati delle partite che iniziano entro
// `minuti` (nessuna richiesta in più). File: data/registro/<data>-chiusure.json, chiave partita|mercato|selezione.
import fs from 'node:fs';
import path from 'node:path';
import { isoRoma } from '../calcio/testo.js';
import { leggiRaccolte } from '../giro/raccolte.js';
import { quotaCalcio, quotaFormatoNba, quotaTennis, squadreDi, trovaEvento } from '../controlli/quote.js';
import { chiaveMercato, fileChiusure } from './registro.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function raccoglitoreChiusure({ dirData, data, adesso, minuti = 90 }) {
  const { raccolta } = leggiRaccolte(dirData, data);
  const partite = raccolta?.partite ?? [];
  const file = fileChiusure(dirData, data);
  let mappa = {};
  try { mappa = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { mappa = {}; }
  let cambiato = false;
  const ora = isoRoma(adesso);

  const registra = (sport, competizione, eventi) => {
    for (const p of partite) {
      if ((p.sport ?? 'calcio') !== sport || p.competizione !== competizione) continue;
      const manca = Date.parse(p.inizio) - adesso.getTime();
      if (!(manca >= 0 && manca <= minuti * 60000)) continue;
      // Nel tennis l'ordine dei giocatori può essere invertito fra raccolta e quote.
      const sq = squadreDi(p.partita);
      const e = trovaEvento(p, eventi) ?? (sport === 'tennis' && sq ? trovaEvento({ ...p, partita: `${sq.trasferta} - ${sq.casa}` }, eventi) : null);
      if (!e) continue;
      for (const m of p.mercati ?? []) {
        const q = sport === 'calcio' ? quotaCalcio(e, m.mercato, m.selezione)
          : sport === 'tennis' ? quotaTennis(e, m.selezione)
            : quotaFormatoNba(e, { partita: p.partita, mercato: m.mercato, selezione: m.selezione });
        if (!q || !num(q.quota)) continue;
        mappa[chiaveMercato(p.idPartita, m.mercato, m.selezione)] = { quota: q.quota, prob: num(q.prob) ? q.prob : null, alle: ora };
        cambiato = true;
      }
    }
  };
  const salva = () => {
    if (!cambiato) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(mappa, null, 2)}\n`);
    return true;
  };
  return { registra, salva };
}
