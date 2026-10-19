import { scarica } from './http.js';

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const footballDataOrg = {
  async risultati({ da, a }, opz = {}) {
    const { chiave, ...resto } = opz;
    const q = new URLSearchParams({ dateFrom: da, dateTo: a });
    const r = await scarica(`https://api.football-data.org/v4/matches?${q}`,
      { ...resto, headers: { 'X-Auth-Token': chiave ?? '' } });
    let dati;
    try { dati = JSON.parse(r.testo); } catch { throw new Error('api.football-data.org: risposta non valida'); }
    const out = [];
    for (const m of dati.matches ?? []) {
      if (m.status !== 'FINISHED') continue;
      const gc = numero(m.score?.fullTime?.home);
      const gt = numero(m.score?.fullTime?.away);
      if (gc === null || gt === null) continue;
      out.push({
        casa: m.homeTeam.name,
        trasferta: m.awayTeam.name,
        inizio: m.utcDate,
        gc,
        gt,
        gcPT: numero(m.score?.halfTime?.home),
        gtPT: numero(m.score?.halfTime?.away),
        fonte: 'football-data.org',
      });
    }
    return out;
  },
};
