// Pagina storico. Modulo ES usato dal browser e dai test in Node:
// le funzioni pure sono esportate, il codice DOM parte solo se esiste `document`.
import { el, euro, percento, segno, NOME_TIPO, avvisiDati, testoAggiornamento, schedaSicura, nomeBookmaker } from './app.js';

const VISTE = [
  { valore: 'fatte', etichetta: 'Giocate fatte' },
  { valore: 'proposte', etichetta: 'Tutte le proposte' },
];

// Righe chiuse (con esito) che entrano nella vista, con puntata, quota e profitto.
// Stessa regola di src/storico/riepiloghi.js.
export function righeVista(righe, vista) {
  const uscita = [];
  for (const { giocata, segnatura } of righe) {
    if (!giocata.esito) continue;
    let puntata;
    let quota;
    if (vista === 'fatte') {
      // Le giocate di prova non sono mai "fatte", anche se segnate per errore.
      if (!segnatura || segnatura.fatta !== true || giocata.prova === true) continue;
      puntata = segnatura.puntataReale;
      // Coppie e multiple: bonus bet365 e partite rimborsate nel moltiplicatore.
      quota = segnatura.quotaReale * (giocata.moltiplicatore ?? 1);
    } else {
      if (giocata.stato === 'annullata' || giocata.biglietto === true) continue;
      puntata = giocata.puntata.euro;
      quota = giocata.quota ?? giocata.quotaMinima;
    }
    const profitto = giocata.esito === 'vinta' ? puntata * (quota - 1) : giocata.esito === 'persa' ? -puntata : 0;
    uscita.push({ giocata, puntata, quota, profitto: Math.round(profitto * 100) / 100 });
  }
  return uscita;
}

const ETICHETTE_ESITO = { vinta: 'Vinta', persa: 'Persa', rimborsata: 'Rimborsata' };
export const etichettaEsito = (esito) => ETICHETTE_ESITO[esito] ?? String(esito);

export function etichettaGruppo(chiave, gruppo) {
  if (chiave === 'quotaDaVerificare') return gruppo ? 'Quota da verificare' : 'Quota verificata';
  if (chiave === 'tipo') return NOME_TIPO[gruppo] ?? String(gruppo);
  return String(gruppo);
}

// ---- Formattazione ----
const fmtData = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const fmtGiorno = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtEuroInt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dataBreve = (aaaammgg) => fmtData.format(new Date(`${aaaammgg}T00:00:00Z`));
const euroConSegno = (n) => `${segno(n)}${euro(n)}`;
const classeProfitto = (n) => (n > 0 ? 'positivo' : n < 0 ? 'negativo' : '');

// ---- Grafico (SVG con createElementNS, colori da variabili CSS) ----
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, testo) {
  const nodo = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) nodo.setAttribute(k, String(v));
  if (testo !== undefined) nodo.textContent = testo;
  return nodo;
}

function renderGrafico(andamento) {
  if (!andamento.length) return el('p', { class: 'vuoto' }, 'Ancora nessuna giocata chiusa');
  const L = 640, A = 240, sx = 70, dx = 16, sup = 16, inf = 32;
  const valori = andamento.map((p) => p.saldo);
  let min = Math.min(...valori);
  let max = Math.max(...valori);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => (andamento.length === 1 ? (sx + L - dx) / 2 : sx + ((L - sx - dx) * i) / (andamento.length - 1));
  const y = (v) => sup + (A - sup - inf) * (1 - (v - min) / (max - min));

  const radice = svg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': 'Andamento del saldo nel tempo' });
  radice.append(
    svg('line', { class: 'asse', x1: sx, y1: sup, x2: sx, y2: A - inf }),
    svg('line', { class: 'asse', x1: sx, y1: A - inf, x2: L - dx, y2: A - inf }),
    svg('text', { x: sx - 6, y: y(max) + 4, 'text-anchor': 'end' }, fmtEuroInt.format(max)),
    svg('text', { x: sx - 6, y: y(min) + 4, 'text-anchor': 'end' }, fmtEuroInt.format(min)),
    svg('text', { x: x(0), y: A - 10, 'text-anchor': andamento.length === 1 ? 'middle' : 'start' }, dataBreve(andamento[0].data)),
  );
  if (andamento.length > 1) {
    radice.append(
      svg('text', { x: x(andamento.length - 1), y: A - 10, 'text-anchor': 'end' }, dataBreve(andamento.at(-1).data)),
      svg('polyline', { class: 'linea', points: andamento.map((p, i) => `${x(i)},${y(p.saldo)}`).join(' ') }),
    );
  }
  for (const [i, p] of andamento.entries()) {
    const punto = svg('circle', { class: 'punto', cx: x(i), cy: y(p.saldo), r: 3 });
    punto.append(svg('title', {}, `${dataBreve(p.data)}: ${segno(p.saldo)}${euro(p.saldo)}`));
    radice.append(punto);
  }
  return radice;
}

// ---- Tabelle e elenco ----
const TABELLE = [
  { chiave: 'sport', titolo: 'Per sport' },
  { chiave: 'tipo', titolo: 'Per tipo di giocata' },
  { chiave: 'mercato', titolo: 'Per mercato' },
  { chiave: 'quotaDaVerificare', titolo: 'Quota verificata o da verificare' },
  // Il bookmaker si conosce solo per le giocate fatte davvero.
  { chiave: 'bookmaker', titolo: 'Per bookmaker', soloFatte: true },
];

function renderTabella({ chiave, titolo }, righe) {
  const corpo = righe.length
    ? righe.map((r) => el('tr', {},
      el('td', {}, etichettaGruppo(chiave, r.gruppo)),
      el('td', {}, r.n),
      el('td', {}, percento(r.n ? r.vinte / r.n : 0)),
      el('td', { class: classeProfitto(r.profitto) }, euroConSegno(r.profitto)),
      el('td', {}, `${segno(r.roi)}${percento(r.roi)}`),
    ))
    : [el('tr', {}, el('td', { colspan: '5', class: 'vuoto' }, 'Nessuna giocata chiusa'))];
  return el('section', { class: 'tabella-blocco' },
    el('h2', {}, titolo),
    el('table', {},
      el('thead', {}, el('tr', {}, ['Gruppo', 'Giocate', 'Vinte', 'Profitto', 'ROI'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, corpo),
    ),
  );
}

// Mercati delle partite di multiple bonus e coppie (dati.storicoMercati): uno per riga, dal più giocato.
const fmtQuotaMedia = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function renderMercati(righe) {
  const lista = Array.isArray(righe) ? righe.filter((r) => r && r.mercato) : [];
  const chiuse = lista.filter((r) => r.partite > 0);
  const corpo = chiuse.length
    ? chiuse.map((r) => el('tr', {},
      el('td', {}, r.mercato),
      el('td', {}, r.partite),
      el('td', {}, `${percento(r.percentuale)} (${percento(r.probMercato)})`),
      el('td', {}, fmtQuotaMedia.format(r.quotaMedia)),
      el('td', { class: classeProfitto(r.profitto) }, euroConSegno(r.profitto)),
    ))
    : [el('tr', {}, el('td', { colspan: '5', class: 'vuoto' }, 'Nessuna partita chiusa'))];
  return [
    el('h2', {}, 'Mercati di multiple e coppie'),
    el('p', { class: 'meta' }, 'Ogni partita delle multiple bonus e delle coppie a quota 2, una volta per giorno. Vinte: quante sono uscite (tra parentesi quante ne dava il mercato). Guadagno: giocando ogni partita da sola con 1 €.'),
    el('table', { class: 'tabella-mercati' },
      el('thead', {}, el('tr', {}, ['Mercato', 'Partite', 'Vinte (mercato)', 'Quota media', 'Guadagno'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, corpo),
    ),
  ];
}

// Coppie a quota 2 nei quattro modi (dati.bilancioCoppie) e modello contro mercato (dati.confrontoModello).
const MODI_COPPIE = [
  ['margine', 'Per margine (quelle che vedi)'],
  ['probabilita', 'Per probabilità del mercato'],
  ['modello', 'Solo il nostro modello'],
  ['confermate', 'Confermate da modello e mercato'],
  ['tutte', 'Per margine, con tutte le partite'],
  ['probabilitaTutte', 'Per probabilità del mercato, con tutte le partite'],
  ['modelloTutte', 'Solo il nostro modello, con tutte le partite'],
  ['confermateTutte', 'Confermate da modello e mercato, con tutte le partite'],
];
const fmtErrore = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
// Bookmaker migliore (dati.bookmakerMigliore): quanto si guadagna in quota scegliendo dove giocare la coppia.
export function renderBookmaker(b) {
  if (!b?.coppie) return [];
  return [
    el('h2', {}, 'Dove conviene giocare'),
    el('p', { class: 'meta' }, `Su ${b.coppie} coppie, il bookmaker migliore pagava in media il ${percento(b.guadagnoMedio)} in più della quota della coppia (la mediana dei bookmaker). Più spesso il migliore è stato:`),
    el('table', { class: 'tabella-modi' },
      el('thead', {}, el('tr', {}, ['Bookmaker', 'Volte migliore'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, b.migliori.map((x) => el('tr', {}, el('td', {}, nomeBookmaker(x.bookmaker)), el('td', {}, x.volte))))),
  ];
}

// Quota di chiusura (dati.chiusura): il mercato si è mosso verso le nostre partite?
export function renderChiusura(righe) {
  const lista = Array.isArray(righe) ? righe.filter((r) => r && r.partite > 0) : [];
  return [
    el('h2', {}, 'Quota di chiusura'),
    el('p', { class: 'meta' }, lista.length
      ? 'Le partite di coppie e multiple confrontate con Pinnacle subito prima dell\'inizio. "A favore": quante volte la probabilità è salita dopo la nostra scelta. "Valore": quanto rendeva la quota del mattino con la probabilità di chiusura; sopra zero vuol dire che abbiamo preso un prezzo migliore del mercato finale, ed è il segnale più rapido che un metodo funziona.'
      : 'Ancora nessuna partita con la quota di chiusura: si registra dal 30/10, nell\'ultimo controllo prima dell\'inizio.'),
    lista.length ? el('table', { class: 'tabella-modi' },
      el('thead', {}, el('tr', {}, ['Partite', 'Quante', 'A favore', 'Valore'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, lista.map((r) => el('tr', {},
        el('td', {}, r.gruppo === 'tutte' ? 'Tutte' : r.gruppo),
        el('td', {}, r.partite),
        el('td', {}, `${percento(r.percentualeAFavore)} (${segno(r.movimento)}${Math.round(r.movimento * 1000) / 10} punti)`),
        el('td', { class: classeProfitto(r.valore) }, `${segno(r.valore)}${percento(r.valore)}`),
      )))) : null,
  ];
}

export function renderConfronto(bilancio, confronto) {
  const righeModi = MODI_COPPIE.map(([k, nome]) => {
    const b = bilancio?.[k];
    return el('tr', {},
      el('td', {}, nome),
      el('td', {}, b?.chiuse ?? 0),
      el('td', {}, b?.chiuse ? percento(b.vinte / b.chiuse) : '–'),
      el('td', { class: classeProfitto(b?.profitto ?? 0) }, b?.chiuse ? euroConSegno(b.profitto) : '–'),
    );
  });
  // Due versioni (migliori 20 del giorno e tutte le partite); i dati vecchi avevano una sola versione.
  const versioni = confronto?.migliori || confronto?.tutte
    ? [['Le migliori 20 partite del giorno', confronto.migliori], ['Tutte le partite', confronto.tutte]]
    : [[null, confronto]];
  return [
    el('h2', {}, 'Coppie a quota 2: i modi a confronto'),
    el('p', { class: 'meta' }, 'I quattro modi con le migliori 20 partite del giorno e gli stessi quattro con tutte le partite adatte. Vedi solo le prime; le altre servono a capire quale funziona meglio. Guadagno con 1 € a coppia.'),
    el('table', { class: 'tabella-modi' },
      el('thead', {}, el('tr', {}, ['Modo', 'Coppie', 'Vinte', 'Guadagno'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, righeModi)),
    el('h2', {}, 'Il nostro modello contro il mercato'),
    ...versioni.flatMap(([titolo, c]) => renderModello(titolo, c ?? { partite: 0, gruppi: [] })),
  ];
}

function renderModello(titolo, c) {
  const righeGruppi = (c.gruppi ?? []).map((g) => el('tr', {},
    el('td', {}, g.nome),
    el('td', {}, g.partite),
    el('td', {}, g.partite ? `${percento(g.percentuale)} (${percento(g.probMercato)})` : '–'),
    el('td', { class: classeProfitto(g.profitto) }, g.partite ? euroConSegno(g.profitto) : '–'),
  ));
  return [
    titolo ? el('h3', { class: 'sottotitolo' }, titolo) : null,
    el('p', { class: 'meta' }, c.partite
      ? `Sulle stesse ${c.partite} partite, errore medio del modello ${fmtErrore.format(c.erroreModello)}${c.conCorrezione ? `, del modello corretto da solo sui risultati ${fmtErrore.format(c.erroreCorretto)} (${c.conCorrezione} partite corrette)` : ''}, del mercato ${fmtErrore.format(c.erroreMercato)}: vince chi ha il numero più basso. Sotto, le partite divise per quanto il modello si scosta dal mercato (tra parentesi quante ne dava il mercato); guadagno giocando ogni partita da sola con 1 €.`
      : 'Ancora nessuna partita chiusa con la probabilità del modello.'),
    c.partite ? el('table', { class: 'tabella-modi' },
      el('thead', {}, el('tr', {}, ['Partite', 'Quante', 'Vinte (mercato)', 'Guadagno'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, righeGruppi)) : null,
  ];
}

function renderRiga({ giocata: g, profitto }) {
  return el('article', { class: 'riga-storico' },
    el('div', {},
      el('p', {}, el('strong', {}, g.partita)),
      el('p', { class: 'meta' }, `${fmtGiorno.format(new Date(g.inizio))} · ${NOME_TIPO[g.tipo] ?? g.tipo} · ${g.mercato}: ${g.selezione}`),
    ),
    el('div', {},
      el('p', {}, etichettaEsito(g.esito)),
      el('p', { class: classeProfitto(profitto) }, el('strong', {}, euroConSegno(profitto))),
    ),
  );
}

function avvia(dati) {
  let vista = 'fatte';
  document.getElementById('bankroll-attuale').textContent = `Saldo${dati.inizioConti ? ` dal ${dataBreve(dati.inizioConti)}` : ''}: ${segno(dati.bankroll.saldo ?? 0)}${euro(dati.bankroll.saldo ?? 0)}`;
  document.getElementById('aggiornamento').textContent = testoAggiornamento(dati.generatoAlle) ?? 'Ora di aggiornamento dei dati sconosciuta';
  document.getElementById('avvisi').replaceChildren(...avvisiDati(dati).map((t) => el('p', { class: 'avviso', role: 'status' }, t)));
  document.getElementById('mercati')?.replaceChildren(...renderMercati(dati.storicoMercati));
  document.getElementById('confronto')?.replaceChildren(...[...renderChiusura(dati.chiusura), ...renderBookmaker(dati.bookmakerMigliore), ...renderConfronto(dati.bilancioCoppie, dati.confrontoModello)].filter(Boolean));
  document.getElementById('andamento').replaceChildren(renderGrafico(dati.storico.andamento ?? []));

  const interruttore = document.getElementById('vista');
  const riepiloghi = document.getElementById('riepiloghi');
  const elenco = document.getElementById('elenco');
  const disegna = () => {
    const r = dati.storico.riepiloghi[vista];
    riepiloghi.replaceChildren(...TABELLE.filter((t) => !t.soloFatte || vista === 'fatte').map((t) => renderTabella(t, r[t.chiave] ?? [])));
    const righe = righeVista(dati.storico.righe ?? [], vista);
    elenco.replaceChildren(...(righe.length ? righe.map((r) => schedaSicura(r.giocata?.id, () => renderRiga(r))) : [el('p', { class: 'vuoto' }, 'Ancora nessuna giocata chiusa')]));
    for (const b of interruttore.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
  };
  interruttore.replaceChildren(...VISTE.map((v) => {
    const b = el('button', { type: 'button', 'data-vista': v.valore }, v.etichetta);
    b.addEventListener('click', () => { vista = v.valore; disegna(); });
    return b;
  }));
  disegna();
}

if (typeof document !== 'undefined') {
  fetch('dati.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(avvia)
    .catch((e) => {
      document.getElementById('avvisi').replaceChildren(el('p', { class: 'avviso', role: 'alert' }, `Impossibile caricare i dati: ${e.message}`));
    });
}
