// Confronto settimanale per la revisione del lunedì [utente, 03/11/2026]: la lista del giorno è l'unica cosa mostrata,
// tutto il resto gira in background per vedere se sale o scende di precisione. Dalle righe del registro calcola, per
// gruppo e per settimana (da lunedì a domenica), partite chiuse, prese, percentuale contro quella attesa dal mercato
// e guadagno a 1 € a partita. In `soglie`, la stessa lista con quote minime e massime diverse. Due gruppi mostrano la
// lista senza l'accordo fra modello e mercato: scelta solo dal modello e solo dal mercato.
// Uso: npm run confronto-settimanale -- <fino a>   (data AAAA-MM-GG, compresa; stampa JSON)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { scegliLista } from '../regole/coppie-quota2.js';

const DATA = /^\d{4}-\d{2}-\d{2}$/;
// Prima di questo giorno il registro ha pochi mercati: i confronti partirebbero da numeri non paragonabili.
const DA = '2026-10-23';
const SOGLIE = [[1.15, 1.7], [1.2, 1.7], [1.25, 1.5], [1.25, 1.7], [1.25, 2], [1.25, 2.5], [1.3, 1.7], [1.25, Infinity], [1.7, 2.5]];
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const arrotonda = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

export function lunediDi(data) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function conta(righe) {
  const chiuse = righe.filter((x) => (x.esito === 'vinta' || x.esito === 'persa') && num(x.quota) && num(x.probMercato));
  const prese = chiuse.filter((x) => x.esito === 'vinta').length;
  const attese = chiuse.reduce((a, x) => a + x.probMercato, 0);
  const guadagno = chiuse.reduce((a, x) => a + (x.esito === 'vinta' ? x.quota - 1 : -1), 0);
  return {
    chiuse: chiuse.length,
    prese,
    percentuale: chiuse.length ? arrotonda(prese / chiuse.length, 3) : null,
    attesa: chiuse.length ? arrotonda(attese / chiuse.length, 3) : null,
    guadagno: arrotonda(guadagno),
    resa: chiuse.length ? arrotonda(guadagno / chiuse.length, 3) : null,
  };
}

// Il gruppo di una riga del background.
export function gruppoDi(x) {
  if (x.sport !== 'calcio') return x.sport;
  if (x.mercato === '1X2' && x.selezione === '1') return 'calcio: 1 (tutte le quote)';
  if (x.mercato === 'Under/Over 1.5' && x.selezione === 'Over 1.5') return 'calcio: Over 1.5 (tutte le quote)';
  if (/Under\/Over|Totale/.test(x.mercato)) return 'calcio: altri Under/Over';
  return 'calcio: altri mercati';
}

// `giorni`: [{ data, righe }] in ordine di data.
export function confrontoSettimanale(giorni) {
  const L = CONFIG.coppieQuota2.lista;
  const gruppi = {};
  const aggiungi = (nome, data, righe) => {
    const g = (gruppi[nome] ??= { totale: [], settimane: {} });
    g.totale.push(...righe);
    (g.settimane[lunediDi(data)] ??= []).push(...righe);
  };
  for (const { data, righe } of giorni) {
    aggiungi('lista', data, scegliLista(righe));
    aggiungi('lista: solo modello', data, scegliLista(righe, { ...L, scarto: Infinity, ordine: 'probModello' }));
    aggiungi('lista: solo mercato', data, scegliLista(righe, { ...L, scarto: Infinity }));
    const perGruppo = Object.groupBy(righe, gruppoDi);
    for (const [nome, lista] of Object.entries(perGruppo)) aggiungi(nome, data, lista);
  }
  return {
    gruppi: Object.fromEntries(Object.entries(gruppi).map(([nome, g]) => [nome, {
      totale: conta(g.totale),
      settimane: Object.fromEntries(Object.entries(g.settimane).sort().map(([s, r]) => [s, conta(r)])),
    }])),
    soglie: SOGLIE.map(([quotaMin, quotaMax]) => {
      const scelte = giorni.flatMap((g) => scegliLista(g.righe, { ...L, quotaMin, quotaMax }));
      return { quotaMin, quotaMax: Number.isFinite(quotaMax) ? quotaMax : null, inUso: quotaMin === L.quotaMin && quotaMax === L.quotaMax, ...conta(scelte) };
    }),
  };
}

export function leggiGiorni(dirData, fino) {
  const dir = path.join(dirData, 'registro');
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) >= DA && f.slice(0, 10) <= fino).sort()
    .map((f) => ({ data: f.slice(0, 10), righe: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).righe ?? [] }));
}

function principale() {
  const [fino] = process.argv.slice(2);
  if (!DATA.test(fino ?? '')) {
    console.error('Uso: npm run confronto-settimanale -- <fino a>   (data AAAA-MM-GG, per esempio 2026-11-08)');
    process.exit(1);
  }
  const dirData = path.resolve(process.env.BET_DIR_DATA ?? 'data');
  console.log(JSON.stringify(confrontoSettimanale(leggiGiorni(dirData, fino)), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principale();
