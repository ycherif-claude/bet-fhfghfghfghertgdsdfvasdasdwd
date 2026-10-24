import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Aiuti per i test di odss-api: fetch finto con le risposte del feed vero (collaudo del 22/10/2026):
// { count, offset, returned, limit, state, generation, generated_at, odds, content, partial_sources },
// paginazione con offset, intestazioni X-RateLimit-*. Nessuna rete.
export const AGG = '2026-10-23T05:40:00+00:00';
export const RESET = 1795000000;

export function risposta(status, corpo, headers = {}) {
  const testo = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), text: async () => testo };
}

// `pagine`: { 'sport|market': [[righe pagina 1], [righe pagina 2]] } (anche solo 'market').
// `status` fisso o funzione (url) → status; registra le chiamate in `f.chiamate`.
export function fetchOdss(pagine, { rimaste = 480, status = 200, corpo = null } = {}) {
  const chiamate = [];
  let r = rimaste;
  const f = async (url, init) => {
    chiamate.push({ url: String(url), init });
    const u = new URL(String(url));
    r--;
    const h = { 'x-ratelimit-remaining': String(r), 'x-ratelimit-limit': '500', 'x-ratelimit-reset': String(RESET) };
    const st = typeof status === 'function' ? status(u) : status;
    if (st !== 200) return risposta(st, corpo ?? '', h);
    const sport = u.searchParams.get('sport');
    const market = u.searchParams.get('market');
    const lista = pagine[`${sport}|${market}`] ?? pagine[market] ?? [[]];
    const offset = Number(u.searchParams.get('offset') ?? 0);
    const count = lista.reduce((n, p) => n + p.length, 0);
    let i = 0;
    for (let inizio = 0; i < lista.length && inizio < offset; i++) inizio += lista[i].length;
    const odds = lista[i] ?? [];
    return risposta(200, { count, offset, returned: odds.length, limit: 5000, state: 'prematch', generation: 'g', generated_at: AGG, odds, content: 'match', partial_sources: [] }, h);
  };
  f.chiamate = chiamate;
  return f;
}

export const bkOdss = (key, outcomes, extra = {}) => ({ key, outcomes, last_update: AGG, ...extra });
export const rigaOdss = (o = {}) => ({
  event_id: 'e1', event: 'Torino - Monza', sport: 'calcio', league: 'Serie A', home_team: 'Torino', away_team: 'Monza',
  commence_time: '2026-10-23T18:45:00.000Z', market: '1x2', line: null, scope: 'match', period: 'full_time', bookmakers: [], ...o,
});

// Raccolte del mattino che i controlli leggono per gli event_id [correzioni 24/10/2026, punto 4]:
// `calcio`: eventi compatti di data/raccolta/<data>-odss.json; `partite`: { sport: [{ idPartita, idOdss }] }.
export function mattinoOdss(dir, data, { calcio = [], partite = {} } = {}) {
  mkdirSync(join(dir, 'raccolta'), { recursive: true });
  writeFileSync(join(dir, 'raccolta', `${data}-odss.json`), JSON.stringify({ data, eventi: calcio }));
  for (const [sport, lista] of Object.entries(partite)) writeFileSync(join(dir, 'raccolta', `${data}-${sport}.json`), JSON.stringify({ data, partite: lista }));
  return dir;
}
