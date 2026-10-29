import { BOOKMAKER, costruisciSegnatura, salvaSegnatura, cancellaSegnatura, leggiImpostazioni, salvaImpostazioni, cancellaToken } from './giocata.js';

// Pagina del giorno. Modulo ES usato sia dal browser sia dai test in Node:
// le funzioni pure sono esportate, il codice DOM parte solo se esiste `document`.

// Stesso valore di CONFIG.tettoGiornaliero in src/config.js (la pagina non può importare src/).
const TETTO_GIORNALIERO = 0.12;

const FUSO = 'Europe/Rome';
const SPORT = [
  { valore: null, etichetta: 'Tutti' },
  { valore: 'calcio', etichetta: 'Calcio' },
  { valore: 'tennis', etichetta: 'Tennis' },
  { valore: 'nba', etichetta: 'NBA' },
  { valore: 'basket', etichetta: 'Basket' },
  { valore: 'pallavolo', etichetta: 'Pallavolo' },
];

const STATI = {
  in_attesa: { testo: 'In attesa formazioni', classe: 'stato-attesa' },
  confermata: { testo: 'Confermata', classe: 'stato-confermata' },
  modificata: { testo: 'Modificata', classe: 'stato-modificata' },
  annullata: { testo: 'Annullata', classe: 'stato-annullata' },
  in_revisione: { testo: 'In revisione', classe: 'stato-revisione' },
};

export function filtraPerSport(giocate, sport) {
  return sport ? giocate.filter((g) => g.sport === sport || g.gambe?.some((l) => l.sport === sport)) : giocate;
}

export function etichettaStato(giocata) {
  const base = STATI[giocata.stato] ?? { testo: String(giocata.stato ?? ''), classe: 'stato-attesa' };
  // Il motivo (es. "controllo serale non eseguito") si mostra con qualunque stato.
  const motivo = giocata.motivoStato;
  return { testo: motivo ? `${base.testo}: ${motivo}` : base.testo, classe: base.classe };
}

// Oltre questa età i dati della pagina si considerano forse non aggiornati
// (la build gira ogni ora).
const ORE_DATI_VECCHI = 2;

// Avvisi sulla qualità dei dati, comuni a pagina del giorno e storico.
export function avvisiDati(dati, adesso = new Date()) {
  const avvisi = [];
  const generato = Date.parse(dati.generatoAlle);
  if (!Number.isFinite(generato) || adesso.getTime() - generato > ORE_DATI_VECCHI * 3600000) {
    avvisi.push('I dati potrebbero non essere aggiornati');
  }
  for (const e of dati.erroriDati ?? []) avvisi.push(`Dati non validi in ${e.file}: ${e.errore}`);
  return avvisi;
}

export function testoAvvisi(dati, adesso = new Date()) {
  const avvisi = avvisiDati(dati, adesso);
  const oggi = dati.oggi ?? {};
  const giornata = oggi.giornata ?? null;
  const b = dati.bankroll ?? {};

  if (!oggi.disponibile) avvisi.push('Analisi di oggi non disponibile');
  else if ((giornata?.giocate ?? []).length === 0) avvisi.push('Oggi nessuna giocata con value');
  if (giornata?.esempio) avvisi.push('Dati di esempio, non sono giocate reali');
  if (giornata?.prova) avvisi.push('Modalità prova: queste giocate non vanno giocate, servono a creare il database per tarare il sistema');
  // Giocate di prova segnate come fatte per errore: non contano nel bankroll.
  for (const a of b.avvisi ?? []) avvisi.push(a);
  const n = (b.daSegnare ?? []).length;
  if (n > 0) avvisi.push(n === 1 ? 'Hai 1 giocata da segnare' : `Hai ${n} giocate da segnare`);
  const nonCoperte = giornata?.competizioniNonCoperte ?? [];
  if (nonCoperte.length > 0) avvisi.push(`Competizioni non coperte oggi: ${nonCoperte.join(', ')}`);
  for (const e of giornata?.erroriGiro ?? []) avvisi.push(`Errore nel giro del mattino: ${e}`);
  return avvisi;
}

// Oggi in caso C: qualche giocata con puntata fissa da 1 € (tetto giornaliero tolto per oggi).
export const giornataPiena = (giornata) => (Array.isArray(giornata?.giocate) ? giornata.giocate : [])
  .some((g) => g?.puntata?.fissa != null && typeof g.puntata.fissa === 'object');

// Segnatura più recente (per `ora`) di ogni giocata.
export function ultimeSegnature(segnature) {
  const ultime = new Map();
  for (const s of segnature) {
    const prec = ultime.get(s.idGiocata);
    if (!prec || Date.parse(s.ora) >= Date.parse(prec.ora)) ultime.set(s.idGiocata, s);
  }
  return ultime;
}

// ---- Formattazione ----
const fmtOra = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtNum = (cifre) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: cifre, maximumFractionDigits: cifre });
export const fmtQuota = fmtNum(2);
const fmtPerc0 = fmtNum(0);
const fmtPerc1 = fmtNum(1);

export const ora = (iso) => (iso ? fmtOra.format(new Date(iso)) : '');
// "Dati aggiornati alle HH:MM" (ora di Roma), null se l'istante non è leggibile.
export function testoAggiornamento(generatoAlle) {
  const t = Date.parse(generatoAlle);
  return Number.isFinite(t) ? `Dati aggiornati alle ${fmtOra.format(new Date(t))}` : null;
}
export const euro = (n) => fmtEuro.format(n);
// `frazione` 0.56 -> "56%"
export const percento = (frazione) => `${fmtPerc0.format(frazione * 100)}%`;
export const segno = (n) => (n > 0 ? '+' : '');

// ---- DOM ----
export function el(tag, attrs = {}, ...figli) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') nodo.className = v;
    else nodo.setAttribute(k, v);
  }
  for (const f of figli.flat()) {
    if (f === null || f === undefined || f === false) continue;
    nodo.append(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
  }
  return nodo;
}

// Puntata ridotta in proporzione dal tetto giornaliero (caso B):
// "ridotta da 5,00 € per il tetto giornaliero". null se non ridotta o dato non leggibile.
const LIMITE_RIDOTTA = { 'tetto giornaliero': 'per il tetto giornaliero' };
export function testoRidotta(puntata) {
  const r = puntata?.ridotta;
  if (!r || !Number.isFinite(r.da) || !LIMITE_RIDOTTA[r.motivo]) return null;
  return `ridotta da ${euro(r.da)} ${LIMITE_RIDOTTA[r.motivo]}`;
}

// Puntata fissa da 1 € a giornata piena (caso C): null se non fissa o dato non leggibile.
export function testoFissa(puntata) {
  if (!puntata?.fissa || typeof puntata.fissa !== 'object' || !Number.isFinite(puntata.euro)) return null;
  return `puntata fissa ${euro(puntata.euro)} (giornata piena: tetto giornaliero tolto per oggi)`;
}

export const NOME_TIPO = { singola: 'Singola', speciale: 'Singola speciale', multipla: 'Multipla', builder: 'Bet builder' };

function rigaQuota(g) {
  if (g.quotaDaVerificare || g.quota === null || g.quota === undefined) {
    return el('span', { class: 'da-verificare' }, 'quota da verificare su bet365');
  }
  const fonte = [g.fonteQuota, g.oraQuota ? `alle ${ora(g.oraQuota)}` : null].filter(Boolean).join(' ');
  return [el('strong', {}, `quota ${fmtQuota.format(g.quota)}`), fonte ? ` (${fonte})` : ''];
}

const MSG_SALVATA = 'Salvata – aggiornamento della pagina in 1-2 minuti';

// "2,10" o "2.10" -> 2.1; testo vuoto o non numerico -> NaN
const leggiNumero = (testo) => (String(testo).trim() === '' ? NaN : Number(String(testo).trim().replace(',', '.')));

const virgola = (n) => String(n).replace('.', ',');

// Testo dei campi quota/puntata/bookmaker: quanto scritto dall'utente (`digitati`) se c'è,
// altrimenti i valori consigliati. Così un errore non rimette i consigliati.
export function valoriCampi(giocata, digitati) {
  return {
    quota: digitati?.quota ?? (giocata.quota ? virgola(giocata.quota) : ''),
    // Giocata di prova: nessun importo proposto.
    puntata: digitati?.puntata ?? (giocata.prova === true ? '' : giocata.puntata.euro.toFixed(2).replace('.', ',')),
    bookmaker: digitati?.bookmaker ?? BOOKMAKER[0],
  };
}

function testoSegnatura(s) {
  return s.fatta
    ? `Segnata come giocata: quota ${fmtQuota.format(s.quotaReale)}, puntata ${euro(s.puntataReale)}${s.bookmaker ? ` su ${s.bookmaker}` : ''}`
    : 'Segnata come saltata';
}

// Controlli di segnatura della scheda. `corrente` e il messaggio sono locali alla scheda:
// dopo un salvataggio riuscito mostrano il nuovo stato fino alla ripubblicazione della pagina.
function renderSegnatura(giocata, iniziale) {
  const contenitore = el('div', { class: 'segnatura' });
  let corrente = iniziale;
  let messaggio = null; // { testo, errore }
  let occupato = false;
  let digitati = null; // { quota, puntata, bookmaker } scritti dall'utente; azzerati solo dopo un salvataggio riuscito

  const esegui = async (azione, riuscita) => {
    occupato = true;
    messaggio = null;
    disegna();
    try {
      await azione();
      corrente = riuscita();
      digitati = null;
      messaggio = { testo: MSG_SALVATA, errore: false };
    } catch (e) {
      messaggio = { testo: e.message, errore: true };
    }
    occupato = false;
    disegna();
  };

  function disegna() {
    const figli = [];
    if (corrente) {
      const annulla = el('button', { type: 'button', class: 'secondario', disabled: occupato ? '' : null }, 'Annulla segnatura');
      annulla.addEventListener('click', () => esegui(() => cancellaSegnatura(giocata.id, leggiImpostazioni()), () => null));
      figli.push(el('p', { class: 'segnata' }, testoSegnatura(corrente)), annulla);
    } else {
      const id = `q-${giocata.id}`.replace(/[^A-Za-z0-9_-]/g, '_');
      const valori = valoriCampi(giocata, digitati);
      const quota = el('input', { id: `${id}-quota`, type: 'text', inputmode: 'decimal', size: '5', value: valori.quota });
      const puntata = el('input', { id: `${id}-puntata`, type: 'text', inputmode: 'decimal', size: '5', value: valori.puntata });
      const bookmaker = el('select', { id: `${id}-bookmaker` }, ...BOOKMAKER.map((b) => el('option', { value: b, selected: b === valori.bookmaker ? '' : null }, b)));
      const ricorda = () => { digitati = { quota: quota.value, puntata: puntata.value, bookmaker: bookmaker.value }; };
      quota.addEventListener('input', ricorda);
      puntata.addEventListener('input', ricorda);
      bookmaker.addEventListener('change', ricorda);
      const bottone = (testo, classe, fatta) => {
        const b = el('button', { type: 'button', class: classe, disabled: occupato ? '' : null }, testo);
        b.addEventListener('click', () => {
          ricorda();
          let segnatura;
          try {
            segnatura = costruisciSegnatura({ idGiocata: giocata.id, fatta, quotaReale: leggiNumero(quota.value), puntataReale: leggiNumero(puntata.value), bookmaker: bookmaker.value }, new Date());
          } catch (e) {
            messaggio = { testo: e.message, errore: true };
            disegna();
            return;
          }
          esegui(() => salvaSegnatura(segnatura, leggiImpostazioni()), () => segnatura);
        });
        return b;
      };
      figli.push(
        el('div', { class: 'campi' },
          el('label', { for: `${id}-quota` }, 'Quota reale', quota),
          el('label', { for: `${id}-puntata` }, 'Puntata reale (€)', puntata),
          el('label', { for: `${id}-bookmaker` }, 'Bookmaker', bookmaker),
        ),
        el('p', { class: 'nota' }, 'Betfair: scrivi la quota al netto della commissione.'),
        el('div', { class: 'azioni' }, bottone('Giocata', 'primario', true), bottone('Saltata', 'secondario', false)),
      );
    }
    if (messaggio) figli.push(el('p', { class: messaggio.errore ? 'esito-errore' : 'esito-ok', role: messaggio.errore ? 'alert' : 'status' }, messaggio.testo));
    contenitore.replaceChildren(...figli);
  }
  disegna();
  return contenitore;
}

function renderPiedeScheda(giocata, segnatura) {
  const stato = etichettaStato(giocata);
  return el('div', { class: 'scheda-piede' },
    el('span', { class: `stato ${stato.classe}` }, stato.testo),
    giocata.oraUltimoControllo ? el('span', { class: 'controllo' }, `ultimo controllo ${ora(giocata.oraUltimoControllo)}`) : null,
    renderSegnatura(giocata, segnatura),
  );
}

function renderGamba(g) {
  return el('li', {}, `${g.partita} (${ora(g.inizio)}): ${g.mercato}, ${g.selezione}`,
    g.quota ? ` @ ${fmtQuota.format(g.quota)}` : '');
}

export function renderScheda(g, segnatura) {
  const dettagli = el('details', {},
    el('summary', {}, 'Ragionamento'),
    el('ul', {}, (g.ragionamento ?? []).map((r) => el('li', {}, r))),
    g.gambe?.length ? [el('p', { class: 'gambe-titolo' }, 'Gambe'), el('ul', {}, g.gambe.map(renderGamba))] : null,
  );
  const prova = g.prova === true;
  return el('article', { class: `scheda${g.stato === 'annullata' ? ' annullata' : ''}`, 'data-sport': g.sport },
    prova ? el('p', { class: 'prova' }, 'PROVA – non giocare') : null,
    el('h3', {}, g.partita),
    el('p', { class: 'meta' }, `${ora(g.inizio)} · ${g.competizione}`),
    el('p', {}, el('strong', {}, NOME_TIPO[g.tipo] ?? g.tipo), ` · ${g.mercato}: ${g.selezione}`),
    el('p', {}, rigaQuota(g)),
    el('p', {}, `Quota minima da accettare: ${fmtQuota.format(g.quotaMinima)}`),
    el('p', {}, `Probabilità stimata ${percento(g.prob)} · value ${segno(g.value)}${percento(g.value)}`),
    // Giocata di prova: nessun importo da puntare.
    prova ? el('p', {}, el('strong', {}, 'Puntata: nessuna'), ' (giocata di prova, serve solo a tarare il sistema)')
      : el('p', {}, el('strong', {}, `Puntata ${euro(g.puntata.euro)}`), ` (${fmtPerc1.format(g.puntata.percentuale)}% del bankroll)`),
    !prova && testoRidotta(g.puntata) ? el('p', { class: 'ridotta' }, testoRidotta(g.puntata)) : null,
    !prova && testoFissa(g.puntata) ? el('p', { class: 'fissa' }, testoFissa(g.puntata)) : null,
    renderPiedeScheda(g, segnatura),
    dettagli,
  );
}

// Spiegazione del ✅ e dei pronostici collegati (stessa regola di CONFIG.pronostici e stesso testo di Telegram).
export const SPIEGAZIONE_PRONOSTICI = "✅ = giocabile: anche Pinnacle (senza margine) lo dà almeno all'80% e la quota di uno dei tuoi bookmaker è almeno il 5% sopra la minima. Senza ✅ è solo da tenere d'occhio. I pronostici della stessa partita sono collegati, non indipendenti: mai più di uno della stessa partita in una multipla.";
const numero = (v) => typeof v === 'number' && Number.isFinite(v);

// Esito della partita quando i suoi pronostici sono chiusi: tutti giusti o qualcuno sbagliato.
export function esitoPartitaPronostici(p) {
  const esiti = (p?.pronostici ?? []).map((x) => x?.esito ?? null);
  if (esiti.includes('persa')) return 'qualcuno sbagliato';
  if (!esiti.length || esiti.includes(null)) return null;
  return 'tutti giusti';
}

// Percentuale del pronostico con il numero di partite della sua fascia (correzione B1).
export const testoProbPronostico = (x) => `${percento(x.prob)}${numero(x.n) ? ` su ${String(x.n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} partite` : ''}`;

// Bookmaker dell'utente (stessi nomi di src/calcio/odss.js).
const NOMI_BOOKMAKER = { bet365: 'bet365', snai: 'Snai', goldbet: 'Goldbet', sportium: 'Sportium', daznbet: 'DAZN Bet' };
const nomeBookmaker = (k) => NOMI_BOOKMAKER[k] ?? String(k ?? '');

// Idea 1: "quota migliore 1,31 su Sportium (minima 1,24), quota delle 07:40" e ✅ o "solo da tenere d'occhio".
const quotaMigliorePronostico = (x) => ` · quota migliore ${fmtQuota.format(x.quotaMigliore)} su ${nomeBookmaker(x.bookmakerMigliore)} (minima ${fmtQuota.format(x.quotaMinima)})`
  + `${x.oraQuota ? `, quota delle ${ora(x.oraQuota)}` : ''}${x.giocabile === true ? ' ✅' : " · solo da tenere d'occhio"}`;

// Pronostici sì/no di una partita: frase, percentuale, quota minima ed eventuale quota di oggi.
// Senza quota o senza la probabilità di Pinnacle: "solo da tenere d'occhio".
const rigaPronostico = (x) => el('li', {},
  el('strong', {}, `SÌ ${x.testo ?? `${x.mercato}: ${x.selezione}`}`),
  ` · ${testoProbPronostico(x)}`,
  ...(numero(x.quotaMigliore) ? [quotaMigliorePronostico(x)] : x.fonteQuota === 'media' && numero(x.quota)
    ? [` · quota media ${fmtQuota.format(x.quota)}, non dei tuoi bookmaker (minima ${fmtQuota.format(x.quotaMinima)}) · solo da tenere d'occhio`] : [
    ` · quota minima ${fmtQuota.format(x.quotaMinima)}`,
    x.quota ? ` · oggi ${fmtQuota.format(x.quota)}${x.giocabile === true ? ' ✅' : ''}` : '',
    numero(x.quota) && numero(x.probMercato) ? '' : " · solo da tenere d'occhio: controlla la quota su bet365",
  ]),
  x.esito ? ` · ${x.esito === 'vinta' ? 'giusto' : x.esito === 'persa' ? 'sbagliato' : x.esito}` : '',
  // Idea 3: avviso dei controlli prima della partita (giocatore chiave non titolare o da verificare).
  x.avviso ? el('span', { class: 'avviso-pronostico' }, ` · ⚠️ Attenzione: ${x.avviso}`) : '');

// Idea 2: il migliore della partita in evidenza, gli altri (collegati) in un <details>.
// Dati vecchi senza `migliore`: tutti in lista, come prima.
export function renderPronostici(p) {
  const esitoPartita = esitoPartitaPronostici(p);
  const migliore = p.pronostici.find((x) => x?.migliore === true) ?? null;
  const altri = migliore ? p.pronostici.filter((x) => x !== migliore) : [];
  return el('article', { class: 'scheda', 'data-sport': p.sport },
    el('h3', {}, p.partita),
    el('p', { class: 'meta' }, `${ora(p.inizio)} · ${p.competizione}`),
    migliore ? el('ul', { class: 'pronostico-migliore' }, rigaPronostico(migliore)) : el('ul', {}, p.pronostici.map(rigaPronostico)),
    altri.length ? el('details', {}, el('summary', {}, `altri pronostici (collegati): ${altri.length}`), el('ul', {}, altri.map(rigaPronostico))) : null,
    esitoPartita ? el('p', {}, el('strong', {}, `Partita: ${esitoPartita}`)) : null,
  );
}

// Bilancio dei pronostici di una giornata passata (dati.bilancioPronostici), anche per partita.
export function testoBilancioPronostici(b) {
  if (!b || !numero(b.chiusi) || b.chiusi <= 0) return null;
  const giorno = `${b.data.slice(8, 10)}/${b.data.slice(5, 7)}`;
  const chiuse = b.partite.tutteGiuste + b.partite.conSbagliati;
  return `Pronostici del ${giorno}: ${b.giusti} giusti su ${b.chiusi} (${percento(b.giusti / b.chiusi)})${b.aperti ? `, ${b.aperti} senza esito` : ''}; `
    + `per partita: ${b.partite.tutteGiuste} su ${chiuse} tutti giusti, ${b.partite.conSbagliati} con qualcuno sbagliato. `
    + 'I pronostici della stessa partita sono collegati: quando una partita va storta sbagliano spesso insieme.';
}

const ESITO_MB = { vinta: 'vinta', persa: 'persa', rimborsata: 'rimborsata' };

// Multipla bonus bet365 (prova): gambe, quota con l'incremento ed esito.
export function renderMultiplaBonus(mb) {
  const esito = mb.esito ? `${ESITO_MB[mb.esito] ?? mb.esito}${mb.esito === 'vinta' ? `: 1 € → ${fmtQuota.format(mb.ritorno)} €` : ''}` : 'in attesa';
  return el('article', { class: 'scheda' },
    el('h3', {}, `${mb.nome} (PROVA, non giocare)`),
    el('p', {}, `Quota ${fmtQuota.format(mb.quota)} · incremento ${percento(mb.incremento)} · con bonus ${fmtQuota.format(mb.quotaConBonus)}`),
    el('p', { class: 'meta' }, 'Quote medie dei bookmaker: su bet365 controlla che ogni partita sia almeno 1,25.'),
    el('p', {}, el('strong', {}, `Esito: ${esito}`)),
    el('details', {}, el('summary', {}, `Partite (${mb.gambe.length})`),
      el('ul', {}, mb.gambe.map((g) => el('li', {}, `${g.partita} (${ora(g.inizio)}): ${g.mercato}, ${g.selezione} @ ${fmtQuota.format(g.quota)}${g.esito ? ` · ${g.esito}` : ''}`)))),
  );
}

// Coppie a quota 2 (prova): due partite della multipla bonus, quota totale ed esito.
export function renderCoppia(c, n) {
  const esito = c.esito ? `${ESITO_MB[c.esito] ?? c.esito}${c.esito === 'vinta' ? `: 1 € → ${fmtQuota.format(c.ritorno)} €` : ''}` : 'in attesa';
  return el('article', { class: 'scheda' },
    el('p', { class: 'prova' }, 'PROVA'),
    el('h3', {}, `Coppia ${n}: quota ${fmtQuota.format(c.quota)}`),
    el('p', {}, `Il mercato (Pinnacle) la dà al ${percento(c.prob)}`),
    el('ul', {}, c.gambe.map((g) => el('li', {}, `${g.partita} (${ora(g.inizio)}): ${g.mercato}, ${g.selezione} @ ${fmtQuota.format(g.quota)}${numero(g.quotaBet365) ? ` (bet365 ${fmtQuota.format(g.quotaBet365)})` : ''}${g.esito ? ` · ${g.esito}` : ''}`))),
    el('p', {}, el('strong', {}, `Esito: ${esito}`)),
  );
}

// Bilancio dall'inizio dei due modi (margine, mostrato; probabilità, per confronto).
export function testoBilancioCoppie(b) {
  const riga = (x) => (x?.chiuse ? `${x.vinte} su ${x.chiuse} vinte (${percento(x.vinte / x.chiuse)}), ${segno(x.profitto)}${euro(x.profitto)}` : 'nessuna chiusa');
  if (!b || (!b.margine?.chiuse && !b.probabilita?.chiuse)) return null;
  return `Dall'inizio, 1 € a coppia. Per margine (queste): ${riga(b.margine)}. Per probabilità (confronto): ${riga(b.probabilita)}.`;
}

// Doppie e triple di pronostici (idea 4): quota totale, probabilità combinata prudente, gambe ed esito.
// Non sono giocate: non entrano nel bankroll.
const NOME_SCHEDINA = { doppia: 'Doppia', tripla: 'Tripla' };
export function renderSchedinaPronostici(s) {
  const esito = s.esito ? `${ESITO_MB[s.esito] ?? s.esito}${s.esito === 'vinta' && numero(s.quotaFinale) ? `: 1 € → ${fmtQuota.format(s.quotaFinale)} €` : ''}` : 'in attesa';
  return el('article', { class: 'scheda' },
    s.prova === true ? el('p', { class: 'prova' }, s.etichetta ?? 'PROVA – non giocare') : null,
    el('h3', {}, `${NOME_SCHEDINA[s.tipo] ?? 'Schedina'} (${s.gambe.length} pronostici)`),
    el('p', {}, el('strong', {}, `Quota ${fmtQuota.format(s.quota)}`), ` · probabilità prudente ${percento(s.probCombinata)}`),
    el('ul', {}, s.gambe.map((g) => el('li', {}, `${g.partita} (${ora(g.inizio)}): SÌ ${g.testo ?? `${g.mercato}: ${g.selezione}`} @ ${fmtQuota.format(g.quota)}${g.bookmaker ? ` su ${nomeBookmaker(g.bookmaker)}` : ''}`,
      g.fonteQuota === 'media' ? el('span', { class: 'da-verificare' }, ' (quota media, non dei tuoi bookmaker: da verificare)')
        : g.quotaDaVerificare ? el('span', { class: 'da-verificare' }, ' (quota minima, da verificare su bet365)') : '',
      g.esito ? ` · ${g.esito === 'vinta' ? 'giusto' : g.esito === 'persa' ? 'sbagliato' : g.esito}` : ''))),
    el('p', {}, el('strong', {}, `Esito: ${esito}`)),
    el('p', { class: 'meta' }, 'Fuori dal bankroll: non conta finché non la giochi davvero.'),
  );
}

// Una giocata con dati rotti non deve bloccare le altre: al posto della scheda
// compare un piccolo riquadro d'errore con il suo id.
export function schedaSicura(id, crea) {
  try {
    return crea();
  } catch {
    return el('article', { class: 'scheda-errore', role: 'alert' }, `Scheda non leggibile: ${id ?? '(senza id)'}`);
  }
}

// Voci del riquadro in alto: [etichetta, valore]. Lo stop settimanale non c'è più [utente, 21/10/2026].
export function vociRiquadro(b, giornata) {
  const tetto = `${euro(b.inGiocoOggi)} / ${euro(TETTO_GIORNALIERO * b.bankroll)}`;
  return [
    ['Bankroll', euro(b.bankroll)],
    ['Risultato settimana', `${segno(b.risultatoSettimana)}${euro(b.risultatoSettimana)}`],
    ['In gioco oggi / tetto', giornataPiena(giornata) ? `${tetto} · tetto tolto oggi (puntate fisse da 1 €)` : tetto],
  ];
}

function renderRiquadro(b, giornata) {
  const voce = ([etichetta, valore]) => el('div', { class: 'voce' }, el('span', { class: 'etichetta' }, etichetta), el('span', { class: 'valore' }, valore));
  return el('section', { class: 'riquadro', 'aria-label': 'Situazione bankroll' }, ...vociRiquadro(b, giornata).map(voce));
}

function avviaImpostazioni() {
  const form = document.getElementById('impostazioni');
  if (!form) return;
  const campoRepo = document.getElementById('imp-repo');
  const campoToken = document.getElementById('imp-token');
  const stato = document.getElementById('imp-stato');
  const segnaposto = () => {
    campoToken.placeholder = leggiImpostazioni().token ? 'Codice già salvato (lascia vuoto per non cambiarlo)' : '';
  };
  campoRepo.value = leggiImpostazioni().repo;
  segnaposto();
  document.getElementById('imp-cancella-token')?.addEventListener('click', () => {
    const ok = cancellaToken();
    campoToken.value = '';
    segnaposto();
    stato.textContent = ok ? 'Codice cancellato da questo dispositivo' : 'Impossibile cancellare il codice su questo browser';
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const repo = campoRepo.value.trim();
    const token = campoToken.value.trim() || leggiImpostazioni().token;
    const ok = salvaImpostazioni({ repo, token });
    if (ok) campoRepo.value = leggiImpostazioni().repo;
    campoToken.value = '';
    segnaposto();
    stato.textContent = ok ? 'Impostazioni salvate su questo dispositivo' : 'Impossibile salvare le impostazioni su questo browser';
  });
}

function avvia(dati) {
  let sportScelto = null;
  const filtri = document.getElementById('filtri');
  const riquadro = document.getElementById('riquadro');
  const avvisi = document.getElementById('avvisi');
  const lista = document.getElementById('giocate');

  riquadro.replaceChildren(renderRiquadro(dati.bankroll, dati.oggi?.giornata));
  avvisi.replaceChildren(...testoAvvisi(dati).map((t) => el('p', { class: 'avviso', role: 'status' }, t)));
  const sottotitolo = document.getElementById('data-giornata');
  if (sottotitolo) sottotitolo.textContent = dati.oggi.data;
  const aggiornamento = document.getElementById('aggiornamento');
  if (aggiornamento) aggiornamento.textContent = testoAggiornamento(dati.generatoAlle) ?? 'Ora di aggiornamento dei dati sconosciuta';

  const ultime = ultimeSegnature(dati.segnature ?? []);
  const tutte = dati.oggi.giornata?.giocate ?? [];
  const disegna = () => {
    const viste = filtraPerSport(tutte, sportScelto).slice().sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio));
    lista.replaceChildren(...(viste.length ? viste.map((g) => schedaSicura(g?.id, () => renderScheda(g, ultime.get(g?.id) ?? null))) : [el('p', { class: 'vuoto' }, 'Nessuna giocata da mostrare.')]));
    for (const bt of filtri.querySelectorAll('button')) bt.setAttribute('aria-pressed', String(bt.dataset.sport === String(sportScelto)));
  };
  filtri.replaceChildren(...SPORT.map((s) => {
    const bt = el('button', { type: 'button', 'data-sport': String(s.valore) }, s.etichetta);
    bt.addEventListener('click', () => { sportScelto = s.valore; disegna(); });
    return bt;
  }));
  disegna();

  const pron = document.getElementById('pronostici');
  const lp = Array.isArray(dati.oggi.giornata?.pronostici) ? dati.oggi.giornata.pronostici : [];
  const bilancio = testoBilancioPronostici(dati.bilancioPronostici);
  if (pron) {
    pron.replaceChildren(
      ...(bilancio ? [el('p', { class: 'meta' }, bilancio)] : []),
      ...(lp.length ? [el('h2', {}, 'Pronostici di oggi'), el('p', { class: 'meta' }, SPIEGAZIONE_PRONOSTICI), ...lp.map((x) => schedaSicura(x?.idPartita, () => renderPronostici(x)))] : []),
    );
  }
  const sch = document.getElementById('schedine-pronostici');
  const ls = Array.isArray(dati.oggi.giornata?.schedinePronostici) ? dati.oggi.giornata.schedinePronostici : [];
  if (sch) sch.replaceChildren(...(ls.length ? [el('h2', {}, 'Doppie e triple'), el('p', { class: 'meta' }, 'Dai pronostici migliori di partite diverse, quota totale fra 1,50 e 2,00. Senza quota si usa la quota minima: controllala su bet365.'), ...ls.map((x) => schedaSicura(x?.id, () => renderSchedinaPronostici(x)))] : []));
  const cq = document.getElementById('coppie-quota2');
  const lc = Array.isArray(dati.oggi.giornata?.coppieQuota2?.margine) ? dati.oggi.giornata.coppieQuota2.margine : [];
  const bilCoppie = testoBilancioCoppie(dati.bilancioCoppie);
  if (cq) {
    cq.replaceChildren(...(lc.length || bilCoppie ? [
      el('h2', {}, 'Coppie a quota 2'),
      el('p', { class: 'meta' }, 'Due partite della multipla bonus, quota totale fra 1,90 e 2,15, ogni partita in una coppia sola. Prima le coppie pagate meglio rispetto al giusto (margine).'),
      ...(bilCoppie ? [el('p', { class: 'meta' }, bilCoppie)] : []),
      ...lc.map((x, i) => schedaSicura(x?.id, () => renderCoppia(x, i + 1))),
    ] : []));
  }
  // Multiple con le partite più probabili in alto; le altre (per margine) nella sezione chiusa.
  const tutteMb = Array.isArray(dati.oggi.giornata?.multipleBonus) ? dati.oggi.giornata.multipleBonus : [];
  const perProb = tutteMb.filter((x) => x?.criterio === 'probabilita');
  const mp = document.getElementById('multiple-probabili');
  if (mp) mp.replaceChildren(...(perProb.length ? [el('h2', {}, 'Multiple con le partite più probabili'), ...perProb.map((x) => schedaSicura(x?.id, () => renderMultiplaBonus(x)))] : []));
  if (cq && !lc.length && !perProb.length) cq.append(el('p', { class: 'vuoto' }, 'Oggi nessuna coppia a quota 2 e nessuna multipla con le partite più probabili.'));
  const bonus = document.getElementById('multiple-bonus');
  const mb = tutteMb.filter((x) => x?.criterio !== 'probabilita');
  if (bonus) bonus.replaceChildren(...(mb.length ? [el('h2', {}, 'Multiple bonus bet365'), ...mb.map((x) => schedaSicura(x?.id, () => renderMultiplaBonus(x)))] : []));
}

if (typeof document !== 'undefined' && document.getElementById('giocate')) {
  avviaImpostazioni();
  fetch('dati.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(avvia)
    .catch((e) => {
      document.getElementById('avvisi').replaceChildren(el('p', { class: 'avviso', role: 'alert' }, `Impossibile caricare i dati: ${e.message}`));
    });
}
