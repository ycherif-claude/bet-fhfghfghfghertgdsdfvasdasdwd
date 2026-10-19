// Esiti delle giocate di calcio: dal risultato della partita a vinta / persa / rimborsata.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../config.js';
import { COMPETIZIONI } from './competizioni.js';
import { abbinaSquadra } from './squadre.js';
import { dataRoma, oraRoma } from './testo.js';

const TRE_ORE = 3 * 3600 * 1000;
const FILE_GIORNATA = /^(\d{4}-\d{2}-\d{2})\.json$/;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Sopra/sotto una linea; con linea intera e totale uguale è un rimborso.
function sopraSotto(selezione, totale, linea) {
  if (totale === null) return null;
  const lato = selezione.startsWith('Over') ? 'Over' : selezione.startsWith('Under') ? 'Under' : null;
  if (!lato) return null;
  if (totale === linea) return 'rimborsata';
  return (totale > linea) === (lato === 'Over') ? 'vinta' : 'persa';
}

const somma = (a, b) => (num(a) && num(b) ? a + b : null);

// 'vinta' | 'persa' | 'rimborsata' | null (dati insufficienti o mercato sconosciuto).
export function esitoSelezione(mercato, selezione, r) {
  const { gc, gt } = r ?? {};
  if (!num(gc) || !num(gt)) return null;
  const vinta = (b) => (b ? 'vinta' : 'persa');
  let m;

  if (mercato === '1X2') {
    const reale = gc > gt ? '1' : gc < gt ? '2' : 'X';
    return ['1', 'X', '2'].includes(selezione) ? vinta(reale === selezione) : null;
  }
  if (mercato === 'Doppia chance') {
    const reale = gc > gt ? '1' : gc < gt ? '2' : 'X';
    return ['1X', '12', 'X2'].includes(selezione) ? vinta(selezione.includes(reale)) : null;
  }
  if (mercato === 'Gol/No gol') {
    if (selezione !== 'Gol' && selezione !== 'No gol') return null;
    return vinta((gc > 0 && gt > 0) === (selezione === 'Gol'));
  }
  if (mercato === 'Risultato esatto') {
    return /^\d+-\d+$/.test(selezione) ? vinta(selezione === `${gc}-${gt}`) : null;
  }
  if ((m = /^Handicap asiatico ([+-]\d+(?:\.\d+)?)$/.exec(mercato))) {
    // Linea riferita alla squadra di casa: v > 0 vince la casa, v < 0 la trasferta.
    const v = gc - gt + Number(m[1]);
    if (selezione !== 'casa' && selezione !== 'trasferta') return null;
    if (v === 0) return 'rimborsata';
    return vinta((v > 0) === (selezione === 'casa'));
  }
  if ((m = /^Angoli Under\/Over (\d+(?:\.\d+)?)$/.exec(mercato))) {
    return sopraSotto(selezione, somma(r.angoliC, r.angoliT), Number(m[1]));
  }
  if ((m = /^Cartellini Under\/Over (\d+(?:\.\d+)?)$/.exec(mercato))) {
    return sopraSotto(selezione, somma(r.cartC, r.cartT), Number(m[1]));
  }
  if ((m = /^Under\/Over 1° tempo (\d+(?:\.\d+)?)$/.exec(mercato))) {
    return sopraSotto(selezione, somma(r.gcPT, r.gtPT), Number(m[1]));
  }
  if ((m = /^Under\/Over (casa|trasferta) (\d+(?:\.\d+)?)$/.exec(mercato))) {
    return sopraSotto(selezione, m[1] === 'casa' ? gc : gt, Number(m[2]));
  }
  if ((m = /^Under\/Over (\d+(?:\.\d+)?)$/.exec(mercato))) {
    return sopraSotto(selezione, gc + gt, Number(m[1]));
  }
  return null;
}

// Singola/speciale/builder: dalla propria partita; multipla (o con gambe): dalle gambe.
export function esitoGiocata(giocata, risultatiPerPartita) {
  const gambe = Array.isArray(giocata.gambe) && giocata.gambe.length ? giocata.gambe : [giocata];
  const esiti = gambe.map((g) => {
    const r = risultatiPerPartita.get(g.idPartita);
    return r ? esitoSelezione(g.mercato, g.selezione, r) : null;
  });
  if (esiti.includes('persa')) return 'persa';
  if (esiti.includes(null)) return null;
  if (esiti.every((e) => e === 'rimborsata')) return 'rimborsata';
  return 'vinta';
}

const gambeDi = (g) => (Array.isArray(g.gambe) && g.gambe.length ? g.gambe : [g]);
const inizioMs = (g) => Math.max(...gambeDi(g).map((x) => Date.parse(x.inizio)));

// In attesa di esito: calcio, esito null, non annullata, finita da più di 3 ore.
function inAttesa(g, adesso) {
  return g.sport === 'calcio' && g.esito === null && g.stato !== 'annullata'
    && inizioMs(g) + TRE_ORE < adesso.getTime();
}

// Giornate passate leggibili: [{ percorso, dati, testo }]; i file rotti vanno in `errori`.
function leggiGiornate(dirData, adesso) {
  const oggi = dataRoma(adesso);
  const out = [];
  const errori = [];
  let nomi = [];
  try { nomi = readdirSync(dirData).sort(); } catch { return { out, errori }; }
  for (const nome of nomi) {
    const m = FILE_GIORNATA.exec(nome);
    if (!m || m[1] >= oggi) continue;
    const percorso = join(dirData, nome);
    try {
      const dati = JSON.parse(readFileSync(percorso, 'utf8'));
      if (Array.isArray(dati?.giocate)) out.push({ percorso, dati });
    } catch (e) {
      errori.push(`${nome}: file non leggibile (${e.message})`);
    }
  }
  return { out, errori };
}

// Nomi delle competizioni con giocate ancora senza esito.
export function competizioniInAttesa(dirData, adesso) {
  const nomi = new Set();
  for (const { dati } of leggiGiornate(dirData, adesso).out) {
    for (const g of dati.giocate) {
      if (inAttesa(g, adesso)) for (const x of gambeDi(g)) nomi.add(x.competizione);
    }
  }
  return nomi;
}

const dataDi = (r) => r.data ?? dataRoma(new Date(r.inizio));

// Unisce i risultati della stessa partita: gol da chiunque li abbia, angoli e cartellini da chi li ha.
function unisci(trovati) {
  const out = { ...trovati[0] };
  for (const r of trovati.slice(1)) {
    for (const [k, v] of Object.entries(r)) {
      if (num(v) && !num(out[k])) out[k] = v;
    }
  }
  return out;
}

// Risultato di una gamba, oppure null se manca o è ambiguo.
function trova(gamba, risultati) {
  const i = String(gamba.partita).indexOf(' - ');
  if (i < 0) return null;
  const casa = gamba.partita.slice(0, i);
  const trasferta = gamba.partita.slice(i + 3);
  const data = dataRoma(new Date(gamba.inizio));
  const candidati = risultati.filter((r) => dataDi(r) === data && (!r.competizione || r.competizione === gamba.competizione));
  const perFonte = new Map();
  for (const r of candidati) {
    if (!perFonte.has(r.fonte)) perFonte.set(r.fonte, []);
    perFonte.get(r.fonte).push(r);
  }
  const trovati = [];
  for (const gruppo of perFonte.values()) {
    const nomi = [...new Set(gruppo.flatMap((r) => [r.casa, r.trasferta]))];
    const c = abbinaSquadra(casa, nomi);
    const t = abbinaSquadra(trasferta, nomi);
    if (!c || !t || c === t) continue;
    const esatti = gruppo.filter((r) => r.casa === c && r.trasferta === t);
    if (esatti.length === 1) trovati.push(esatti[0]);
  }
  return trovati.length ? unisci(trovati) : null;
}

// Aggiorna solo il campo `esito` delle giocate di calcio finite; i file non cambiati restano intatti.
export function aggiornaEsiti(dirData, risultati, adesso) {
  const { out: giornate, errori } = leggiGiornate(dirData, adesso);
  let aggiornate = 0;
  const file = [];
  for (const { percorso, dati } of giornate) {
    let cambiato = false;
    for (const g of dati.giocate) {
      if (!inAttesa(g, adesso)) continue;
      const mappa = new Map();
      for (const x of gambeDi(g)) {
        const r = trova(x, risultati);
        if (r) mappa.set(x.idPartita, r);
      }
      const esito = esitoGiocata(g, mappa);
      if (esito !== null) {
        g.esito = esito;
        cambiato = true;
        aggiornate++;
      }
    }
    if (cambiato) {
      writeFileSync(percorso, `${JSON.stringify(dati, null, 2)}\n`);
      file.push(percorso);
    }
  }
  return { aggiornate, file, errori };
}

// Partite dei CSV già scaricati (codice → righe) come Risultato, dalla data `da` in poi.
export function risultatiDaCsv(csvPerCodice, da) {
  const out = [];
  for (const [codice, righe] of csvPerCodice) {
    const c = COMPETIZIONI.find((x) => x.csv === codice);
    if (!c) continue;
    for (const p of righe) {
      if (p.data < da) continue;
      out.push({
        casa: p.casa, trasferta: p.trasferta, data: p.data, inizio: `${p.data}T12:00:00Z`,
        gc: p.gc, gt: p.gt, gcPT: p.gcPT ?? null, gtPT: p.gtPT ?? null,
        angoliC: p.angoliC ?? undefined, angoliT: p.angoliT ?? undefined,
        cartC: p.cartC ?? undefined, cartT: p.cartT ?? undefined,
        fonte: 'football-data.co.uk', competizione: c.nome,
      });
    }
  }
  return out;
}

const giorniPrima = (data, n) => {
  const [y, m, g] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, g - n)).toISOString().slice(0, 10);
};

// Passo della CLI: scarica i risultati necessari, aggiorna i file e registra crediti ed errori nella raccolta.
export async function aggiornaEsitiGiro({ dirData, adesso, fonti, chiavi, raccolta, csv }) {
  const attesa = competizioniInAttesa(dirData, adesso);
  if (!attesa.size) return { aggiornate: 0, file: [], errori: [] };
  const errore = (fonte, e) => raccolta.erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const oggi = dataRoma(adesso);
  const da = giorniPrima(oggi, 4);
  const risultati = risultatiDaCsv(csv ?? new Map(), da);

  if (!chiavi.footballDataOrg) {
    errore('football-data.org', new Error('manca FOOTBALL_DATA_ORG_KEY'));
  } else {
    try {
      risultati.push(...await fonti.footballDataOrg.risultati({ da, a: oggi }, { chiave: chiavi.footballDataOrg }));
    } catch (e) {
      errore('football-data.org', e);
    }
  }

  // Solo le competizioni che né il CSV né football-data.org coprono; 2 crediti l'una, dopo il budget delle quote.
  const scoperte = COMPETIZIONI.filter((c) => attesa.has(c.nome) && c.csv === null && c.nome !== 'Champions League');
  for (const c of scoperte) {
    if (!chiavi.oddsApi) break;
    if (raccolta.crediti.rimasti - 2 < CONFIG.calcio.riservaCrediti * 500) break;
    try {
      const r = await fonti.oddsApi.risultati(c.chiave, { chiave: chiavi.oddsApi });
      risultati.push(...r.map((x) => ({ ...x, competizione: c.nome })));
      raccolta.crediti.usati += 2;
      raccolta.crediti.rimasti -= 2;
    } catch (e) {
      errore(`The Odds API (${c.nome})`, e);
    }
  }

  const out = aggiornaEsiti(dirData, risultati, adesso);
  for (const m of out.errori) errore('Esiti', new Error(m));
  return out;
}
