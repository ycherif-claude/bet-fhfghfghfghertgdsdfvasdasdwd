// Misure della prova sul passato: log-loss, confronto appaiato, calibrazione e giocate simulate.
const EPS = 1e-9;

// Log-loss di una previsione: −ln(probabilità data all'esito vero). Più bassa è meglio.
export const perdita = (p) => -Math.log(Math.min(1 - EPS, Math.max(EPS, p)));

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : null);

// Differenza media appaiata (a − b) con errore standard: negativa = a è meglio di b.
export function confronto(a, b) {
  const d = a.map((x, i) => x - b[i]);
  const m = media(d);
  if (m === null) return { differenza: null, errore: null };
  const v = d.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, d.length - 1);
  return { differenza: m, errore: Math.sqrt(v / d.length) };
}

// Media pesata lineare, come probUsata del giro: w · modello + (1 − w) · mercato.
export const miscela = (pm, pp, w) => w * pm + (1 - w) * pp;

// Peso del modello che rende minima la log-loss (griglia di passo 0.05).
// `voci`: [{ esiti: [{ pm, pp }] }] dove ogni voce è un mercato con l'esito vero al primo posto della lista `vero`.
export function pesoMigliore(voci, passo = 0.05) {
  const righe = [];
  for (let w = 0; w <= 1 + 1e-9; w += passo) {
    const ww = Math.round(w * 100) / 100;
    righe.push({ peso: ww, perdita: media(voci.map((x) => perdita(miscela(x.pm, x.pp, ww)))) });
  }
  return { migliore: righe.reduce((a, r) => (r.perdita < a.perdita ? r : a)), righe };
}

// Calibrazione: per fasce di probabilità, prevista media contro frequenza vera.
export function calibrazione(previsioni, fasce = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001]) {
  const out = [];
  for (let i = 0; i < fasce.length - 1; i++) {
    const dentro = previsioni.filter((x) => x.p >= fasce[i] && x.p < fasce[i + 1]);
    if (!dentro.length) continue;
    out.push({
      fascia: `${Math.round(fasce[i] * 100)}-${Math.min(100, Math.round(fasce[i + 1] * 100))}%`,
      n: dentro.length,
      prevista: media(dentro.map((x) => x.p)),
      vera: media(dentro.map((x) => x.y)),
    });
  }
  return out;
}

// Giocate simulate: value = p · quota − 1 ≥ soglia. Rendimento a puntata fissa e CLV
// (quota giocata / quota equa di chiusura − 1, la chiusura senza margine).
export function simulaGiocate(occasioni, { soglia = 0.05 } = {}) {
  const giocate = occasioni.filter((o) => o.quota > 1 && o.p * o.quota - 1 >= soglia);
  const n = giocate.length;
  if (!n) return { giocate: 0, rendimento: null, clv: null, vinte: null };
  const utile = giocate.reduce((a, o) => a + (o.y ? o.quota - 1 : -1), 0);
  const conClv = giocate.filter((o) => o.pChiusura > 0);
  return {
    giocate: n,
    vinte: giocate.filter((o) => o.y).length / n,
    rendimento: utile / n,
    clv: conClv.length ? media(conClv.map((o) => o.quota * o.pChiusura - 1)) : null,
  };
}

export { media };
