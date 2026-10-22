// Prova sul passato del calcio: le forze di attacco e difesa si stimano ogni settimana con i soli dati
// precedenti (stagione in corso e le due prima, come la raccolta), poi la matrice Dixon-Coles dà 1X2 e
// Under/Over 2.5, confrontati con Pinnacle del CSV di football-data.co.uk (quote prima della partita e di chiusura).
// Si provano mezza vita e rho (scelti sulle stagioni 2021/22-2023/24, verificati su 2024/25-2025/26) e il peso
// del modello nella media con Pinnacle. Gli xG nei CSV ci sono solo dalla stagione 2026/27: il loro peso non si può ancora provare.
// Uso: node src/taratura/calcio.js <cartellaCsv> [cartellaUscita]   (file <codice>_<stagione>.csv, es. I1_2425.csv)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { COMPETIZIONI } from '../calcio/competizioni.js';
import { leggiCsv } from '../calcio/csv.js';
import { partitaFootballData, quoteFootballData } from '../calcio/fonti/football-data-uk.js';
import { lambda, matrice, stimaForze } from '../calcio/modelli/gol.js';
import { calibrazione, confronto, media, miscela, perdita, simulaGiocate } from './metriche.js';

export const STAGIONI_PROVA = ['2122', '2223', '2324', '2425', '2526'];
const STAGIONI_SCELTA = new Set(['2122', '2223', '2324']);
const GIORNO_MS = 86400000;
const precedente = (s) => {
  const a = Number(s.slice(0, 2)) - 1;
  return `${String(a).padStart(2, '0')}${String(a + 1).padStart(2, '0')}`;
};

export function caricaLega(cartella, codice, stagioni) {
  const out = new Map();
  for (const s of stagioni) {
    const f = join(cartella, `${codice}_${s}.csv`);
    if (!existsSync(f)) continue;
    const righe = [];
    for (const r of leggiCsv(readFileSync(f, 'utf8'))) {
      const p = partitaFootballData(r);
      if (p) righe.push({ ...p, stagione: s, quote: quoteFootballData(r) });
    }
    out.set(s, righe);
  }
  return out;
}

const equa = (q) => {
  const inv = q.map((x) => 1 / x);
  const t = inv.reduce((a, x) => a + x, 0);
  return inv.map((x) => x / t);
};

function probMercati(lam, rho) {
  const m = matrice(lam.casa, lam.trasferta, rho);
  let p1 = 0, px = 0, p2 = 0, over = 0;
  for (let c = 0; c < m.length; c++) {
    for (let t = 0; t < m[c].length; t++) {
      if (c > t) p1 += m[c][t]; else if (c === t) px += m[c][t]; else p2 += m[c][t];
      if (c + t > 2.5) over += m[c][t];
    }
  }
  return { x12: [p1, px, p2], ou: [over, 1 - over] };
}

// Lambda di ogni partita della stagione `s` (forze ristimate ogni 7 giorni) per una mezza vita.
export function lambdaStagione(stagioni, s, mezzaVita) {
  const s1 = precedente(s);
  const s2 = precedente(s1);
  const storico = [...(stagioni.get(s2) ?? []), ...(stagioni.get(s1) ?? [])];
  const ultima = stagioni.get(s1) ? new Set(stagioni.get(s1).flatMap((x) => [x.casa, x.trasferta])) : undefined;
  const correnti = [...(stagioni.get(s) ?? [])].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const out = [];
  let i = 0;
  while (i < correnti.length) {
    const inizio = correnti[i].data;
    const fine = new Date(Date.parse(`${inizio}T00:00:00Z`) + 7 * GIORNO_MS).toISOString().slice(0, 10);
    const righe = [...storico, ...correnti.filter((x) => x.data < inizio)];
    const forze = stimaForze(righe, { oggi: inizio, squadreUltimaStagione: ultima, mezzaVita });
    for (; i < correnti.length && correnti[i].data < fine; i++) {
      const x = correnti[i];
      const lam = lambda(forze, x.casa, x.trasferta);
      if (lam && lam.casa > 0 && lam.trasferta > 0) out.push({ x, lam });
    }
  }
  return out;
}

// Previsioni (mercato per mercato) di una lega e stagione, con le quote del CSV.
export function previsioni(lambdi, rho, lega) {
  const out = [];
  for (const { x, lam } of lambdi) {
    const p = probMercati(lam, rho);
    const q = x.quote;
    const esito1x2 = x.gc > x.gt ? 0 : x.gc === x.gt ? 1 : 2;
    const esitoOU = x.gc + x.gt > 2.5 ? 0 : 1;
    const mercati = [
      { mercato: '1X2', pm: p.x12, esito: esito1x2, pin: q.pinnacle1x2, chiusura: q.pinnacleChiusura1x2, avg: q.media1x2, max: q.max1x2 },
      { mercato: 'Under/Over 2.5', pm: p.ou, esito: esitoOU, pin: q.pinnacleOU, chiusura: q.pinnacleChiusuraOU, avg: q.mediaOU, max: q.maxOU },
    ];
    for (const m of mercati) {
      if (!m.pin) continue;
      out.push({
        lega, stagione: x.stagione, data: x.data, mercato: m.mercato, esito: m.esito, pm: m.pm,
        pp: equa(m.pin), pc: m.chiusura ? equa(m.chiusura) : null, avg: m.avg, max: m.max,
      });
    }
  }
  return out;
}

const perditaVoce = (v, p) => perdita(p[v.esito]);
const misto = (v, w) => v.pm.map((x, i) => miscela(x, v.pp[i], w));

export function riassunto(voci, pesoAttuale = 1 - CONFIG.calcio.pesoPinnacle) {
  if (!voci.length) return null;
  const pm = voci.map((v) => perditaVoce(v, v.pm));
  const pp = voci.map((v) => perditaVoce(v, v.pp));
  const conChiusura = voci.filter((v) => v.pc);
  const pesi = [];
  for (let k = 0; k <= 20; k++) pesi.push({ peso: k / 20, perdita: media(voci.map((v) => perditaVoce(v, misto(v, k / 20)))) });
  const best = pesi.reduce((a, r) => (r.perdita < a.perdita ? r : a));
  const att = voci.map((v) => perditaVoce(v, misto(v, pesoAttuale)));
  return {
    voci: voci.length,
    perditaModello: media(pm), perditaPinnacle: media(pp),
    perditaPinnacleChiusura: conChiusura.length ? media(conChiusura.map((v) => perditaVoce(v, v.pc))) : null,
    perditaAttuale: media(att),
    modelloMenoPinnacle: confronto(pm, pp), attualeMenoPinnacle: confronto(att, pp),
    pesoMigliore: best.peso, perditaPesoMigliore: best.perdita,
  };
}

// Giocate simulate con le regole del giro: media modello/Pinnacle, scarto massimo dal mercato, value ≥ 5%.
export function occasioni(voci, peso, { campo = 'avg', scarto = CONFIG.calcio.scartoMaxPinnacle } = {}) {
  const out = [];
  for (const v of voci) {
    const q = v[campo];
    if (!q) continue;
    const p = misto(v, peso);
    for (let i = 0; i < q.length; i++) {
      if (peso > 0 && scarto !== null && Math.abs(v.pm[i] - v.pp[i]) > scarto) continue;
      out.push({ p: p[i], quota: q[i], y: v.esito === i ? 1 : 0, pChiusura: v.pc ? v.pc[i] : null });
    }
  }
  return out;
}

export function provaCalcio(cartella, { mezzeVite = [90, 182, 365, 730], rhos = [-0.15, -0.1, -0.08, -0.05, 0] } = {}) {
  const leghe = COMPETIZIONI.filter((c) => c.csv);
  const tutte = new Map(); // `${mezzaVita}|${rho}` -> voci
  for (const c of leghe) {
    const stagioni = caricaLega(cartella, c.csv, ['1920', '2021', ...STAGIONI_PROVA]);
    for (const mv of mezzeVite) {
      const lambdi = STAGIONI_PROVA.flatMap((s) => lambdaStagione(stagioni, s, mv));
      for (const rho of rhos) {
        const k = `${mv}|${rho}`;
        if (!tutte.has(k)) tutte.set(k, []);
        tutte.get(k).push(...previsioni(lambdi, rho, c.nome));
      }
    }
  }
  const scelta = (v) => v.filter((x) => STAGIONI_SCELTA.has(x.stagione));
  const verifica = (v) => v.filter((x) => !STAGIONI_SCELTA.has(x.stagione));
  const griglia = [...tutte.entries()].map(([k, v]) => {
    const [mv, rho] = k.split('|').map(Number);
    return { mezzaVita: mv, rho, perditaScelta: media(scelta(v).map((x) => perditaVoce(x, x.pm))) };
  }).sort((a, b) => a.perditaScelta - b.perditaScelta);
  const kAtt = `${CONFIG.calcio.mezzaVitaGiorni}|${CONFIG.calcio.rho}`;
  const attuali = tutte.get(kAtt) ?? [];
  const best = griglia[0];
  const migliori = tutte.get(`${best.mezzaVita}|${best.rho}`);
  const pesoNuovo = riassunto(scelta(migliori)).pesoMigliore;

  const perMercato = (v, peso) => Object.fromEntries(['1X2', 'Under/Over 2.5'].map((m) => [m, riassunto(v.filter((x) => x.mercato === m), peso)]));
  const perLega = (v) => Object.fromEntries(leghe.map((c) => {
    const vv = verifica(v).filter((x) => x.lega === c.nome);
    return [c.nome, vv.length ? perMercato(vv) : null];
  }));
  const giocate = (v, peso, campo, scarto) => {
    const occ = occasioni(verifica(v), peso, { campo, scarto });
    return simulaGiocate(occ);
  };
  return {
    parametriAttuali: { mezzaVita: CONFIG.calcio.mezzaVitaGiorni, rho: CONFIG.calcio.rho, pesoModello: 1 - CONFIG.calcio.pesoPinnacle },
    parametriMigliori: { mezzaVita: best.mezzaVita, rho: best.rho, pesoModello: pesoNuovo },
    griglia: griglia.slice(0, 8),
    attuali: { scelta: perMercato(scelta(attuali)), verifica: perMercato(verifica(attuali)) },
    migliori: { scelta: perMercato(scelta(migliori)), verifica: perMercato(verifica(migliori)) },
    perLegaVerifica: perLega(migliori),
    calibrazioneModello: {
      '1X2 casa': calibrazione(verifica(migliori).filter((x) => x.mercato === '1X2').map((x) => ({ p: x.pm[0], y: +(x.esito === 0) }))),
      '1X2 pareggio': calibrazione(verifica(migliori).filter((x) => x.mercato === '1X2').map((x) => ({ p: x.pm[1], y: +(x.esito === 1) }))),
      'Over 2.5': calibrazione(verifica(migliori).filter((x) => x.mercato !== '1X2').map((x) => ({ p: x.pm[0], y: +(x.esito === 0) }))),
    },
    giocateVerifica: {
      attualeQuotaMedia: giocate(attuali, 1 - CONFIG.calcio.pesoPinnacle, 'avg', CONFIG.calcio.scartoMaxPinnacle),
      attualeQuotaMax: giocate(attuali, 1 - CONFIG.calcio.pesoPinnacle, 'max', CONFIG.calcio.scartoMaxPinnacle),
      attualeSenzaScartoQuotaMedia: giocate(attuali, 1 - CONFIG.calcio.pesoPinnacle, 'avg', null),
      nuovoQuotaMedia: giocate(migliori, pesoNuovo, 'avg', CONFIG.calcio.scartoMaxPinnacle),
      nuovoQuotaMax: giocate(migliori, pesoNuovo, 'max', CONFIG.calcio.scartoMaxPinnacle),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cartella, uscita = 'data/taratura'] = process.argv.slice(2);
  if (!cartella) {
    console.error('Uso: node src/taratura/calcio.js <cartellaCsv> [cartellaUscita]');
    process.exit(1);
  }
  const r = provaCalcio(cartella);
  mkdirSync(uscita, { recursive: true });
  writeFileSync(join(uscita, 'calcio.json'), `${JSON.stringify(r, null, 2)}\n`);
  console.log('Prova sul passato del calcio salvata');
}
