import { CONFIG } from '../../config.js';
import { scarica } from '../../calcio/fonti/http.js';
import { isoRoma } from '../../calcio/testo.js';
import { squadraNba } from '../squadre.js';

const BASE = 'https://api.balldontlie.io/v1/games';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function json(testo) {
  try { return JSON.parse(testo); } catch { throw new Error('api.balldontlie.io: risposta non valida'); }
}

function parametri({ date = [], stagioni = [] }, cursore) {
  const q = new URLSearchParams();
  for (const d of date) q.append('dates[]', d);
  for (const s of stagioni) q.append('seasons[]', String(s));
  q.set('per_page', '100');
  if (cursore !== undefined && cursore !== null) q.set('cursor', String(cursore));
  return q;
}

export const balldontlie = {
  // Partite NBA. Le squadre sconosciute vengono scartate e i loro nomi stanno
  // nella proprietà non enumerabile `nonRiconosciute` dell'array restituito.
  async partite(filtri = {}, opz = {}) {
    const { chiave, attesaMs = CONFIG.nba.attesaBalldontlieMs, fetch } = opz;
    const out = [];
    const nonRiconosciute = [];
    let cursore = null;
    let primo = true;
    do {
      if (!primo) await pausa(attesaMs);
      primo = false;
      const r = await scarica(`${BASE}?${parametri(filtri, cursore)}`, {
        fetch, attesaMs, headers: chiave ? { Authorization: chiave } : {},
      });
      const corpo = json(r.testo);
      for (const g of corpo.data ?? []) {
        const casa = squadraNba(g.home_team?.full_name ?? g.home_team?.abbreviation);
        const trasferta = squadraNba(g.visitor_team?.full_name ?? g.visitor_team?.abbreviation);
        if (!casa || !trasferta) {
          nonRiconosciute.push(!casa ? String(g.home_team?.full_name ?? g.home_team?.abbreviation) : String(g.visitor_team?.full_name ?? g.visitor_team?.abbreviation));
          continue;
        }
        out.push({
          id: g.id,
          dataUsa: String(g.date).slice(0, 10),
          inizio: g.datetime ? isoRoma(new Date(g.datetime)) : null,
          casa: casa.nome,
          trasferta: trasferta.nome,
          puntiCasa: numero(g.home_team_score),
          puntiTrasferta: numero(g.visitor_team_score),
          finita: g.status === 'Final',
          stagione: g.season,
          postseason: Boolean(g.postseason),
        });
      }
      cursore = corpo.meta?.next_cursor ?? null;
    } while (cursore !== null && cursore !== undefined);
    Object.defineProperty(out, 'nonRiconosciute', { value: nonRiconosciute, enumerable: false });
    return out;
  },
};
