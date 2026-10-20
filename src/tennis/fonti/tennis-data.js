import { scarica } from '../../calcio/fonti/http.js';
import { leggiXlsx } from '../xlsx.js';

const AGENTE = 'analisi-giocate (progetto personale)';
const PAGINA = 'http://www.tennis-data.co.uk/alldata.php';
const RADICE = 'https://www.tennis-data.co.uk/';

const numero = (v) => (v === undefined || v === null || String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const SUPERFICI = { clay: 'terra', grass: 'erba' };
const superficie = (s) => SUPERFICI[String(s ?? '').trim().toLowerCase()] ?? 'cemento';

function opzioni(opz) {
  const { fetch, attesaMs, timeoutMs } = opz;
  const o = { headers: { 'User-Agent': AGENTE } };
  if (fetch) o.fetch = fetch;
  if (attesaMs !== undefined) o.attesaMs = attesaMs;
  if (timeoutMs !== undefined) o.timeoutMs = timeoutMs;
  return o;
}

function set(r, prefisso) {
  const out = [];
  for (let i = 1; i <= 5; i++) {
    const n = numero(r[`${prefisso}${i}`]);
    if (n !== null) out.push(n);
  }
  return out;
}

function converti(r) {
  const data = typeof r.Date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.Date) ? r.Date.slice(0, 10) : null;
  if (!data || !r.Winner || !r.Loser) return null;
  const comm = String(r.Comment ?? '').trim();
  const p = {
    data,
    torneo: r.Tournament ?? '',
    luogo: r.Location == null || String(r.Location).trim() === '' ? null : String(r.Location).trim(),
    serie: r.Series ?? r.Tier ?? null,
    superficie: superficie(r.Surface),
    turno: r.Round ?? null,
    bestOf: numero(r['Best of']),
    vincitore: String(r.Winner).trim(),
    perdente: String(r.Loser).trim(),
    setW: set(r, 'W'),
    setL: set(r, 'L'),
    commento: comm === '' || comm.toLowerCase() === 'completed' ? null : comm,
  };
  const psw = numero(r.PSW);
  const psl = numero(r.PSL);
  if (psw !== null && psl !== null) { p.psw = psw; p.psl = psl; }
  return p;
}

export const tennisData = {
  async fileStagione(anno, circuito, opz = {}) {
    const r = await scarica(PAGINA, opzioni(opz));
    const suffisso = circuito === 'wta' ? 'w' : '';
    const coda = `/${anno}${suffisso}/${anno}.xlsx`;
    for (const m of r.testo.matchAll(/href\s*=\s*["']([^"']+\.xlsx)["']/gi)) {
      const href = m[1].trim();
      if (href.endsWith(coda)) return new URL(href, RADICE).href;
    }
    // status 404: come un file assente sul server (a gennaio il file dell'anno nuovo può non esserci ancora).
    throw Object.assign(new Error(`tennis-data.co.uk: file ${circuito.toUpperCase()} ${anno} non trovato nell'elenco`), { status: 404 });
  },

  async partite(anno, circuito, opz = {}) {
    const url = await this.fileStagione(anno, circuito, opz);
    const r = await scarica(url, { ...opzioni(opz), binario: true });
    const leggi = opz.leggi ?? leggiXlsx;
    return leggi(r.corpo).map(converti).filter(Boolean);
  },
};

// A gennaio il file dell'anno nuovo può non essere ancora pubblicato: un 404 sul file
// dell'anno di `data` è previsto e non va segnalato come errore.
export function fileNonAncoraPubblicato(e, anno, data) {
  return e?.status === 404 && anno === Number(data.slice(0, 4)) && data.slice(5, 7) === '01';
}
