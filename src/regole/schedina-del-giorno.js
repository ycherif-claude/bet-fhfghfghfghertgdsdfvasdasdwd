// Schedina del giorno [utente, 01/11/2026]: ogni mattina il sistema sceglie da solo il tipo di schedina che sta andando
// meglio e mostra solo quella. Si confronta la prima schedina di ogni tipo, giorno per giorno, con 1 € a schedina.
// Il voto unisce i risultati passati e il guadagno atteso secondo il mercato per la schedina di oggi: con pochi giorni
// conta di più il mercato, poi sempre di più i risultati. Si toglie l'incertezza, così gli sbalzi di una multipla
// entrata poche volte non bastano. Tutte possono essere in perdita attesa: il voto sceglie la meno svantaggiosa.
import { CONFIG } from '../config.js';

const C = CONFIG.schedinaDelGiorno;
const prima = (l) => (Array.isArray(l) ? l[0] : null) ?? null;
const multipla = (n) => (g) => (g?.multipleBonus ?? []).find((m) => m?.criterio === 'probabilitaConfermate' && m.gambe?.length === n) ?? null;
export const FORMATI = Object.freeze([
  { chiave: 'tripla', nome: 'Tripla', prendi: (g) => prima(g?.coppieQuota2?.triple) },
  { chiave: 'doppia', nome: 'Doppia', prendi: (g) => prima(g?.coppieQuota2?.doppie) },
  { chiave: 'triplaOver15', nome: 'Tripla Over 1.5', prendi: (g) => prima(g?.coppieQuota2?.over15) },
  { chiave: 'doppiaOver15', nome: 'Doppia Over 1.5', prendi: (g) => prima(g?.coppieQuota2?.doppieOver15) },
  { chiave: 'multipla5', nome: 'Multipla da 5', prendi: multipla(5) },
  { chiave: 'multipla10', nome: 'Multipla da 10', prendi: multipla(10) },
]);

const arrotonda = (x, cifre = 2) => Math.round(x * 10 ** cifre) / 10 ** cifre;
const guadagno = (s) => (s?.esito === 'vinta' ? s.ritorno - 1 : s?.esito === 'persa' ? -1 : s?.esito === 'rimborsata' ? 0 : null);

// Risultati di un tipo: la schedina vera del giorno se c'è, altrimenti quella ricostruita.
function statistiche(f, giornate, ricostruite, oggi) {
  const reali = new Map(giornate.map((g) => [g.data, f.prendi(g)]));
  const giorni = [...new Set([...Object.keys(ricostruite), ...reali.keys()])].sort();
  const schedine = giorni.map((d) => reali.get(d) ?? ricostruite[d]?.[f.chiave] ?? null).filter((s) => guadagno(s) !== null);
  const valori = schedine.map(guadagno);
  const n = valori.length;
  const media = n ? valori.reduce((a, b) => a + b, 0) / n : 0;
  const varianza = n > 1 ? valori.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1) : 0;
  const schedina = f.prendi(oggi);
  const atteso = typeof schedina?.valueAtteso === 'number' ? schedina.valueAtteso : null;
  const k = C.pesoMercato;
  return {
    formato: f.chiave, nome: f.nome, giorni: n, vinte: schedine.filter((s) => s.esito === 'vinta').length,
    profitto: arrotonda(media * n),
    prob: typeof schedina?.prob === 'number' ? arrotonda(schedina.prob, 3) : null,
    atteso: atteso === null ? null : arrotonda(atteso, 3),
    voto: atteso === null ? null : arrotonda((media * n + k * atteso) / (n + k) - Math.sqrt(varianza / (n + k)), 3),
  };
}

// La scelta di oggi fra i tipi disponibili oggi (hanno un voto). Con pochi giorni chiusi per tutti, il primo in classifica.
export function scegliSchedina(oggi, giornate, ricostruite = {}) {
  const classifica = FORMATI.map((f) => statistiche(f, giornate, ricostruite, oggi)).sort((a, b) => (b.voto ?? -Infinity) - (a.voto ?? -Infinity) || b.profitto - a.profitto);
  const scelto = classifica.find((r) => r.voto !== null && r.giorni >= C.minGiorni) ?? classifica.find((r) => r.voto !== null);
  if (!scelto) return null;
  return { formato: scelto.formato, nome: scelto.nome, id: FORMATI.find((f) => f.chiave === scelto.formato).prendi(oggi).id, classifica };
}

// Bilancio delle schedine scelte davvero, con 1 € a schedina.
export function bilancioSchedineScelte(giornate) {
  const r = { chiuse: 0, vinte: 0, perse: 0, profitto: 0 };
  for (const g of giornate) {
    const f = FORMATI.find((x) => x.chiave === (g?.schedinaDelGiorno ?? g?.schedinaDelGiornoStudio)?.formato);
    const s = f?.prendi(g);
    const v = guadagno(s);
    if (v === null) continue;
    r.chiuse++;
    if (s.esito === 'vinta') r.vinte++;
    if (s.esito === 'persa') r.perse++;
    r.profitto += v;
  }
  r.profitto = arrotonda(r.profitto);
  return r;
}
