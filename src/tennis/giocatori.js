// Nomi dei giocatori: tennis-data ("Sinner J.") contro The Odds API ("Jannik Sinner").

// Eccezioni di abbinamento: nome di The Odds API -> nome di tennis-data.
// Vuoto all'inizio: da riempire al collaudo con i casi che l'abbinamento automatico non risolve.
export const ALIAS = {};

const pulisci = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[-'’`.]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function normalizzaGiocatore(nome) {
  const originale = String(nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const parole = originale.split(/\s+/).filter(Boolean);
  // Formato tennis-data: ultimo token di 1-2 iniziali con il punto ("J.", "J.L.").
  const ultimo = parole[parole.length - 1] ?? '';
  if (parole.length >= 2 && /^(?:[A-Za-z]\.){1,2}$/.test(ultimo)) {
    return { cognome: pulisci(parole.slice(0, -1).join(' ')), iniziale: ultimo[0].toLowerCase() };
  }
  if (parole.length >= 2) {
    return { cognome: pulisci(parole.slice(1).join(' ')), iniziale: pulisci(parole[0])[0] ?? null };
  }
  return { cognome: pulisci(originale), iniziale: null };
}

export function abbinaGiocatore(nomeOdds, nomiTennisData) {
  const elenco = nomiTennisData ?? [];
  const alias = Object.hasOwn(ALIAS, nomeOdds) ? ALIAS[nomeOdds] : null;
  if (alias && elenco.includes(alias)) return alias;
  const n = normalizzaGiocatore(nomeOdds);
  const candidati = elenco.filter((c) => {
    const k = normalizzaGiocatore(c);
    return k.cognome === n.cognome && k.iniziale === n.iniziale;
  });
  if (candidati.length) return candidati.length === 1 ? candidati[0] : null;

  // Nessun abbinamento esatto: cognomi composti scritti in modo diverso ("Juan Martin del Potro"
  // contro "Del Potro J.M."). Si prova ogni parte contigua propria delle parole dopo la prima,
  // con la stessa iniziale; vale solo se il candidato è unico.
  const parole = pulisci(nomeOdds).split(' ').slice(1);
  if (parole.length < 2 || !n.iniziale) return null;
  const parti = new Set();
  for (let i = 0; i < parole.length; i++) {
    for (let j = i + 1; j <= parole.length; j++) {
      if (j - i < parole.length) parti.add(parole.slice(i, j).join(' '));
    }
  }
  const simili = elenco.filter((c) => {
    const k = normalizzaGiocatore(c);
    return k.iniziale === n.iniziale && parti.has(k.cognome);
  });
  return new Set(simili).size === 1 ? simili[0] : null;
}
