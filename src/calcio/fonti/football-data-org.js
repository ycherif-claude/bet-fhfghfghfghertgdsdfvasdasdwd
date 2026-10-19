import { scarica } from './http.js';

// Codici football-data.org → nome della competizione; gli altri codici si ignorano.
const CODICI = {
  PL: 'Premier League', SA: 'Serie A', PD: 'LaLiga', BL1: 'Bundesliga', FL1: 'Ligue 1',
  CL: 'Champions League', DED: 'Eredivisie', PPL: 'Primeira Liga', ELC: 'Championship',
};

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
      const competizione = CODICI[m.competition?.code];
      if (!competizione) continue;
      // Coppe con supplementari: conta il risultato dei 90 minuti (regularTime) quando c'è.
      const tempi = m.score?.regularTime ?? m.score?.fullTime;
      const gc = numero(tempi?.home);
      const gt = numero(tempi?.away);
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
        competizione,
      });
    }
    return out;
  },
};
