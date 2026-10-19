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
  return sport ? giocate.filter((g) => g.sport === sport) : giocate;
}

export function etichettaStato(giocata) {
  const base = STATI[giocata.stato] ?? { testo: String(giocata.stato ?? ''), classe: 'stato-attesa' };
  const conMotivo = (giocata.stato === 'annullata' || giocata.stato === 'modificata') && giocata.motivoStato;
  return { testo: conMotivo ? `${base.testo}: ${giocata.motivoStato}` : base.testo, classe: base.classe };
}

export function testoAvvisi(dati) {
  const avvisi = [];
  const oggi = dati.oggi ?? {};
  const giornata = oggi.giornata ?? null;
  const b = dati.bankroll ?? {};

  if (!oggi.disponibile) avvisi.push('Analisi di oggi non disponibile');
  else if ((giornata?.giocate ?? []).length === 0) avvisi.push('Oggi nessuna giocata con value');
  if (giornata?.esempio) avvisi.push('Dati di esempio, non sono giocate reali');
  if (b.stopRaggiunto) avvisi.push('Stop settimanale raggiunto: nessuna nuova giocata fino a lunedì');
  const n = (b.daSegnare ?? []).length;
  if (n > 0) avvisi.push(`Hai ${n} giocate da segnare`);
  const nonCoperte = giornata?.competizioniNonCoperte ?? [];
  if (nonCoperte.length > 0) avvisi.push(`Competizioni non coperte oggi: ${nonCoperte.join(', ')}`);
  for (const e of giornata?.erroriGiro ?? []) avvisi.push(`Errore nel giro del mattino: ${e}`);
  return avvisi;
}

// ---- Formattazione ----
const fmtOra = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtNum = (cifre) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: cifre, maximumFractionDigits: cifre });
const fmtQuota = fmtNum(2);
const fmtPerc0 = fmtNum(0);
const fmtPerc1 = fmtNum(1);

const ora = (iso) => (iso ? fmtOra.format(new Date(iso)) : '');
const euro = (n) => fmtEuro.format(n);
// `frazione` 0.56 -> "56%"
const percento = (frazione) => `${fmtPerc0.format(frazione * 100)}%`;
const segno = (n) => (n > 0 ? '+' : '');

// ---- DOM ----
function el(tag, attrs = {}, ...figli) {
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

const NOME_TIPO = { singola: 'Singola', speciale: 'Singola speciale', multipla: 'Multipla', builder: 'Bet builder' };

function rigaQuota(g) {
  if (g.quotaDaVerificare || g.quota === null || g.quota === undefined) {
    return el('span', { class: 'da-verificare' }, 'quota da verificare su bet365');
  }
  const fonte = [g.fonteQuota, g.oraQuota ? `alle ${ora(g.oraQuota)}` : null].filter(Boolean).join(' ');
  return [el('strong', {}, `quota ${fmtQuota.format(g.quota)}`), fonte ? ` (${fonte})` : ''];
}

// Punto di estensione per il Task 6: qui andrà il pulsante "Giocata".
function renderPiedeScheda(giocata) {
  const stato = etichettaStato(giocata);
  return el('div', { class: 'scheda-piede' },
    el('span', { class: `stato ${stato.classe}` }, stato.testo),
    giocata.oraUltimoControllo ? el('span', { class: 'controllo' }, `ultimo controllo ${ora(giocata.oraUltimoControllo)}`) : null,
  );
}

function renderGamba(g) {
  return el('li', {}, `${g.partita} (${ora(g.inizio)}): ${g.mercato}, ${g.selezione}`,
    g.quota ? ` @ ${fmtQuota.format(g.quota)}` : '');
}

function renderScheda(g) {
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
    renderPiedeScheda(g),
    dettagli,
  );
}

function renderRiquadro(b) {
  const tetto = TETTO_GIORNALIERO * b.bankroll;
  const voce = (etichetta, valore) => el('div', { class: 'voce' }, el('span', { class: 'etichetta' }, etichetta), el('span', { class: 'valore' }, valore));
  return el('section', { class: 'riquadro', 'aria-label': 'Situazione bankroll' },
    voce('Bankroll', euro(b.bankroll)),
    voce('Risultato settimana', `${segno(b.risultatoSettimana)}${euro(b.risultatoSettimana)}`),
    voce('Distanza dallo stop', euro(b.distanzaStop)),
    voce('In gioco oggi / tetto', `${euro(b.inGiocoOggi)} / ${euro(tetto)}`),
  );
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

  const tutte = dati.oggi.giornata?.giocate ?? [];
  const disegna = () => {
    const viste = filtraPerSport(tutte, sportScelto).slice().sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio));
    lista.replaceChildren(...(viste.length ? viste.map(renderScheda) : [el('p', { class: 'vuoto' }, 'Nessuna giocata da mostrare.')]));
    for (const bt of filtri.querySelectorAll('button')) bt.setAttribute('aria-pressed', String(bt.dataset.sport === String(sportScelto)));
  };
  filtri.replaceChildren(...SPORT.map((s) => {
    const bt = el('button', { type: 'button', 'data-sport': String(s.valore) }, s.etichetta);
    bt.addEventListener('click', () => { sportScelto = s.valore; disegna(); });
    return bt;
  }));
  disegna();
}

if (typeof document !== 'undefined') {
  fetch('dati.json')
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(avvia)
    .catch((e) => {
      document.getElementById('avvisi').replaceChildren(el('p', { class: 'avviso', role: 'alert' }, `Impossibile caricare i dati: ${e.message}`));
    });
}
