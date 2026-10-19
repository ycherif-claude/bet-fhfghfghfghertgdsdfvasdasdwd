import { costruisciSegnatura, salvaSegnatura, cancellaSegnatura, leggiImpostazioni, salvaImpostazioni, cancellaToken } from './giocata.js';

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
  const conMotivo = (giocata.stato === 'annullata' || giocata.stato === 'modificata') && giocata.motivoStato;
  return { testo: conMotivo ? `${base.testo}: ${giocata.motivoStato}` : base.testo, classe: base.classe };
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
  if (b.stopRaggiunto) avvisi.push('Stop settimanale raggiunto: nessuna nuova giocata fino a lunedì');
  const n = (b.daSegnare ?? []).length;
  if (n > 0) avvisi.push(n === 1 ? 'Hai 1 giocata da segnare' : `Hai ${n} giocate da segnare`);
  const nonCoperte = giornata?.competizioniNonCoperte ?? [];
  if (nonCoperte.length > 0) avvisi.push(`Competizioni non coperte oggi: ${nonCoperte.join(', ')}`);
  for (const e of giornata?.erroriGiro ?? []) avvisi.push(`Errore nel giro del mattino: ${e}`);
  return avvisi;
}

// Oltre lo stop la distanza è 0 (l'avviso di stop spiega il resto).
export const distanzaDaMostrare = (b) => Math.max(0, b.distanzaStop ?? 0);

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

// Testo dei campi quota/puntata: quanto scritto dall'utente (`digitati`) se c'è,
// altrimenti i valori consigliati. Così un errore non rimette i consigliati.
export function valoriCampi(giocata, digitati) {
  return {
    quota: digitati?.quota ?? (giocata.quota ? virgola(giocata.quota) : ''),
    puntata: digitati?.puntata ?? virgola(giocata.puntata.euro),
  };
}

function testoSegnatura(s) {
  return s.fatta
    ? `Segnata come giocata: quota ${fmtQuota.format(s.quotaReale)}, puntata ${euro(s.puntataReale)}`
    : 'Segnata come saltata';
}

// Controlli di segnatura della scheda. `corrente` e il messaggio sono locali alla scheda:
// dopo un salvataggio riuscito mostrano il nuovo stato fino alla ripubblicazione della pagina.
function renderSegnatura(giocata, iniziale) {
  const contenitore = el('div', { class: 'segnatura' });
  let corrente = iniziale;
  let messaggio = null; // { testo, errore }
  let occupato = false;
  let digitati = null; // { quota, puntata } scritti dall'utente; azzerati solo dopo un salvataggio riuscito

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
      const ricorda = () => { digitati = { quota: quota.value, puntata: puntata.value }; };
      quota.addEventListener('input', ricorda);
      puntata.addEventListener('input', ricorda);
      const bottone = (testo, classe, fatta) => {
        const b = el('button', { type: 'button', class: classe, disabled: occupato ? '' : null }, testo);
        b.addEventListener('click', () => {
          ricorda();
          let segnatura;
          try {
            segnatura = costruisciSegnatura({ idGiocata: giocata.id, fatta, quotaReale: leggiNumero(quota.value), puntataReale: leggiNumero(puntata.value) }, new Date());
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
        ),
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
  return el('article', { class: `scheda${g.stato === 'annullata' ? ' annullata' : ''}`, 'data-sport': g.sport },
    el('h3', {}, g.partita),
    el('p', { class: 'meta' }, `${ora(g.inizio)} · ${g.competizione}`),
    el('p', {}, el('strong', {}, NOME_TIPO[g.tipo] ?? g.tipo), ` · ${g.mercato}: ${g.selezione}`),
    el('p', {}, rigaQuota(g)),
    el('p', {}, `Quota minima da accettare: ${fmtQuota.format(g.quotaMinima)}`),
    el('p', {}, `Probabilità stimata ${percento(g.prob)} · value ${segno(g.value)}${percento(g.value)}`),
    el('p', {}, el('strong', {}, `Puntata ${euro(g.puntata.euro)}`), ` (${fmtPerc1.format(g.puntata.percentuale)}% del bankroll)`),
    renderPiedeScheda(g, segnatura),
    dettagli,
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

function renderRiquadro(b) {
  const tetto = TETTO_GIORNALIERO * b.bankroll;
  const voce = (etichetta, valore) => el('div', { class: 'voce' }, el('span', { class: 'etichetta' }, etichetta), el('span', { class: 'valore' }, valore));
  return el('section', { class: 'riquadro', 'aria-label': 'Situazione bankroll' },
    voce('Bankroll', euro(b.bankroll)),
    voce('Risultato settimana', `${segno(b.risultatoSettimana)}${euro(b.risultatoSettimana)}`),
    voce('Distanza dallo stop', euro(distanzaDaMostrare(b))),
    voce('In gioco oggi / tetto', `${euro(b.inGiocoOggi)} / ${euro(tetto)}`),
  );
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

  riquadro.replaceChildren(renderRiquadro(dati.bankroll));
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
}

if (typeof document !== 'undefined' && document.getElementById('giocate')) {
  avviaImpostazioni();
  fetch('dati.json')
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(avvia)
    .catch((e) => {
      document.getElementById('avvisi').replaceChildren(el('p', { class: 'avviso', role: 'alert' }, `Impossibile caricare i dati: ${e.message}`));
    });
}
