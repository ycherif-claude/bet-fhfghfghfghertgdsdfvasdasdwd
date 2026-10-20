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
const sportDi = (x, g) => x.sport ?? g.sport;
const aperta = (g) => g.esito === null && g.stato !== 'annullata';
// Gambe NBA ancora senza esito e finite da più di 4 ore.
const gambeDaChiudere = (g, adesso) => gambeDi(g).filter((x) => sportDi(x, g) === 'nba' && x.esito == null
  && Date.parse(x.inizio) + QUATTRO_ORE < adesso.getTime());

// Regola della multipla: persa se una gamba è persa; aperta (null) se ne manca una;
// rimborsata se sono tutte rimborsate; altrimenti vinta.
function chiusura(g) {
  const esiti = gambeDi(g).map((x) => x.esito ?? null);
  if (esiti.includes('persa')) return 'persa';
  if (esiti.includes(null)) return null;
  if (esiti.every((e) => e === 'rimborsata')) return 'rimborsata';
  return 'vinta';
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
    for (const g of dati.giocate) if (aperta(g) && gambeDaChiudere(g, adesso).length) out.push(g);
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

// Scrive l'esito di ogni gamba NBA risolvibile e chiude la giocata se tutte le gambe hanno un esito.
function aggiorna(g, finite, adesso) {
  let cambiato = false;
  for (const x of gambeDaChiudere(g, adesso)) {
    const p = trova(x, finite);
    const e = p ? esitoNba(x.mercato, x.selezione, p) : null;
    if (e) { x.esito = e; cambiato = true; }
  }
  const esito = chiusura(g);
  if (esito !== null && g.esito !== esito) { g.esito = esito; cambiato = true; }
  return cambiato;
}

// Aggiorna solo `esito` (della giocata e delle sue gambe NBA). Avviso dopo 7 giorni senza esito.
// Le multiple miste si chiudono quando ogni modulo ha scritto l'esito delle proprie gambe.
export function aggiornaEsitiNba(dirData, partiteFinite, adesso) {
  const { out: giornate, errori } = leggiGiornate(dirData, adesso);
  const finite = partiteFinite.filter((p) => p.finita !== false);
  let aggiornate = 0;
  const file = [];
  for (const { percorso, dati } of giornate) {
    let cambiato = false;
    for (const g of dati.giocate) {
      if (!aperta(g) || !gambeDaChiudere(g, adesso).length) continue;
      if (aggiorna(g, finite, adesso)) {
        cambiato = true;
        if (g.esito !== null) aggiornate++;
      }
      if (g.esito === null && gambeDaChiudere(g, adesso).length) {
        const giorni = Math.floor((adesso.getTime() - inizioMs(g)) / GIORNO);
        if (giorni >= 7) errori.push(`Giocata ${g.id} senza esito da ${giorni} giorni`);
      }
    }
    if (cambiato) {
      writeFileSync(percorso, `${JSON.stringify(dati, null, 2)}
`);
      file.push(percorso);
    }
  }
  return { aggiornate, file, errori };
}

// Passo della CLI: scarica le partite finite degli ultimi 10 giorni e aggiorna i file.
export async function aggiornaEsitiGiroNba({ dirData, adesso, fonti, chiavi, raccolta }) {
  const errore = (fonte, e) => raccolta.erroriGiro.push(`${fonte} alle ${oraRoma(adesso)}: ${e?.message ?? e}`);
  const pendenti = giocateNbaInAttesa(dirData, adesso);
  const limite = dataUsaDi(new Date(adesso.getTime() - 10 * GIORNO));
  const date = [...new Set(pendenti.flatMap((g) => gambeDaChiudere(g, adesso)).map((x) => dataUsaDi(new Date(x.inizio))))].filter((d) => d >= limite).sort();
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
