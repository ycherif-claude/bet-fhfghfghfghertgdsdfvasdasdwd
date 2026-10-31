// Coppie a quota 2 e multiple con le partite più probabili come "giocate" da segnare [utente, 29/10/2026]: sono
// quelle che l'utente gioca davvero. Diventano righe dello storico e del saldo solo se segnate come fatte; non si
// chiede mai di segnarle (facoltative) e non entrano nella vista "tutte le proposte".
// `moltiplicatore`: ritorno reale per 1 € diviso la quota (bonus bet365 della multipla, partite rimborsate): la
// vincita di una segnatura è puntata × (quota presa × moltiplicatore − 1).

const unici = (xs) => [...new Set(xs.filter(Boolean))];
const num = (v) => typeof v === 'number' && Number.isFinite(v);

function biglietto(x, { tipo, nome }) {
  const gambe = Array.isArray(x.gambe) ? x.gambe : [];
  const inizi = gambe.map((g) => Date.parse(g.inizio)).filter(Number.isFinite);
  const moltiplicatore = x.esito === 'vinta' && num(x.ritorno) && num(x.quota) && x.quota > 0 ? x.ritorno / x.quota : 1;
  return {
    id: x.id,
    biglietto: true,
    tipo,
    sport: unici(gambe.map((g) => g.sport)).join(' + ') || 'misto',
    competizione: nome,
    partita: gambe.map((g) => g.partita).join(' + '),
    inizio: inizi.length ? new Date(Math.min(...inizi)).toISOString() : null,
    mercato: nome,
    selezione: `${gambe.length} partite`,
    quota: x.quota,
    // Multipla bonus: l'incremento di bet365 si aggiunge alla quota presa.
    ...(num(x.incremento) ? { incremento: x.incremento } : {}),
    esito: x.esito ?? null,
    moltiplicatore,
    gambe,
    stato: 'confermata',
    prova: false,
  };
}

export function bigliettiGiornata(giornata) {
  // Mostrate fino al 30/10: coppie per margine e multiple per probabilità; dal 31/10 le "confermate" [utente].
  const coppie = [...(giornata?.coppieQuota2?.margine ?? []), ...(giornata?.coppieQuota2?.confermate ?? []), ...(giornata?.coppieQuota2?.probabilitaConfermate ?? [])].filter((c) => c?.id)
    .map((c) => biglietto(c, { tipo: 'coppia', nome: 'Coppia a quota 2' }));
  const multiple = (giornata?.multipleBonus ?? []).filter((m) => m?.id && (m.criterio === 'probabilita' || m.criterio === 'probabilitaConfermate'))
    .map((m) => biglietto(m, { tipo: 'multipla', nome: `Multipla da ${m.gambe?.length ?? '?'}` }));
  return [...coppie, ...multiple];
}

// Profitto reale di una segnatura fatta su una giocata o un biglietto chiuso.
export function profittoReale(giocata, sig) {
  if (giocata.esito === 'vinta') return sig.puntataReale * (sig.quotaReale * (giocata.moltiplicatore ?? 1) - 1);
  if (giocata.esito === 'persa') return -sig.puntataReale;
  return 0; // rimborsata
}
