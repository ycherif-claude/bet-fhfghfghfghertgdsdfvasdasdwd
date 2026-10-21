// ESPN (API pubblica non ufficiale, senza chiave): partite del giorno, formazioni titolari del calcio
// e infortuni NBA. Verificata il 21/10/2026. Se non risponde, il controllo usa solo le quote e lo scrive.
import { scarica } from '../calcio/fonti/http.js';
import { slug } from '../calcio/testo.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Competizioni del calcio (nomi della raccolta) → campionato ESPN.
export const CAMPIONATI_ESPN = Object.freeze({
  'Premier League': 'soccer/eng.1',
  LaLiga: 'soccer/esp.1',
  'Serie A': 'soccer/ita.1',
  Bundesliga: 'soccer/ger.1',
  'Ligue 1': 'soccer/fra.1',
  'Champions League': 'soccer/uefa.champions',
  'Europa League': 'soccer/uefa.europa',
  Eredivisie: 'soccer/ned.1',
  'Primeira Liga': 'soccer/por.1',
  Championship: 'soccer/eng.2',
  'Nations League': 'soccer/uefa.nations',
  'Qualificazioni Mondiali': 'soccer/fifa.worldq.uefa',
  'Serie B': 'soccer/ita.2',
  'Segunda División': 'soccer/esp.2',
  '2. Bundesliga': 'soccer/ger.2',
  'Ligue 2': 'soccer/fra.2',
  NBA: 'basketball/nba',
});

function json(testo) {
  try { return JSON.parse(testo); } catch { throw new Error('site.api.espn.com: risposta non valida'); }
}

// Parole che non distinguono una squadra: prefissi societari e parole comuni.
const GENERICHE = new Set(['fc', 'cf', 'ac', 'afc', 'sc', 'ssc', 'as', 'us', 'calcio', 'club', 'de', 'cd', 'ud', 'sd', 'rc',
  'real', 'sporting', 'city', 'fk', 'sk', 'vfl', 'vfb', 'tsg', 'bv', 'sv', '1', 'the', 'of']);
// Nomi diversi della stessa squadra fra ESPN e The Odds API.
const ALIAS = { internazionale: 'inter', bayern: 'bayern', munchen: 'munich', psg: 'paris' };
const parole = (nome) => new Set(slug(nome).split('-').filter((p) => p.length > 1 && !GENERICHE.has(p)).map((p) => ALIAS[p] ?? p));

// Vero se i due nomi hanno almeno una parola distintiva in comune ("Athletic Bilbao" e "Athletic Club").
export function stessaSquadra(a, b) {
  const pa = parole(a);
  for (const p of parole(b)) if (pa.has(p)) return true;
  return false;
}

// Cognome (ultima parola) di un giocatore, senza accenti.
const cognome = (nome) => slug(nome).split('-').filter(Boolean).at(-1) ?? '';
// Vero se `nome` (scritto dal giro del mattino) è nell'elenco: stesso nome o stesso cognome.
export function inElenco(nome, elenco) {
  const n = slug(nome);
  const c = cognome(nome);
  return elenco.some((x) => slug(x) === n || (c.length > 2 && cognome(x) === c));
}

export const espn = {
  // Partite di un giorno (AAAA-MM-GG): [{ id, casa, trasferta, inizio }].
  async partite(campionato, data, opz = {}) {
    const r = await scarica(`${BASE}/${campionato}/scoreboard?dates=${data.replaceAll('-', '')}`, opz);
    return (json(r.testo).events ?? []).map((e) => {
      const squadre = e.competitions?.[0]?.competitors ?? [];
      const di = (lato) => squadre.find((s) => s.homeAway === lato)?.team?.displayName ?? null;
      return { id: String(e.id), casa: di('home'), trasferta: di('away'), inizio: e.date };
    });
  },

  // Formazioni del calcio: { casa: { titolari, pronta }, trasferta: … }. `pronta` = 11 titolari annunciati.
  async formazioni(campionato, id, opz = {}) {
    const r = await scarica(`${BASE}/${campionato}/summary?event=${id}`, opz);
    const d = json(r.testo);
    const out = {};
    for (const x of d.rosters ?? []) {
      const lato = x.homeAway === 'away' ? 'trasferta' : 'casa';
      const titolari = (x.roster ?? []).filter((p) => p.starter).map((p) => p.athlete?.displayName).filter(Boolean);
      out[lato] = { titolari, pronta: titolari.length >= 11 };
    }
    return out;
  },

  // Infortuni NBA: { casa: [nomi Out], trasferta: [nomi Out] }, con le squadre per nome.
  async infortuni(campionato, id, { casa, trasferta } = {}, opz = {}) {
    const r = await scarica(`${BASE}/${campionato}/summary?event=${id}`, opz);
    const out = { casa: [], trasferta: [] };
    for (const t of json(r.testo).injuries ?? []) {
      const nome = t.team?.displayName ?? '';
      const lato = stessaSquadra(nome, casa) ? 'casa' : stessaSquadra(nome, trasferta) ? 'trasferta' : null;
      if (!lato) continue;
      out[lato].push(...(t.injuries ?? []).filter((i) => /^out$/i.test(i.status ?? '')).map((i) => i.athlete?.displayName).filter(Boolean));
    }
    return out;
  },
};
