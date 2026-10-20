// Esiti delle giocate NBA: dal punteggio finale (supplementari compresi) a vinta / persa / rimborsata.
// Si scrive solo il campo `esito`. Una multipla si chiude qui solo se TUTTE le sue gambe sono NBA:
// le gambe non hanno un esito proprio, quindi le multiple miste (calcio + NBA) restano senza esito
// (il calcio chiude solo le giocate con sport 'calcio').
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoma, oraRoma } from '../calcio/testo.js';
import { squadraNba } from './squadre.js';

const QUATTRO_ORE = 4 * 3600 * 1000;
const GIORNO = 86400000;
const FILE_GIORNATA = /^(\d{4}-\d{2}-\d{2})\.json$/;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

const formatoUsa = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});

// Giorno di New York (AAAA-MM-GG) di un istante.
export const dataUsaDi = (istante) => formatoUsa.format(istante);

// 'vinta' | 'persa' | 'rimborsata' | null. Per "Vincente" servono r.casa e r.trasferta (nomi).
export function esitoNba(mercato, selezione, r) {
  const { puntiCasa: pc, puntiTrasferta: pt } = r ?? {};
  if (!num(pc) || !num(pt)) return null;
  const vinta = (b) => (b ? 'vinta' : 'persa');
  let m;
  if (mercato === 'Vincente') {
    if (pc === pt) return null;
    const s = squadraNba(selezione)?.nome;
    if (!s) return null;
    if (s === squadraNba(r.casa)?.nome) return vinta(pc > pt);
    if (s === squadraNba(r.trasferta)?.nome) return vinta(pt > pc);
    return null;
  }
  if ((m = /^Handicap ([+-]?\d+(?:\.\d+)?)$/.exec(mercato))) {
    if (selezione !== 'casa' && selezione !== 'trasferta') return null;
    const v = pc - pt + Number(m[1]);
    if (v === 0) return 'rimborsata';
    return vinta((v > 0) === (selezione === 'casa'));
  }
  if ((m = /^Totale punti (\d+(?:\.\d+)?)$/.exec(mercato))) {
    const linea = Number(m[1]);
    const sel = /^(Over|Under) (\d+(?:\.\d+)?)$/.exec(selezione);
    if (!sel || Number(sel[2]) !== linea) return null;
    const tot = pc + pt;
    if (tot === linea) return 'rimborsata';
    return vinta((tot > linea) === (sel[1] === 'Over'));
  }
  return null;
}

const gambeDi = (g) => (Array.isArray(g.gambe) && g.gambe.length ? g.gambe : [g]);
const inizioMs = (g) => Math.max(...gambeDi(g).map((x) => Date.parse(x.inizio)));
// Solo giocate con tutte le gambe NBA.
const tuttaNba = (g) => gambeDi(g).every((x) => (x.sport ?? g.sport) === 'nba');

function inAttesa(g, adesso) {
  return tuttaNba(g) && g.esito === null && g.stato !== 'annullata' && inizioMs(g) + QUATTRO_ORE < adesso.getTime();
}

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

export function giocateNbaInAttesa(dirData, adesso) {
  const out = [];
  for (const { dati } of leggiGiornate(dirData, adesso).out) {
    for (const g of dati.giocate) if (inAttesa(g, adesso)) out.push(g);
  }
  return out;
}

// Partita finita per squadre e giorno di New York; null se manca o è ambigua.
function trova(gamba, finite) {
  const testo = String(gamba.partita);
  const i = testo.indexOf(' - ');
  if (i < 0) return null;
  const casa = squadraNba(testo.slice(0, i))?.nome;
  const trasferta = squadraNba(testo.slice(i + 3))?.nome;
  if (!casa || !trasferta || casa === trasferta) return null;
  const giorno = dataUsaDi(new Date(gamba.inizio));
  const trovate = finite.filter((p) => p.casa === casa && p.trasferta === trasferta && p.dataUsa === giorno
    && num(p.puntiCasa) && num(p.puntiTrasferta));
  return trovate.length === 1 ? trovate[0] : null;
}

function esitoGiocata(g, finite) {
  const esiti = gambeDi(g).map((x) => {
    const p = trova(x, finite);
    return p ? esitoNba(x.mercato, x.selezione, p) : null;
  });
  if (esiti.includes('persa')) return 'persa';
  if (esiti.includes(null)) return null;
  if (esiti.every((e) => e === 'rimborsata')) return 'rimborsata';
  return 'vinta';
}

// Aggiorna solo `esito` delle giocate NBA finite. Avviso dopo 7 giorni senza esito.
export function aggiornaEsitiNba(dirData, partiteFinite, adesso) {
  const { out: giornate, errori } = leggiGiornate(dirData, adesso);
  const finite = partiteFinite.filter((p) => p.finita !== false);
  let aggiornate = 0;
  const file = [];
  for (const { percorso, dati } of giornate) {
    let cambiato = false;
    for (const g of dati.giocate) {
      if (!inAttesa(g, adesso)) continue;
      const esito = esitoGiocata(g, finite);
      if (esito !== null) {
        g.esito = esito;
        cambiato = true;
        aggiornate++;
      } else {
        const giorni = Math.floor((adesso.getTime() - inizioMs(g)) / GIORNO);
        if (giorni >= 7) errori.push(`Giocata ${g.id} senza esito da ${giorni} giorni`);
      }
    }
    if (cambiato) {
      writeFileSync(percorso, `${JSON.stringify(dati, null, 2)}\n`);
      file.push(percorso);
    }
  }
  return { aggiornate, file, errori };
}

// Passo della CLI: scarica le partite finite degli ultimi 10 giorni e aggiorna i file.
export async function aggiornaEsitiGiroNba({ dirData, adesso, fonti, chiavi, raccolta }) {
  const errore = (fonte, e) => raccolta.erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const pendenti = giocateNbaInAttesa(dirData, adesso);
  if (!pendenti.length) return { aggiornate: 0, file: [], errori: [] };
  const limite = dataUsaDi(new Date(adesso.getTime() - 10 * GIORNO));
  const date = [...new Set(pendenti.flatMap(gambeDi).map((x) => dataUsaDi(new Date(x.inizio))))].filter((d) => d >= limite).sort();
  let partite = [];
  if (date.length) {
    try {
      partite = await fonti.balldontlie.partite({ date }, { chiave: chiavi.balldontlie });
    } catch (e) {
      errore('balldontlie (esiti)', e);
    }
  }
  const out = aggiornaEsitiNba(dirData, partite, adesso);
  for (const m of out.errori) errore('Esiti NBA', new Error(m));
  return out;
}
