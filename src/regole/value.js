import { CONFIG } from '../config.js';

// Value = prob × quota − 1
export function calcolaValue(prob, quota) {
  return prob * quota - 1;
}

export function quotaGiusta(prob) {
  return 1 / prob;
}

// Quota minima = (1 + soglia) / prob, arrotondata per eccesso a 2 decimali.
// Vale sia per le quote gratuite sia per i mercati senza quota gratuita.
export function quotaMinima(candidato, tipo) {
  const speciale = tipo === 'speciale' || tipo === 'builder';
  const soglia = speciale ? CONFIG.sogliaValueSpeciali : CONFIG.sogliaValue;
  const grezza = (1 + soglia) / candidato.prob;
  // Toglie il rumore in virgola mobile prima di arrotondare per eccesso.
  const centesimi = Math.round(grezza * 100 * 1e6) / 1e6;
  return Math.ceil(centesimi) / 100;
}
