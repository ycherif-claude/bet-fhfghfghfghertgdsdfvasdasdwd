// Strategia del video "The Soccer Bet That Wins 87% of the Time" (Linemaker Sports) [utente, 07/11/2026], da provare a
// parte nel banco di prova. Over 1.5 quando, con le sole partite giocate prima di oggi:
//   1. entrambe le squadre segnano in media almeno 1 gol a partita in questa stagione (almeno `minPartite` partite);
//   2. negli scontri diretti precedenti l'Over 1.5 è uscito almeno all'80% (almeno `minScontri` scontri);
//   3. entrambe hanno segnato in almeno 4 delle ultime 5 partite.
// Il quarto passo del video (quota migliore di 1,15, cioè l'87% che promette) lo applica il banco di prova.
// Verifica su 6 stagioni di 16 campionati (07/11/2026): 82% di Over 1.5 contro il 79% atteso dal mercato, non l'87%.
export const VIDEO = { minPartite: 5, mediaGol: 1, minScontri: 3, quotaScontri: 0.8, ultime: 5, segnate: 4 };

// Inizio della stagione di `oggi`: dal 1° luglio. Con il campo `stagione` (file extra, campionati ad anno solare) vale
// la stagione più recente.
function stagioneCorrente(righe, oggi) {
  const conStagione = righe.filter((r) => r.stagione);
  if (conStagione.length) {
    const ultima = conStagione.reduce((a, r) => (String(r.stagione) > a ? String(r.stagione) : a), '');
    return righe.filter((r) => String(r.stagione) === ultima);
  }
  const [a, m] = oggi.split('-').map(Number);
  const inizio = `${m >= 7 ? a : a - 1}-07-01`;
  return righe.filter((r) => r.data >= inizio);
}

const golDi = (r, squadra) => (r.casa === squadra ? r.gc : r.gt);

// `righe`: partite del CSV ({ data, casa, trasferta, gc, gt, stagione? }); `casa`, `trasferta`: nomi del CSV.
export function filtriVideo(righe, casa, trasferta, oggi, V = VIDEO) {
  const prima = (Array.isArray(righe) ? righe : []).filter((r) => r && r.data < oggi && Number.isFinite(r.gc) && Number.isFinite(r.gt))
    .sort((x, y) => x.data.localeCompare(y.data));
  const stagione = stagioneCorrente(prima, oggi);
  const squadra = (s) => {
    const sue = stagione.filter((r) => r.casa === s || r.trasferta === s);
    const tutte = prima.filter((r) => r.casa === s || r.trasferta === s);
    const ultime = tutte.slice(-V.ultime);
    return {
      partite: sue.length,
      media: sue.length ? sue.reduce((a, r) => a + golDi(r, s), 0) / sue.length : null,
      segnate: ultime.length === V.ultime ? ultime.filter((r) => golDi(r, s) > 0).length : null,
    };
  };
  const A = squadra(casa);
  const B = squadra(trasferta);
  const scontri = prima.filter((r) => (r.casa === casa && r.trasferta === trasferta) || (r.casa === trasferta && r.trasferta === casa));
  const over = scontri.filter((r) => r.gc + r.gt >= 2).length;
  const mediaGol = A.partite >= V.minPartite && B.partite >= V.minPartite && A.media >= V.mediaGol && B.media >= V.mediaGol;
  const scontriDiretti = scontri.length >= V.minScontri && over / scontri.length >= V.quotaScontri;
  const forma = A.segnate !== null && B.segnate !== null && A.segnate >= V.segnate && B.segnate >= V.segnate;
  return { passa: mediaGol && scontriDiretti && forma, mediaGol, scontriDiretti, forma, scontri: scontri.length };
}
