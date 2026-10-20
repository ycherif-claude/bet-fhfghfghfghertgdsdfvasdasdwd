// Dati di prova tennis per i test del giro (formato di data/raccolta/<data>-tennis.json).
export const ORA_TENNIS = '2026-10-20T07:45:00+02:00';
export const TENNIS1 = 'tennis-2026-10-20-carlos-alcaraz-jannik-sinner';

export const mTennis = (selezione, probModello, probPinnacle, quota, extra = {}) => ({
  mercato: 'Vincente incontro', selezione, probModello, probPinnacle, quota,
  fonteQuota: 'mediana di 8 bookmaker (The Odds API)', oraQuota: ORA_TENNIS, frequenzaCampionato: null,
  spiegazione: `Vincente incontro: vince se ${selezione} vince la partita. Se un giocatore si ritira dopo almeno un set completo vince chi passa il turno; se si ritira prima, o la partita non si gioca, la giocata è rimborsata`,
  ...extra,
});

export function partitaTennis(g1, g2, mercati, extra = {}) {
  const s = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const [x, y] = [s(g1), s(g2)].sort();
  return {
    idPartita: `tennis-2026-10-20-${x}-${y}`, sport: 'tennis', competizione: 'ATP Masters 1000 Parigi',
    partita: `${g1} - ${g2}`, casa: g1, trasferta: g2, inizio: '2026-10-20T20:00:00+02:00',
    modello: 'elo', lambda: null, superficie: 'cemento', bestOf: 3, pesoModello: 0.5,
    elo: { [g1]: { tot: 2100, superficie: 2080 }, [g2]: { tot: 2150, superficie: 2140 } },
    ragionamentoBase: [`Elo complessivo e su cemento: ${g1} 2100/2080 – ${g2} 2150/2140 (ultime 3 stagioni tennis-data)`, 'Al meglio dei 3 set'],
    mercati, ...extra,
  };
}

export const alcarazSinner = (extra = {}) => partitaTennis('Jannik Sinner', 'Carlos Alcaraz', [
  mTennis('Jannik Sinner', 0.56, 0.52, 2.05),
  mTennis('Carlos Alcaraz', 0.44, 0.48, 1.85),
], extra);

export function raccoltaTennis(partite = [alcarazSinner()], data = '2026-10-20') {
  return { data, generataAlle: ORA_TENNIS, crediti: { usati: 1, rimasti: 300 }, competizioniNonCoperte: [], erroriGiro: [], partite };
}
