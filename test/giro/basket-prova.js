// Dati di prova basket per i test del giro (formato di data/raccolta/<data>-basket.json).
export const ORA_BASKET = '2026-10-20T07:50:00+02:00';
export const BASKET1 = 'basket-2026-10-20-real-madrid-fc-barcelona';

export const mBasket = (mercato, selezione, probModello, probPinnacle, quota, extra = {}) => ({
  mercato, selezione, probModello, probPinnacle, quota,
  fonteQuota: 'mediana di 9 bookmaker (The Odds API)', oraQuota: ORA_BASKET, frequenzaCampionato: null,
  spiegazione: `${mercato}: spiegazione di prova`,
  ...extra,
});

export const madridBarcellona = (extra = {}) => ({
  idPartita: BASKET1, sport: 'basket', competizione: 'Eurolega',
  partita: 'Real Madrid - FC Barcelona', casa: 'Real Madrid', trasferta: 'FC Barcelona', inizio: '2026-10-20T20:45:00+02:00',
  modello: 'basket', lambda: null, puntiAttesi: { casa: 86.1, trasferta: 81.4 }, pesoModello: 0.5,
  ragionamentoBase: ['Punti attesi: Real Madrid 86 – FC Barcelona 81 (stagione in corso e precedente)'],
  mercati: [
    mBasket('Vincente', 'Real Madrid', 0.68, 0.62, 1.70),
    mBasket('Vincente', 'FC Barcelona', 0.32, 0.38, 2.30),
    mBasket('Totale punti 162.5', 'Over 162.5', 0.55, 0.50, 1.95),
    mBasket('Totale punti 162.5', 'Under 162.5', 0.45, 0.50, 1.88),
  ],
  ...extra,
});

export function raccoltaBasket(partite = [madridBarcellona()], data = '2026-10-20') {
  return { data, generataAlle: ORA_BASKET, crediti: { usati: 3, rimasti: 290 }, competizioniNonCoperte: [], erroriGiro: [], partite };
}
