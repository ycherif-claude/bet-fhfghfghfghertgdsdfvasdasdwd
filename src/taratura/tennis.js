// Prova sul passato del tennis: l'Elo stima ogni partita con i soli dati precedenti
// (data/storico-tennis, 2024 come rodaggio) e si confronta con il mercato: Pinnacle quando c'è (quote di
// tennis-data, quasi di chiusura; dal 2026 tennis-data non le ha più), altrimenti la media dei bookmaker senza margine. Si provano diversi parametri dell'Elo, scelti sul 2025 e verificati sul 2026,
// e il peso del modello nella media con il mercato.
// Uso: node src/taratura/tennis.js [cartellaUscita]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { calcolaElo, probVittoria } from '../tennis/elo.js';
import { partiteDaFile } from '../tennis/fonti/tennis-data.js';
import { calibrazione, confronto, media, miscela, perdita, pesoMigliore, simulaGiocate } from './metriche.js';

const ANNI = [2024, 2025, 2026];
const GIORNO_MS = 86400000;

export function carica(cartella = 'data/storico-tennis') {
  const out = {};
  for (const c of ['atp', 'wta']) {
    out[c] = [];
    for (const a of ANNI) {
      const f = join(cartella, c, `${a}.xlsx`);
      if (existsSync(f)) out[c].push(...partiteDaFile(readFileSync(f)));
    }
  }
  return out;
}

const recenti = (voce, data, cfg) => {
  const fine = Date.parse(`${data}T00:00:00Z`);
  return voce.partite.filter((d) => fine - Date.parse(`${d}T00:00:00Z`) < 365 * GIORNO_MS).length < cfg.minPartite12Mesi;
};

// Previsioni di un circuito: una per partita completata con quote, dal 2025 in poi.
// Il lato è scelto in ordine alfabetico (non il vincitore), così calibrazione e media non hanno distorsioni.
export function previsioni(partite, cfg = CONFIG.tennis) {
  const out = [];
  calcolaElo(partite, cfg, {
    primaDi(p, w, l) {
      if (p.data < '2025-01-01' || p.commento || !p.avgw || !p.avgl) return;
      const pw = probVittoria(w, l, p.superficie, p.bestOf, cfg);
      const equa = (a, b) => (1 / a) / (1 / a + 1 / b);
      const pinnacle = p.psw && p.psl ? equa(p.psw, p.psl) : null;
      const fair = pinnacle ?? equa(p.avgw, p.avgl);
      const fairMedia = equa(p.avgw, p.avgl);
      const latoW = p.vincitore < p.perdente;
      out.push({
        anno: Number(p.data.slice(0, 4)), superficie: p.superficie, serie: p.serie,
        pm: latoW ? pw : 1 - pw, pp: latoW ? fair : 1 - fair, y: latoW ? 1 : 0, pinnacle: pinnacle !== null,
        ppMedia: latoW ? fairMedia : 1 - fairMedia,
        pochi: recenti(w, p.data, cfg) || recenti(l, p.data, cfg),
        quotaMedia: latoW ? p.avgw : p.avgl, quotaMediaAltra: latoW ? p.avgl : p.avgw,
        quotaMax: latoW ? p.maxw : p.maxl, quotaMaxAltra: latoW ? p.maxl : p.maxw,
      });
    },
  });
  return out;
}

const perditaEsito = (x, p) => perdita(x.y ? p : 1 - p);

// Riassunto di un insieme di previsioni: log-loss di modello, Pinnacle e media, peso migliore.
export function riassunto(prev, pesoAttuale) {
  const pm = prev.map((x) => perditaEsito(x, x.pm));
  const pp = prev.map((x) => perditaEsito(x, x.pp));
  const voci = prev.map((x) => ({ pm: x.y ? x.pm : 1 - x.pm, pp: x.y ? x.pp : 1 - x.pp }));
  const best = pesoMigliore(voci);
  const attuale = prev.map((x) => perditaEsito(x, miscela(x.pm, x.pp, pesoAttuale)));
  return {
    partite: prev.length,
    perditaModello: media(pm), perditaPinnacle: media(pp), perditaAttuale: media(attuale),
    modelloMenoPinnacle: confronto(pm, pp),
    attualeMenoPinnacle: confronto(attuale, pp),
    pesoMigliore: best.migliore.peso, perditaPesoMigliore: best.migliore.perdita,
  };
}

function occasioni(prev, peso, campo) {
  const out = [];
  for (const x of prev) {
    const p = miscela(x.pm, x.pp, peso);
    const q = campo === 'max' ? [x.quotaMax, x.quotaMaxAltra] : [x.quotaMedia, x.quotaMediaAltra];
    if (q[0]) out.push({ p, quota: q[0], y: x.y, pChiusura: x.pp });
    if (q[1]) out.push({ p: 1 - p, quota: q[1], y: 1 - x.y, pChiusura: 1 - x.pp });
  }
  return out;
}

export function griglia() {
  const out = [];
  for (const kBase of [150, 200, 250, 300, 350]) {
    for (const kEsponente of [0.3, 0.4, 0.5]) {
      for (const pesoSuperficie of [0, 0.25, 0.5, 0.75]) out.push({ ...CONFIG.tennis, kBase, kEsponente, pesoSuperficie });
    }
  }
  return out;
}

export function provaTennis(dati) {
  const risultato = { circuiti: {} };
  for (const [circuito, partite] of Object.entries(dati)) {
    if (!partite.length) continue;
    // Parametri attuali.
    const attuali = previsioni(partite);
    // Griglia: si sceglie sul 2025 (perdita del modello da solo), si verifica sul 2026.
    const prove = griglia().map((cfg) => {
      const prev = previsioni(partite, cfg);
      const p25 = prev.filter((x) => x.anno === 2025);
      return { cfg, prev, perdita2025: media(p25.map((x) => perditaEsito(x, x.pm))) };
    }).sort((a, b) => a.perdita2025 - b.perdita2025);
    const scelta = prove[0];
    const per = (prev) => ({
      '2025 contro Pinnacle': riassunto(prev.filter((x) => x.anno === 2025 && x.pinnacle), CONFIG.tennis.pesoModello),
      '2025 contro media bookmaker': riassunto(prev.filter((x) => x.anno === 2025).map((x) => ({ ...x, pp: x.ppMedia })), CONFIG.tennis.pesoModello),
      '2026 contro media bookmaker': riassunto(prev.filter((x) => x.anno === 2026).map((x) => ({ ...x, pp: x.ppMedia })), CONFIG.tennis.pesoModello),
      pochiDati: riassunto(prev.filter((x) => x.pochi), CONFIG.tennis.pesoModelloPocheDati),
      superfici: Object.fromEntries(['cemento', 'terra', 'erba'].map((s) => [s, riassunto(prev.filter((x) => x.superficie === s), CONFIG.tennis.pesoModello)])),
    });
    const pesoNuovo = riassunto(scelta.prev.filter((x) => x.anno === 2025 && x.pinnacle), CONFIG.tennis.pesoModello).pesoMigliore;
    // Giocate simulate sul 2025 (con Pinnacle come mercato e chiusura).
    const v26 = scelta.prev.filter((x) => x.anno === 2025 && x.pinnacle);
    const a26 = attuali.filter((x) => x.anno === 2025 && x.pinnacle);
    risultato.circuiti[circuito] = {
      parametriAttuali: { kBase: CONFIG.tennis.kBase, kEsponente: CONFIG.tennis.kEsponente, pesoSuperficie: CONFIG.tennis.pesoSuperficie, pesoModello: CONFIG.tennis.pesoModello },
      attuali: per(attuali),
      parametriMigliori: { kBase: scelta.cfg.kBase, kEsponente: scelta.cfg.kEsponente, pesoSuperficie: scelta.cfg.pesoSuperficie, pesoModello: pesoNuovo },
      migliori: per(scelta.prev),
      primeCinque: prove.slice(0, 5).map((x) => ({ kBase: x.cfg.kBase, kEsponente: x.cfg.kEsponente, pesoSuperficie: x.cfg.pesoSuperficie, perdita2025: x.perdita2025 })),
      calibrazioneModello2025: calibrazione(v26.map((x) => ({ p: x.pm, y: x.y }))),
      giocate2025: {
        attualeQuotaMedia: simulaGiocate(occasioni(a26, CONFIG.tennis.pesoModello, 'media')),
        attualeQuotaMax: simulaGiocate(occasioni(a26, CONFIG.tennis.pesoModello, 'max')),
        nuovoQuotaMedia: simulaGiocate(occasioni(v26, pesoNuovo, 'media')),
        nuovoQuotaMax: simulaGiocate(occasioni(v26, pesoNuovo, 'max')),
        soloPinnacleQuotaMax: simulaGiocate(occasioni(v26, 0, 'max')),
      },
    };
  }
  return risultato;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const uscita = process.argv[2] ?? 'data/taratura';
  const r = provaTennis(carica());
  mkdirSync(uscita, { recursive: true });
  writeFileSync(join(uscita, 'tennis.json'), `${JSON.stringify(r, null, 2)}\n`);
  console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v), 1));
}
