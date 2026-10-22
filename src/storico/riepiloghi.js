const cent = (n) => Math.round(n * 100) / 100;

// Puntata, quota ed esito considerati per una riga nella vista indicata,
// oppure null se la riga non entra nel riepilogo.
function valuta({ giocata, segnatura }, vista) {
  if (!giocata.esito) return null;
  if (vista === 'fatte') {
    // Giocata segnata fatta: i soldi sono reali anche se poi annullata. Le giocate di prova mai.
    if (!segnatura || segnatura.fatta !== true || giocata.prova === true) return null;
    return { puntata: segnatura.puntataReale, quota: segnatura.quotaReale };
  }
  if (giocata.stato === 'annullata') return null;
  return { puntata: giocata.puntata.euro, quota: giocata.quota ?? giocata.quotaMinima };
}

function profitto(esito, puntata, quota) {
  if (esito === 'vinta') return puntata * (quota - 1);
  if (esito === 'persa') return -puntata;
  return 0; // rimborsata
}

export function riepiloga(righe, chiave, vista) {
  const gruppi = new Map();
  for (const riga of righe) {
    const v = valuta(riga, vista);
    if (!v) continue;
    // Il bookmaker sta nella segnatura; quelle precedenti al campo non lo hanno.
    const gruppo = chiave === 'bookmaker' ? (riga.segnatura?.bookmaker ?? 'non indicato') : riga.giocata[chiave];
    const g = gruppi.get(gruppo) ?? { gruppo, n: 0, vinte: 0, profitto: 0, puntate: 0 };
    g.n += 1;
    if (riga.giocata.esito === 'vinta') g.vinte += 1;
    g.profitto += profitto(riga.giocata.esito, v.puntata, v.quota);
    g.puntate += v.puntata;
    gruppi.set(gruppo, g);
  }
  return [...gruppi.values()].map((g) => ({
    gruppo: g.gruppo,
    n: g.n,
    vinte: g.vinte,
    profitto: cent(g.profitto),
    roi: g.puntate > 0 ? Math.round((g.profitto / g.puntate) * 10000) / 10000 : 0,
  }));
}
