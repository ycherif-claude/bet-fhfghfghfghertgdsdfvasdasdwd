// Notifiche Telegram: giocate del giorno, cambi di stato (giro serale e controlli prima delle partite),
// esiti delle giocate fatte ed errori.
// Si confronta la giornata di oggi (e gli errori nuovi di quella prima) con quello che è già stato mandato (data/stato/telegram.json):
// ogni messaggio ha una chiave e parte una volta sola. Gli esiti si mandano solo per le giocate
// segnate come fatte sul sito, con quota e puntata reali [utente].
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { giornataDi, partiRoma } from '../bankroll/settimana.js';
import { oraRoma } from '../calcio/testo.js';
import { leggiJson, erroreSegnatura } from '../build/costruisci-sito.js';
import { statoBankroll, giocateConProva } from '../bankroll/bankroll.js';
import { bilancioPronostici } from '../regole/pronostici.js';
import { CONFIG } from '../config.js';
import { nomeBookmaker } from '../calcio/odss.js';
import { MODI, bilancioCoppie } from '../regole/coppie-quota2.js';
import { bigliettiGiornata, profittoReale } from '../storico/biglietti.js';

const GIORNI_STATO = 14;
const SIMBOLO = { calcio: '⚽', tennis: '🎾', nba: '🏀', basket: '🏀', pallavolo: '🏐' };
const STATO_SERALE = { in_revisione: 'IN REVISIONE', confermata: 'CONFERMATA', modificata: 'MODIFICATA', annullata: 'ANNULLATA' };
// Righe informative di erroriGiro che non sono guasti: non si notificano.
const INFORMATIVI = [/già iniziat/, /TheSportsDB.*HTTP 429/];

// Errori (erroriGiro, Action fallite, giornata non scritta) solo sul sito, non su Telegram [utente, 26/10/2026].
const ERRORI_SU_TELEGRAM = false;

// Solo l'essenziale [utente, 29/10/2026]: al mattino le coppie a quota 2 e le multiple con le partite più
// probabili; durante il giorno i loro esiti e quelli delle giocate fatte. Tutto il resto si calcola e si
// registra come prima, ma non si manda (le chiavi si segnano lo stesso: niente arretrati se si riaccende).
const SOLO_ESSENZIALE = true;

const html = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const virgola = (q) => q.toFixed(2).replace('.', ',');
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const giornoMese = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
// Hash breve e stabile di un testo (per le chiavi degli errori).
function hash(testo) {
  let h = 5381;
  for (const c of String(testo)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

// "2,40 €": due decimali con la virgola, come il bankroll.
const importo = (n) => `${virgola(n)} €`;
// Puntata ridotta dal tetto giornaliero: ", ridotta da 5,00 €, tetto giornaliero".
const ridotta = (p) => (p.ridotta && num(p.ridotta.da) && typeof p.ridotta.motivo === 'string'
  ? `, ridotta da ${importo(p.ridotta.da)}, ${html(p.ridotta.motivo)}` : '');
// "puntata 1,00 € (puntata fissa, giornata piena)" quando il tetto è tolto per oggi; altrimenti con la percentuale.
const testoPuntata = (p) => (p.fissa && typeof p.fissa === 'object'
  ? `puntata ${importo(p.euro)} (puntata fissa, giornata piena)`
  : `puntata ${importo(p.euro)} (${String(p.percentuale).replace('.', ',')}%${ridotta(p)})`);

function rigaQuota(g) {
  const minima = num(g.quotaMinima) ? `minima ${virgola(g.quotaMinima)}` : null;
  const quota = num(g.quota) ? `quota ${virgola(g.quota)}` : 'quota da verificare su bet365';
  // Giocata di prova: nessun importo da puntare.
  const puntata = g.prova === true ? 'PROVA – non giocare' : g.puntata && num(g.puntata.euro) ? testoPuntata(g.puntata) : null;
  return [quota, minima, puntata].filter(Boolean).join(' · ');
}

// Testo di una giocata: singola su tre righe, multipla con le gambe.
export function testoGiocata(g, i) {
  const ora = Number.isFinite(Date.parse(g.inizio)) ? oraRoma(new Date(g.inizio)) : '';
  if (Array.isArray(g.gambe) && g.gambe.length) {
    const gambe = g.gambe.map((x) => `   ${SIMBOLO[x.sport] ?? '•'} ${html(x.partita)}: ${html(x.mercato)} → ${html(x.selezione)}`);
    return [`${i}. <b>${g.tipo === 'builder' ? 'Builder' : 'Multipla'} (${g.gambe.length} gambe)</b>`, ...gambe, `   ${rigaQuota(g)}`].join('\n');
  }
  return [
    `${i}. ${SIMBOLO[g.sport] ?? '•'} <b>${html(g.partita)}</b>${ora ? ` · ${ora}` : ''}`,
    `   ${html(g.mercato)} → <b>${html(g.selezione)}</b>`,
    `   ${rigaQuota(g)}`,
  ].join('\n');
}

// Multipla bonus bet365 (prova): titolo, quota con l'incremento e gambe.
export function testoMultiplaBonus(mb) {
  const gambe = mb.gambe.map((x) => `   ${SIMBOLO[x.sport] ?? '•'} ${html(x.partita)}: ${html(x.mercato)} → ${html(x.selezione)} @${virgola(x.quota)}${num(x.quotaBet365) ? ` (bet365 ${virgola(x.quotaBet365)})` : ''}`);
  return [`🧪 <b>${html(mb.nome)}</b> (prova, non giocare)`, `   quota ${virgola(mb.quota)} · incremento ${Math.round(mb.incremento * 1000) / 10}% → <b>${virgola(mb.quotaConBonus)}</b>`, ...gambe].join('\n');
}

// Coppie a quota 2 mostrate [utente, 31/10/2026]: per margine, ma solo partite su cui modello e mercato sono
// d'accordo ("confermate"); gli altri modi si calcolano per confronto e restano nascosti.
const coppieDi = (giornata, modo) => (Array.isArray(giornata?.coppieQuota2?.[modo]) ? giornata.coppieQuota2[modo].filter((x) => x && x.id && Array.isArray(x.gambe)) : []);
// Mostrate [utente, 31/10/2026]: solo per probabilità, con partite confermate da modello e mercato. Quelle per
// margine (confermate e non) si calcolano in background per studiarle.
const COPPIE_MOSTRATE = [['probabilitaConfermate', 'per probabilità']];
export function testoCoppie(giornata) {
  const sezioni = [];
  for (const [modo, nome] of COPPIE_MOSTRATE) {
    const coppie = coppieDi(giornata, modo);
    if (!coppie.length) continue;
    const blocchi = coppie.map((c, i) => [
      `${i + 1}. quota <b>${virgola(c.quota)}</b> · mercato ${percentuale(c.prob)}`,
      ...c.gambe.map((x) => `   ${SIMBOLO[x.sport] ?? '•'} ${Number.isFinite(Date.parse(x.inizio)) ? `${oraRoma(new Date(x.inizio))} ` : ''}${html(x.partita)}: ${html(x.mercato)} → ${html(x.selezione)} @${virgola(x.quota)}${num(x.quotaBet365) ? ` (bet365 ${virgola(x.quotaBet365)})` : ''}`),
    ].join('\n'));
    sezioni.push([`🎲 <b>Coppie a quota 2 ${nome}</b> (confermate da modello e mercato)`, ...blocchi].join('\n\n'));
  }
  return sezioni.length ? sezioni.join('\n\n') : null;
}
const percentuale = (p) => `${Math.round(p * 100)}%`;
const migliaia = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// Percentuale del pronostico con il numero di partite della sua fascia (correzione B1).
const conPartite = (x) => (num(x.n) ? `${percentuale(x.prob)} su ${migliaia(x.n)} partite` : percentuale(x.prob));
const pronosticiDi = (giornata) => (Array.isArray(giornata?.pronostici) ? giornata.pronostici.filter((x) => x && Array.isArray(x.pronostici)) : []);

// Spiegazione del ✅ e dei pronostici collegati (regola di CONFIG.pronostici; il sito ha lo stesso testo).
const SPIEGAZIONE_PRONOSTICI = [
  `✅ = giocabile: anche Pinnacle (senza margine) lo dà almeno al ${Math.round(CONFIG.pronostici.probMinima * 100)}% e la quota di uno dei tuoi bookmaker è almeno il ${Math.round((CONFIG.pronostici.margineQuota - 1) * 100)}% sopra la minima. Senza ✅ è solo da tenere d'occhio.`,
  'I pronostici della stessa partita sono collegati, non indipendenti: mai più di uno della stessa partita in una multipla.',
].join('\n');
const DA_TENERE_D_OCCHIO = "solo da tenere d'occhio: controlla la quota su bet365";

// Pronostici sì/no del giorno: una riga per pronostico, con la quota minima e, se c'è, la quota di oggi.
// Senza quota o senza la probabilità di Pinnacle: "solo da tenere d'occhio".
export function testoPronostici(giornata, oggi) {
  const partite = pronosticiDi(giornata);
  if (!partite.length) return `📋 <b>Pronostici del ${giornoMese(oggi)}</b>: oggi nessuna partita ha un pronostico abbastanza sicuro.`;
  // Idea 2: solo il migliore di ogni partita; gli altri si contano e restano sul sito.
  // Dati vecchi senza `migliore`: tutti, come prima.
  let altri = 0;
  const blocchi = partite.map((p) => {
    const ora = Number.isFinite(Date.parse(p.inizio)) ? ` · ${oraRoma(new Date(p.inizio))}` : '';
    const scelti = p.pronostici.some((x) => x?.migliore === true) ? p.pronostici.filter((x) => x?.migliore === true) : p.pronostici;
    altri += p.pronostici.length - scelti.length;
    const righe = scelti.map((x) => {
      // Idea 1: quota migliore dei bookmaker dell'utente (odss-api), con la minima e l'orario della quota.
      if (num(x.quotaMigliore)) {
        const oraQ = Number.isFinite(Date.parse(x.oraQuota)) ? `, quota delle ${oraRoma(new Date(x.oraQuota))}` : '';
        const segnale = x.giocabile === true ? ' ✅' : " · solo da tenere d'occhio";
        return `   SÌ ${html(x.testo ?? `${x.mercato}: ${x.selezione}`)} · ${conPartite(x)} · quota migliore ${virgola(x.quotaMigliore)} su ${html(nomeBookmaker(x.bookmakerMigliore))} (minima ${virgola(x.quotaMinima)})${oraQ}${segnale}`;
      }
      // Quota media di The Odds API: solo un'informazione, mai ✅.
      if (x.fonteQuota === 'media' && num(x.quota)) {
        return `   SÌ ${html(x.testo ?? `${x.mercato}: ${x.selezione}`)} · ${conPartite(x)} · quota media ${virgola(x.quota)}, non dei tuoi bookmaker (minima ${virgola(x.quotaMinima)}) · solo da tenere d'occhio`;
      }
      const quota = num(x.quota) ? ` (ora ${virgola(x.quota)}${x.giocabile === true ? ' ✅' : ''})` : '';
      const occhio = num(x.quota) && num(x.probMercato) ? '' : ` · ${DA_TENERE_D_OCCHIO}`;
      return `   SÌ ${html(x.testo ?? `${x.mercato}: ${x.selezione}`)} · ${conPartite(x)} · min ${virgola(x.quotaMinima)}${quota}${occhio}`;
    });
    return [`${SIMBOLO[p.sport] ?? '•'} <b>${html(p.partita)}</b>${ora}`, ...righe].join('\n');
  });
  const piede = altri ? [`altri ${altri} ${altri === 1 ? 'pronostico' : 'pronostici'} sul sito`] : [];
  return [`📋 <b>Pronostici del ${giornoMese(oggi)}</b>\n${SPIEGAZIONE_PRONOSTICI}`, ...blocchi, ...piede].join('\n\n');
}

// Bilancio dei pronostici di una giornata: quando sono tutti chiusi (o dopo 3 giorni), una volta sola.
export function messaggiPronostici({ giornate, inviate, oggi }) {
  const out = [];
  const limite = new Date(Date.parse(`${oggi}T00:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);
  for (const x of giornate) {
    if (x.data >= oggi) continue;
    const tutti = pronosticiDi(x).flatMap((p) => p.pronostici.map((y) => ({ ...y, partita: p.partita })));
    if (!tutti.length) continue;
    const chiusi = tutti.filter((y) => y.esito === 'vinta' || y.esito === 'persa');
    const aperti = tutti.filter((y) => y.esito === null || y.esito === undefined);
    if (aperti.length && x.data > limite) continue;
    const chiave = `${x.data}|pronostici-esito`;
    if (inviate.has(chiave) || !chiusi.length) continue;
    // Bilancio anche per partita: i pronostici della stessa partita non sono prove indipendenti.
    const b = bilancioPronostici(x);
    const sbagliati = b.sbagliati.map((y) => `   ❌ ${html(y.partita)}: ${html(y.testo)}`);
    const chiuse = b.partite.tutteGiuste + b.partite.conSbagliati;
    out.push({ chiave, testo: [
      `📋 <b>Pronostici del ${giornoMese(x.data)}</b>: ${b.giusti} giusti su ${b.chiusi} (${percentuale(b.giusti / b.chiusi)})${aperti.length ? `, ${aperti.length} senza esito` : ''}`,
      `Per partita: ${b.partite.tutteGiuste} su ${chiuse} tutti giusti, ${b.partite.conSbagliati} con qualcuno sbagliato${b.partite.aperte ? ` (${b.partite.aperte} ancora aperte)` : ''}.`,
      'I pronostici della stessa partita sono collegati: quando una partita va storta sbagliano spesso insieme, non contarli come indipendenti.',
      ...sbagliati,
    ].join('\n') });
  }
  return out;
}

// ---- Doppie e triple di pronostici (idea 4) ----
const schedinePronostici = (giornata) => (Array.isArray(giornata?.schedinePronostici)
  ? giornata.schedinePronostici.filter((x) => x && x.id && Array.isArray(x.gambe)) : []);
const NOME_SCHEDINA = { doppia: 'Doppia', tripla: 'Tripla' };

// Testo delle schedine: quota totale, probabilità combinata prudente e gambe (quota minima "da verificare").
export function testoSchedinePronostici(lista, data, { nuove = false } = {}) {
  const prova = lista.some((s) => s.prova === true);
  const titolo = `${prova ? '🧪' : '🎟️'} <b>${nuove ? 'Nuove doppie' : 'Doppie'} e triple dei pronostici, ${giornoMese(data)}</b>${prova ? ' (PROVA – non giocare)' : ''}`;
  const blocchi = lista.map((s, i) => [
    `${i + 1}. <b>${NOME_SCHEDINA[s.tipo] ?? 'Schedina'}</b> · quota ${virgola(s.quota)} · probabilità prudente ${percentuale(s.probCombinata)}${s.prova === true ? ` · ${html(s.etichetta ?? 'PROVA – non giocare')}` : ''}`,
    ...s.gambe.map((x) => {
      const ora = Number.isFinite(Date.parse(x.inizio)) ? ` · ${oraRoma(new Date(x.inizio))}` : '';
      return `   ${SIMBOLO[x.sport] ?? '•'} ${html(x.partita)}${ora}: SÌ ${html(x.testo ?? `${x.mercato}: ${x.selezione}`)} @${virgola(x.quota)}${x.bookmaker ? ` su ${html(nomeBookmaker(x.bookmaker))}` : ''}${x.fonteQuota === 'media' ? ' (quota media, non dei tuoi bookmaker: da verificare)' : x.quotaDaVerificare ? ' (quota minima, da verificare su bet365)' : ''}`;
    }),
  ].join('\n'));
  return [titolo, ...blocchi, 'Fuori dal bankroll: non contano finché non le giochi davvero.'].join('\n\n');
}

// Esito di ogni schedina, una volta per schedina ed esito.
export function messaggiSchedinePronostici({ giornate, inviate }) {
  const out = [];
  for (const x of giornate) {
    for (const s of schedinePronostici(x)) {
      if (!s.esito) continue;
      const chiave = `${x.data}|schedina-esito|${s.id}|${s.esito}`;
      if (inviate.has(chiave)) continue;
      const perse = s.gambe.filter((g) => g.esito === 'persa').length;
      const rimborsate = s.gambe.filter((g) => g.esito === 'rimborsata').length;
      const dettaglio = s.esito === 'vinta' ? `1 € → <b>${virgola(s.quotaFinale)} €</b>${rimborsate ? ` (${rimborsate === 1 ? '1 gamba rimborsata' : `${rimborsate} gambe rimborsate`}, quota ricalcolata)` : ''}`
        : s.esito === 'persa' ? `${perse} ${perse === 1 ? 'pronostico sbagliato' : 'pronostici sbagliati'} su ${s.gambe.length}` : 'tutte le gambe rimborsate';
      const nome = `${NOME_SCHEDINA[s.tipo] ?? 'Schedina'} di pronostici del ${giornoMese(x.data)}${s.prova === true ? ' (prova)' : ''}`;
      out.push({ chiave, testo: `${s.prova === true ? '🧪' : '🎟️'} ${nome}: ${ESITO[s.esito] ?? s.esito}, ${dettaglio}\n${s.gambe.map((g) => `   ${g.esito === 'vinta' ? '✅' : g.esito === 'persa' ? '❌' : g.esito === 'rimborsata' ? '↩️' : '•'} ${html(g.partita)}: ${html(g.testo ?? g.selezione)}`).join('\n')}` });
    }
  }
  return out;
}

const multipleBonus = (giornata) => (Array.isArray(giornata?.multipleBonus) ? giornata.multipleBonus.filter((x) => x && x.id && Array.isArray(x.gambe)) : []);

// Storico diviso [utente, 26/10/2026]: pronostici dall'80% in su e partite della multipla da 20, dall'inizio
// e del giorno prima. Solo esiti chiusi (vinta/persa). Un messaggio al giorno, dopo le 9 (dopo il registro del mattino).
export function contaStorico(giornate, ieri) {
  const conta = () => ({ giusti: 0, chiusi: 0, promessa: 0 });
  const r = { pronostici: conta(), pronosticiIeri: conta(), multipla: conta(), multiplaIeri: conta(), multipleVinte: 0, multipleChiuse: 0 };
  const aggiungi = (c, esito, p) => {
    if (esito !== 'vinta' && esito !== 'persa') return;
    c.chiusi++;
    if (esito === 'vinta') c.giusti++;
    if (num(p)) c.promessa += p;
  };
  for (const g of giornate) {
    for (const p of pronosticiDi(g)) {
      for (const x of p.pronostici) {
        if (!(x.prob >= 0.8 - 1e-9)) continue;
        aggiungi(r.pronostici, x.esito, x.prob);
        if (g.data === ieri) aggiungi(r.pronosticiIeri, x.esito, x.prob);
      }
    }
    for (const mb of multipleBonus(g).filter((m) => m.lunga === true || m.gambe.length === 20)) {
      for (const x of mb.gambe) {
        aggiungi(r.multipla, x.esito, x.probMercato);
        if (g.data === ieri) aggiungi(r.multiplaIeri, x.esito, x.probMercato);
      }
      if (mb.esito === 'vinta' || mb.esito === 'persa') { r.multipleChiuse++; if (mb.esito === 'vinta') r.multipleVinte++; }
    }
  }
  // Coppie a quota 2: i due modi a confronto (dall'inizio e ieri).
  const diIeri = giornate.filter((g) => g.data === ieri);
  r.coppie = Object.fromEntries(MODI.map((k) => [k, { tutte: bilancioCoppie(giornate, k), ieri: bilancioCoppie(diIeri, k) }]));
  // Multiple con le partite più probabili, per lunghezza: chiuse, vinte e profitto con 1 € (bonus compreso).
  r.multipleProb = {};
  r.multipleProbConf = {};
  for (const g of giornate) {
    for (const mb of multipleBonus(g).filter((m) => m.criterio === 'probabilita' || m.criterio === 'probabilitaConfermate')) {
      if (mb.esito !== 'vinta' && mb.esito !== 'persa') continue;
      const dove = mb.criterio === 'probabilita' ? r.multipleProb : r.multipleProbConf;
      const c = (dove[mb.gambe.length] ??= { chiuse: 0, vinte: 0, profitto: 0 });
      c.chiuse++;
      if (mb.esito === 'vinta') { c.vinte++; c.profitto += mb.ritorno - 1; } else c.profitto -= 1;
    }
  }
  return r;
}

const euroSegno = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${virgola(Math.abs(n))} €`;
const rigaCoppie = (b) => (b.chiuse ? `${b.vinte} su ${b.chiuse} vinte, ${euroSegno(b.profitto)}` : 'nessuna chiusa');

// `essenziale`: solo coppie a quota 2 e multiple con le partite più probabili (SOLO_ESSENZIALE).
export function messaggioStorico({ giornate, inviate, oggi, adesso, essenziale = false }) {
  const chiave = `${oggi}|storico`;
  if (inviate.has(chiave) || partiRoma(adesso).ora < 9) return [];
  const ieri = new Date(Date.parse(`${oggi}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const r = contaStorico(giornate.filter((g) => g.data < oggi), ieri);
  // Su Telegram niente modello [utente, 29/10/2026]: solo margine e probabilità del mercato (gli altri modi sul sito).
  const conCoppie = ['margine', 'probabilita', 'confermate', 'probabilitaConfermate'].some((k) => r.coppie[k].tutte.chiuse > 0);
  const lunghezzeProb = [...new Set([...Object.keys(r.multipleProb), ...Object.keys(r.multipleProbConf)])].map(Number).sort((a, b) => a - b);
  const vuoto = { chiuse: 0, vinte: 0, profitto: 0 };
  const altri = !essenziale && (r.pronostici.chiusi || r.multipla.chiusi);
  if (!altri && !conCoppie && !lunghezzeProb.length) return [];
  const riga = (c) => (c.chiusi ? `${c.giusti} su ${c.chiusi} (${percentuale(c.giusti / c.chiusi)})` : 'nessuno chiuso');
  const promessa = (c) => (c.chiusi ? percentuale(c.promessa / c.chiusi) : '–');
  const testo = [
    `📊 <b>Storico al ${giornoMese(oggi)}</b>`,
    ...(essenziale ? [] : [
    '',
    '📋 <b>Pronostici dall\'80% in su</b>',
    `   dall'inizio: <b>${riga(r.pronostici)}</b> · promessi ${promessa(r.pronostici)}`,
    `   ieri (${giornoMese(ieri)}): ${riga(r.pronosticiIeri)}`,
    '',
    '🧪 <b>Partite della multipla lunga (tutte le partite adatte)</b>',
    `   dall'inizio: <b>${riga(r.multipla)}</b> · attese dal mercato ${promessa(r.multipla)}`,
    `   ieri (${giornoMese(ieri)}): ${riga(r.multiplaIeri)}`,
    `   multiple lunghe vinte: ${r.multipleVinte} su ${r.multipleChiuse}`,
    ]),
    ...(conCoppie ? [
      '',
      '🎲 <b>Coppie a quota 2</b> (1 € a coppia)',
      `   per probabilità, confermate (quelle mostrate): <b>${rigaCoppie(r.coppie.probabilitaConfermate.tutte)}</b> · ieri ${rigaCoppie(r.coppie.probabilitaConfermate.ieri)}`,
      `   per margine, confermate (studio): <b>${rigaCoppie(r.coppie.confermate.tutte)}</b> · ieri ${rigaCoppie(r.coppie.confermate.ieri)}`,
      `   per margine (mostrate fino al 30/10): <b>${rigaCoppie(r.coppie.margine.tutte)}</b> · ieri ${rigaCoppie(r.coppie.margine.ieri)}`,
      `   per probabilità (confronto): <b>${rigaCoppie(r.coppie.probabilita.tutte)}</b> · ieri ${rigaCoppie(r.coppie.probabilita.ieri)}`,
    ] : []),
    ...(lunghezzeProb.length ? [
      '',
      '🧪 <b>Multiple con le partite più probabili</b> (1 € a multipla, bonus compreso)',
      ...lunghezzeProb.map((n) => `   da ${n}: confermate (mostrate dal 31/10) <b>${rigaCoppie(r.multipleProbConf[n] ?? vuoto)}</b> · tutte <b>${rigaCoppie(r.multipleProb[n] ?? vuoto)}</b>`),
    ] : []),
  ].join('\n');
  return [{ chiave, testo }];
}

// Esito delle multiple bonus, una volta per multipla.
export function messaggiMultipleBonus({ giornate, inviate }) {
  const out = [];
  for (const x of giornate) {
    for (const mb of multipleBonus(x)) {
      if (!mb.esito) continue;
      const chiave = `${x.data}|bonus|${mb.id}|${mb.esito}`;
      if (inviate.has(chiave)) continue;
      const perse = mb.gambe.filter((g) => g.esito === 'persa').length;
      const dettaglio = mb.esito === 'vinta' ? `1 € → <b>${virgola(mb.ritorno)} €</b>`
        : mb.esito === 'persa' ? `${perse} ${perse === 1 ? 'partita persa' : 'partite perse'} su ${mb.gambe.length}` : 'tutte le partite rimborsate';
      out.push({ chiave, testo: `🧪 ${html(mb.nome)} del ${giornoMese(x.data)} (prova): ${ESITO[mb.esito] ?? mb.esito}, ${dettaglio}` });
    }
  }
  return out;
}

// Messaggio del mattino essenziale: coppie a quota 2 e multiple con le partite più probabili.
// Multiple mostrate [utente, 31/10/2026]: per probabilità, solo partite confermate da modello e mercato.
const multipleProb = (giornata) => multipleBonus(giornata).filter((m) => m.criterio === 'probabilitaConfermate');
export function testoMattinoEssenziale(giornata, oggi) {
  const coppie = testoCoppie(giornata);
  const multiple = multipleProb(giornata).map(testoMultiplaBonus);
  if (!coppie && !multiple.length) return `🎲 <b>Oggi, ${giornoMese(oggi)}</b>: nessuna coppia a quota 2 e nessuna multipla (poche partite adatte).`;
  return [...(coppie ? [coppie] : []), ...multiple].join('\n\n');
}

// Divide i messaggi in da mandare e da tacere (SOLO_ESSENZIALE). Il messaggio del mattino diventa quello essenziale.
// Si mandano: Action fallite e giornata mancante (se gli errori sono accesi), esiti delle multiple per probabilità,
// esiti (anche provvisori) delle giocate fatte, storico. Il resto si tace.
export function soloEssenziale(lista, { giornata, oggi, sito = null }) {
  const manda = [];
  const tacere = [];
  const piede = sito ? `\n\n${sito}` : '';
  const sempre = /\|(run|mancante|esito|provvisorio|storico)(\||$)/;
  for (const m of lista) {
    if (m.chiave === `${oggi}|giornata`) manda.push({ ...m, testo: testoMattinoEssenziale(giornata, oggi) + piede });
    else if (sempre.test(m.chiave)) manda.push(m);
    else if (/\|bonus\|MBPC/.test(m.chiave)) manda.push(m);
    else tacere.push(m);
  }
  return { manda, tacere };
}

const valide = (giornata) => (Array.isArray(giornata?.giocate) ? giornata.giocate.filter((g) => g && g.id) : []);

// Messaggi da mandare ora: [{ chiave, testo }]. `inviate`: Set delle chiavi già mandate.
// `run`: Action finita male da segnalare ({ id, nome, url, conclusione }) oppure null. `sito`: indirizzo del sito o null.
export function messaggi({ giornata, oggi, adesso, inviate, run = null, sito = null, errori = ERRORI_SU_TELEGRAM }) {
  const out = [];
  const aggiungi = (chiave, testo) => { if (!inviate.has(chiave)) out.push({ chiave, testo }); };
  const piede = sito ? `\n\n${sito}` : '';

  if (run && errori) {
    const come = run.conclusione === 'cancelled' ? 'è stata annullata' : 'è fallita';
    aggiungi(`${oggi}|run|${run.id}`, `⚠️ L'Action «${html(run.nome)}» ${come}.\n${run.url}`);
  }

  const delGiorno = giornata && giornata.data === oggi ? giornata : null;
  if (!delGiorno) {
    // Dopo le 12:00 la giornata di oggi dovrebbe esserci (giro di Claude o riserva delle 09:45 UTC).
    if (errori && partiRoma(adesso).ora >= 12) aggiungi(`${oggi}|mancante`, `⚠️ La giornata del ${giornoMese(oggi)} non è stata scritta: né il giro del mattino né la riserva.`);
    return out;
  }
  const giocate = valide(delGiorno);

  // 1. Giocate del giorno: un messaggio la prima volta, poi solo le giocate nuove (per esempio il tennis della sera).
  const annunciate = new Set([...inviate].filter((k) => k.startsWith(`${oggi}|giocata|`)).map((k) => k.slice(`${oggi}|giocata|`.length)));
  const primo = !inviate.has(`${oggi}|giornata`);
  // Modalità prova: le giocate non vanno giocate, servono al database della taratura.
  const prova = delGiorno.prova === true;
  const titolo = prova ? `🧪 <b>Giocate di PROVA, ${giornoMese(oggi)}</b>\nNon giocarle: servono a creare il database per tarare il sistema.` : `🎯 <b>Giocate di oggi, ${giornoMese(oggi)}</b>`;
  if (primo) {
    const testo = giocate.length
      ? [titolo, ...giocate.map((g, i) => testoGiocata(g, i + 1))].join('\n\n')
      : `${prova ? '🧪' : '🎯'} <b>Oggi, ${giornoMese(oggi)}, nessuna giocata</b>: nessun mercato ha value${prova ? ' positivo' : ' sufficiente'}.`;
    const bonus = multipleBonus(delGiorno).map(testoMultiplaBonus);
    // In prova il messaggio del mattino sono i pronostici; le giocate di prova restano sul sito.
    const base = prova
      ? `${testoPronostici(delGiorno, oggi)}\n\n🧪 ${giocate.length === 1 ? '1 giocata' : `${giocate.length} giocate`} di prova sul sito: non giocarle, servono al database.`
      : testo;
    const coppie = testoCoppie(delGiorno);
    const conBonus = [base, ...(coppie ? [coppie] : []), ...bonus].join('\n\n');
    out.push({ chiave: `${oggi}|giornata`, testo: conBonus + piede, segna: [...giocate.map((g) => `${oggi}|giocata|${g.id}`), `${oggi}|pronostici`, ...pronosticiDi(delGiorno).map((p) => `${oggi}|pronostico|${p.idPartita}`)] });
  } else {
    // Pronostici aggiunti dopo il messaggio del mattino (giornata scritta prima che esistessero).
    if (Array.isArray(delGiorno.pronostici) && !inviate.has(`${oggi}|pronostici`)) {
      out.push({ chiave: `${oggi}|pronostici`, testo: testoPronostici(delGiorno, oggi) + piede, segna: pronosticiDi(delGiorno).map((p) => `${oggi}|pronostico|${p.idPartita}`) });
    } else {
      // Partite con pronostici aggiunte dopo (per esempio le coppe): un messaggio con le sole nuove.
      const nuovi = pronosticiDi(delGiorno).filter((p) => !inviate.has(`${oggi}|pronostico|${p.idPartita}`));
      if (nuovi.length) {
        out.push({
          chiave: `${oggi}|pronostici|${hash(nuovi.map((p) => p.idPartita).join(','))}`,
          testo: testoPronostici({ ...delGiorno, pronostici: nuovi }, oggi).replace('<b>Pronostici del', '<b>Nuovi pronostici del') + piede,
          segna: nuovi.map((p) => `${oggi}|pronostico|${p.idPartita}`),
        });
      }
    }
    const nuove = prova ? [] : giocate.filter((g) => !annunciate.has(g.id) && g.stato !== 'annullata');
    if (nuove.length) {
      out.push({
        chiave: `${oggi}|nuove|${hash(nuove.map((g) => g.id).join(','))}`,
        testo: [`🌙 <b>${nuove.length === 1 ? 'Nuova giocata' : 'Nuove giocate'} di ${prova ? 'PROVA ' : ''}oggi</b>`, ...nuove.map((g, i) => testoGiocata(g, i + 1))].join('\n\n') + piede,
        segna: nuove.map((g) => `${oggi}|giocata|${g.id}`),
      });
    }
  }

  // 1b. Avvisi dei controlli sui pronostici (idea 3): giocatore chiave non titolare o da verificare, una volta sola.
  for (const p of pronosticiDi(delGiorno)) {
    for (const x of p.pronostici) {
      if (!x || typeof x.avviso !== 'string' || !x.avviso) continue;
      aggiungi(`${oggi}|avviso-pronostico|${p.idPartita}|${x.mercato}|${x.selezione}`,
        `⚠️ <b>Attenzione pronostico</b>: ${SIMBOLO[p.sport] ?? '•'} <b>${html(p.partita)}</b>\nSÌ ${html(x.testo ?? `${x.mercato}: ${x.selezione}`)}: ${html(x.avviso)}${piede}`);
    }
  }

  // 1c. Doppie e triple dei pronostici (idea 4): un messaggio la prima volta, poi solo le nuove.
  const schedine = schedinePronostici(delGiorno);
  const nuoveSchedine = schedine.filter((s) => !inviate.has(`${oggi}|schedina|${s.id}`));
  if (nuoveSchedine.length) {
    const prima = !inviate.has(`${oggi}|schedine-pronostici`);
    out.push({
      chiave: prima ? `${oggi}|schedine-pronostici` : `${oggi}|schedine-pronostici|${hash(nuoveSchedine.map((s) => s.id).join(','))}`,
      testo: testoSchedinePronostici(nuoveSchedine, oggi, { nuove: !prima }) + piede,
      segna: [...(prima ? [] : [`${oggi}|schedine-pronostici`]), ...nuoveSchedine.map((s) => `${oggi}|schedina|${s.id}`)],
    });
  }

  // 2. Cambi di stato (giro serale e controlli prima delle partite), una volta per stato e controllo.
  //    In prova no: con decine di giocate sarebbero decine di messaggi al giorno.
  for (const g of prova ? [] : giocate) {
    const etichetta = STATO_SERALE[g.stato];
    if (!etichetta) continue;
    const motivo = g.motivoStato ? `\n${html(g.motivoStato)}` : '';
    const nuovaQuota = g.stato === 'modificata' ? `\n${rigaQuota(g)}` : '';
    aggiungi(`${oggi}|stato|${g.id}|${g.stato}|${g.oraUltimoControllo ?? ''}`,
      `🔎 ${SIMBOLO[g.sport] ?? '•'} <b>${html(g.partita)}</b>\n${html(g.mercato)} → ${html(g.selezione)}: <b>${etichetta}</b>${motivo}${nuovaQuota}`);
  }

  // 3. Errori del sistema: le righe nuove di erroriGiro, senza quelle solo informative.
  out.push(...messaggioErrori(delGiorno, oggi, inviate, errori));
  return out;
}

// Righe nuove di erroriGiro di una giornata (chiavi `<data>|errore|<hash>`), in un messaggio solo.
function messaggioErrori(giornata, data, inviate, attivi = ERRORI_SU_TELEGRAM) {
  if (!attivi) return [];
  const errori = (Array.isArray(giornata?.erroriGiro) ? giornata.erroriGiro : [])
    .filter((e) => typeof e === 'string' && !INFORMATIVI.some((r) => r.test(e)))
    .filter((e) => !inviate.has(`${data}|errore|${hash(e)}`));
  if (!errori.length) return [];
  return [{
    chiave: `${data}|errori|${hash(errori.join('\n'))}`,
    testo: [`⚠️ <b>${errori.length === 1 ? 'Errore' : 'Errori'} della giornata ${giornoMese(data)}</b>`, ...errori.map((e) => `• ${html(e)}`)].join('\n'),
    segna: errori.map((e) => `${data}|errore|${hash(e)}`),
  }];
}

// Errori scritti nella giornata precedente dopo il suo ultimo invio: i controlli e gli esiti rapidi,
// prima del giro del mattino, scrivono nell'ultima giornata salvata. Ogni riga parte una volta sola
// (stesse chiavi di quando quella giornata era "oggi": le già mandate non si ripetono).
export function messaggiErroriPrecedenti({ giornate, oggi, inviate, errori = ERRORI_SU_TELEGRAM }) {
  const precedente = giornate.filter((x) => typeof x?.data === 'string' && x.data < oggi).sort((a, b) => a.data.localeCompare(b.data)).at(-1);
  return precedente ? messaggioErrori(precedente, precedente.data, inviate, errori) : [];
}

const ESITO = { vinta: '✅ <b>VINTA</b>', persa: '❌ <b>PERSA</b>', rimborsata: '↩️ <b>RIMBORSATA</b>' };
const euro = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2).replace('.', ',')} €`;

// Esiti delle giocate fatte (ultima segnatura con fatta: true), una volta per giocata ed esito.
// `giornate`: [{ data, giocate }] degli ultimi giorni; `segnature`: tutte, anche le annullate dopo.
// `tutteGiornate`: tutte le giornate salvate, per il bankroll (che conta tutto lo storico).
export function messaggiEsiti({ giornate, segnature, inviate, adesso, tutteGiornate = giornate }) {
  const ultima = new Map();
  for (const sg of segnature) {
    const prec = ultima.get(sg.idGiocata);
    if (!prec || Date.parse(sg.ora) >= Date.parse(prec.ora)) ultima.set(sg.idGiocata, sg);
  }
  // Giornate di prova: tutte le loro giocate sono di prova (fuori dal bankroll).
  // Anche coppie e multiple (biglietti) segnate come giocate [utente, 29/10/2026].
  const conBiglietti = (x) => [...giocateConProva(x, valide(x)), ...bigliettiGiornata(x)];
  const tutte = tutteGiornate.flatMap(conBiglietti);
  const out = [];
  for (const x of giornate) {
    for (const g of conBiglietti(x)) {
      const sg = ultima.get(g.id);
      if (!ESITO[g.esito] || !sg?.fatta) continue;
      const chiave = `${x.data}|esito|${g.id}|${g.esito}`;
      if (inviate.has(chiave)) continue;
      const profitto = profittoReale(g, sg);
      const gambaRimborsata = g.esito === 'vinta' && Array.isArray(g.gambe) && g.gambe.some((y) => y.esito === 'rimborsata');
      const titolo = Array.isArray(g.gambe) && g.gambe.length
        ? `<b>${g.biglietto ? html(g.mercato) : g.tipo === 'builder' ? 'Builder' : 'Multipla'} (${g.gambe.length} ${g.biglietto ? 'partite' : 'gambe'})</b>: ${g.gambe.map((y) => html(y.partita)).join(' + ')}`
        : `${SIMBOLO[g.sport] ?? '•'} <b>${html(g.partita)}</b>\n${html(g.mercato)} → ${html(g.selezione)}`;
      out.push({ chiave, giocata: g, testo: [
        `${ESITO[g.esito]} · ${titolo}`,
        `quota ${virgola(sg.quotaReale)} · puntata ${importo(sg.puntataReale)} → <b>${euro(profitto)}</b>${gambaRimborsata ? ' (una gamba rimborsata: l\'importo reale è più basso, controllalo)' : ''}`,
        ...(g.prova === true ? ['🧪 Giocata di PROVA segnata come fatta (PROVA: non conta nel bankroll). Se è un errore annulla la segnatura sul sito.'] : []),
      ].join('\n') });
    }
  }
  if (out.length) {
    // Bankroll dopo questi esiti, con le stesse regole del sito.
    const b = statoBankroll(tutte, segnature, adesso);
    out.at(-1).testo += `\n\nSaldo dal ${giornoMese(CONFIG.inizioConti)}: <b>${euro(b.saldo)}</b> · settimana ${euro(b.risultatoSettimana)}`;
  }
  return out;
}

// Esiti provvisori di cartellini e angoli (dagli esiti rapidi, numeri di ESPN): un messaggio per giocata
// fatta, una volta per gamba; niente se la giocata ha già l'esito definitivo (lo scrive il mattino).
export function messaggiProvvisori({ giornate, segnature, inviate }) {
  const ultima = new Map();
  for (const sg of segnature) {
    const prec = ultima.get(sg.idGiocata);
    if (!prec || Date.parse(sg.ora) >= Date.parse(prec.ora)) ultima.set(sg.idGiocata, sg);
  }
  const out = [];
  for (const x of giornate) {
    for (const g of valide(x)) {
      if (g.esito != null || !ultima.get(g.id)?.fatta) continue;
      const multipla = Array.isArray(g.gambe) && g.gambe.length > 0;
      const gambe = (multipla ? g.gambe : [g])
        .map((y, i) => ({ y, chiave: `${x.data}|provvisorio|${g.id}|${i}` }))
        .filter(({ y, chiave }) => y && y.esito == null && y.esitoProvvisorio?.esito && !inviate.has(chiave));
      if (!gambe.length) continue;
      const righe = gambe.map(({ y }) => {
        const p = y.esitoProvvisorio;
        const tipo = String(y.mercato).split(' ')[0];
        return `${multipla ? '   ' : ''}${SIMBOLO[y.sport ?? g.sport] ?? '•'} <b>${html(y.partita)}</b>, ${html(tipo)} ${html(String(y.selezione).replace('.', ','))}: probabilmente <b>${html(p.esito)}</b> (${html(p.dettaglio ?? '')})`;
      });
      const testa = multipla ? [`⏳ <b>${g.tipo === 'builder' ? 'Builder' : 'Multipla'} (${g.gambe.length} gambe)</b>, esito provvisorio:`] : [];
      out.push({
        chiave: gambe[0].chiave,
        segna: gambe.slice(1).map((z) => z.chiave),
        testo: [...testa, ...righe.map((r) => (multipla ? r : `⏳ ${r}`)), 'Esito definitivo con il giro del mattino.'].join('\n'),
      });
    }
  }
  return out;
}

// Giornate degli ultimi `giorni` giorni (file data/giornate/AAAA-MM-GG.json), le illeggibili saltate.
function leggiGiornateRecenti(dirData, oggi, giorni) {
  const limite = new Date(Date.parse(`${oggi}T00:00:00Z`) - giorni * 86400000).toISOString().slice(0, 10);
  const cartella = join(dirData, 'giornate');
  if (!existsSync(cartella)) return [];
  const out = [];
  for (const nome of readdirSync(cartella).sort()) {
    const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(nome);
    if (!m || m[1] < limite || m[1] > oggi) continue;
    try {
      const j = JSON.parse(readFileSync(join(cartella, nome), 'utf8'));
      out.push({ ...j, data: j.data ?? m[1] });
    } catch {
      // Un file rotto lo segnala già la pagina.
    }
  }
  return out;
}

// Stato: chiavi già mandate degli ultimi 14 giorni.
export function leggiInviate(file) {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    return new Set(Array.isArray(j?.inviate) ? j.inviate : []);
  } catch {
    return new Set();
  }
}

export function scriviInviate(file, inviate, oggi) {
  const limite = new Date(Date.parse(`${oggi}T00:00:00Z`) - GIORNI_STATO * 86400000).toISOString().slice(0, 10);
  const tenute = [...inviate].filter((k) => k.slice(0, 10) >= limite).sort();
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ inviate: tenute }, null, 2)}\n`);
}

// Telegram rifiuta i messaggi sopra i 4096 caratteri: si divide sulle righe, sotto i 4000;
// una riga da sola troppo lunga si tronca.
const MAX_TESTO = 4000;

// Tag HTML rimasti aperti in un pezzo di testo, da richiudere ("</b></i>").
function chiusure(testo) {
  const aperti = [];
  for (const [, chiuso, nome] of testo.matchAll(/<(\/?)([a-z-]+)[^>]*>/gi)) {
    if (!chiuso) aperti.push(nome.toLowerCase());
    else if (aperti.at(-1) === nome.toLowerCase()) aperti.pop();
  }
  return aperti.reverse().map((n) => `</${n}>`).join('');
}

// Riga troncata sotto `max` caratteri: mai dentro un'entità (&amp;) o un tag (<b>), tag aperti richiusi.
function tronca(riga, max) {
  let limite = max - 2;
  for (;;) {
    let pezzo = riga.slice(0, limite);
    const amp = pezzo.lastIndexOf('&');
    if (amp > pezzo.lastIndexOf(';')) pezzo = pezzo.slice(0, amp);
    const tag = pezzo.lastIndexOf('<');
    if (tag > pezzo.lastIndexOf('>')) pezzo = pezzo.slice(0, tag);
    const coda = `…${chiusure(pezzo)}`;
    if (pezzo.length + coda.length < max || limite <= 1) return pezzo + coda;
    limite -= coda.length;
  }
}

export function dividi(testo, max = MAX_TESTO) {
  const pezzi = [];
  let corrente = null;
  for (let riga of String(testo).split('\n')) {
    if (riga.length >= max) riga = tronca(riga, max);
    if (corrente !== null && corrente.length + 1 + riga.length < max) { corrente += `\n${riga}`; continue; }
    if (corrente !== null) pezzi.push(corrente);
    corrente = riga;
  }
  if (corrente !== null) pezzi.push(corrente);
  return pezzi;
}

const ATTESA_MAX_MS = 60000;
const aspetta = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function mandaPezzo(testo, { token, chat, fetch, attendi }) {
  for (let tentativo = 1; ; tentativo++) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: testo, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(30000),
    });
    if (r.ok) return;
    // Mai il token nei messaggi d'errore.
    const corpo = (await r.text()).replaceAll(token, '***');
    if (/chat not found/i.test(corpo)) {
      throw new Error('Telegram risponde «chat not found»: il secret TELEGRAM_CHAT_ID è sbagliato. Mettici il numero della tua chat con il bot (dopo avergli scritto almeno un messaggio)');
    }
    if (r.status === 429 && tentativo === 1) {
      let secondi = 1;
      try { secondi = Number(JSON.parse(corpo)?.parameters?.retry_after) || 1; } catch { /* corpo non JSON */ }
      await attendi(Math.min(secondi * 1000, ATTESA_MAX_MS));
      continue;
    }
    throw new Error(`Telegram: HTTP ${r.status} ${corpo.slice(0, 200)}`);
  }
}

// Manda un messaggio (diviso se è lungo). Su HTTP 429 aspetta retry_after (al massimo 60 s) e riprova una volta.
export async function manda(testo, { token, chat, fetch = globalThis.fetch, attendi = aspetta }) {
  for (const pezzo of dividi(testo)) await mandaPezzo(pezzo, { token, chat, fetch, attendi });
}

export async function eseguiNotifiche({ dirData, adesso, token, chat, run, sito, fetch, attendi, errori = ERRORI_SU_TELEGRAM, essenziale = SOLO_ESSENZIALE }) {
  const oggi = giornataDi(adesso);
  const fileStato = join(dirData, 'stato', 'telegram.json');
  const inviate = leggiInviate(fileStato);
  const fileGiornata = join(dirData, 'giornate', `${oggi}.json`);
  let giornata = null;
  if (existsSync(fileGiornata)) {
    try {
      giornata = JSON.parse(readFileSync(fileGiornata, 'utf8'));
    } catch (e) {
      giornata = { data: oggi, giocate: [], erroriGiro: [`File della giornata illeggibile: ${e.message}`] };
    }
  }
  let lista = messaggi({ giornata, oggi, adesso, inviate, run, sito, errori });
  // Esiti: le giornate fino a 13 giorni fa (le chiavi restano 14 giorni, niente doppioni).
  const segnature = leggiJson(dirData, 'segnature', []).map((x) => x.contenuto).filter((x) => x && !erroreSegnatura(x));
  const recenti = leggiGiornateRecenti(dirData, oggi, GIORNI_STATO - 1);
  lista.push(...messaggiErroriPrecedenti({ giornate: recenti, oggi, inviate, errori }));
  lista.push(...messaggiProvvisori({ giornate: recenti, segnature, inviate }));
  lista.push(...messaggiMultipleBonus({ giornate: recenti, inviate }));
  lista.push(...messaggiSchedinePronostici({ giornate: recenti, inviate }));
  lista.push(...messaggiPronostici({ giornate: recenti, inviate, oggi }));
  lista.push(...messaggioStorico({ giornate: leggiGiornateRecenti(dirData, oggi, 100000), inviate, oggi, adesso, essenziale }));
  lista.push(...messaggiEsiti({
    giornate: recenti, tutteGiornate: leggiGiornateRecenti(dirData, oggi, 100000), segnature, inviate, adesso,
  }));
  // Solo l'essenziale: i messaggi taciuti si segnano come mandati senza mandarli.
  let tacere = [];
  if (essenziale) ({ manda: lista, tacere } = soloEssenziale(lista, { giornata, oggi, sito }));
  for (const m of tacere) {
    inviate.add(m.chiave);
    for (const k of m.segna ?? []) inviate.add(k);
  }
  let mandati = 0;
  const falliti = [];
  try {
    for (const m of lista) {
      // Un messaggio che non parte non blocca gli altri; "chat not found" invece ferma tutto.
      try {
        await manda(m.testo, { token, chat, fetch, attendi });
      } catch (e) {
        if (/chat not found/i.test(e.message)) throw e;
        falliti.push(`${m.chiave}: ${e.message}`);
        continue;
      }
      inviate.add(m.chiave);
      for (const k of m.segna ?? []) inviate.add(k);
      mandati++;
    }
  } finally {
    // Anche se un invio fallisce, quelli già partiti restano segnati: niente doppioni la volta dopo.
    if (mandati || tacere.length) scriviInviate(fileStato, inviate, oggi);
  }
  // Alla fine l'errore, perché l'Action risulti fallita: i non mandati si riprovano la volta dopo.
  if (falliti.length) throw new Error(`${falliti.length} messaggi su ${lista.length} non mandati (${mandati} mandati): ${falliti.join(' | ')}`);
  return { mandati, chiavi: lista.map((m) => m.chiave) };
}

// Action da segnalare (dal workflow_run): fallita o annullata; null altrimenti.
export function runDaSegnalare(env) {
  const conclusione = env.RUN_CONCLUSIONE;
  if (conclusione !== 'failure' && conclusione !== 'cancelled') return null;
  return { id: env.RUN_ID, nome: env.RUN_NOME, url: env.RUN_URL, conclusione };
}

// Riga di log sulla chat dei secrets: solo se Telegram la trova, mai il nome né il numero.
export const rigaChat = (risposta) => `Chat di TELEGRAM_CHAT_ID: ${risposta?.ok ? 'ok' : 'non ok'}`;

async function principale() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.log('Notifiche Telegram spente: mancano i secrets TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    return;
  }
  const run = runDaSegnalare(process.env);
  const [proprietario, nome] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  const sito = proprietario && nome ? `https://${proprietario.toLowerCase()}.github.io/${nome}/` : null;
  try {
    const c = await (await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chat)}`, { signal: AbortSignal.timeout(30000) })).json();
    console.log(rigaChat(c));
  } catch {
    console.log('Chat di TELEGRAM_CHAT_ID: non verificata');
  }
  const r = await eseguiNotifiche({ dirData: 'data', adesso: new Date(), token, chat, run, sito });
  console.log(`Notifiche Telegram: ${r.mandati} messaggi${r.chiavi.length ? ` (${r.chiavi.join(', ')})` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Notifiche Telegram fallite: ${e?.message ?? e}`);
    process.exit(1);
  });
}
