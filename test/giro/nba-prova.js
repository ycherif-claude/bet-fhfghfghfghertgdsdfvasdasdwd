// Dati di prova NBA per i test del giro (formato di data/raccolta/<data>-nba.json).
export const ORA_NBA = '2026-10-20T07:40:00+02:00';
export const NBA1 = 'nba-2026-10-20-boston-celtics-new-york-knicks';

export const mNba = (mercato, selezione, probModello, probPinnacle, quota, spiegazione = `${mercato}: spiegazione di prova.`) => ({
  mercato, selezione, probModello, probPinnacle, quota,
  fonteQuota: `mediana di 7 bookmaker (SportsGameOdds)`, oraQuota: ORA_NBA, frequenzaCampionato: null,
  etichettaMercato: 'Consenso bookmaker', spiegazione,
});

export function partitaNba(casa, trasferta, mercati, extra = {}) {
  const s = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    idPartita: `nba-2026-10-20-${s(casa)}-${s(trasferta)}`, sport: 'nba', competizione: 'NBA',
    partita: `${casa} - ${trasferta}`, casa, trasferta, inizio: '2026-10-21T01:30:00+02:00',
    modello: 'nba', lambda: null, puntiAttesi: { casa: 114.2, trasferta: 109.8 }, pesoModello: 0.5,
    backToBack: { casa: false, trasferta: false },
    ragionamentoBase: [`Punti attesi: ${casa} 114 – ${trasferta} 110 (stagione in corso e precedente)`],
    mercati, ...extra,
  };
}

export const celticsKnicks = (extra = {}) => partitaNba('Boston Celtics', 'New York Knicks', [
  mNba('Vincente', 'Boston Celtics', 0.62, 0.60, 1.80, 'Vincente: vince se Boston Celtics vince la partita, supplementari compresi. Gioca solo con quota almeno la minima.'),
  mNba('Vincente', 'New York Knicks', 0.38, 0.40, 2.10),
  mNba('Handicap -4.5', 'casa', 0.52, 0.50, 1.95),
  mNba('Handicap -4.5', 'trasferta', 0.48, 0.50, 1.90),
  mNba('Totale punti 221.5', 'Over 221.5', 0.47, 0.50, 1.90),
  mNba('Totale punti 221.5', 'Under 221.5', 0.53, 0.50, 1.95),
], extra);

export function raccoltaNba(partite = [celticsKnicks()], data = '2026-10-20') {
  return {
    data, generataAlle: ORA_NBA, crediti: { sportsgameodds: { oggetti: partite.length } },
    competizioniNonCoperte: [], erroriGiro: [], partite,
  };
}
