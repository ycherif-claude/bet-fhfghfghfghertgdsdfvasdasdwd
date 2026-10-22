// Calibrazione monotona dei pronostici [correzione B1, 22/10/2026]: regressione isotonica (pool adjacent
// violators, pesata con il numero di partite) sulle fasce di 5 punti, così una fascia più alta del modello
// non vale mai meno di una più bassa; poi il limite inferiore di Wilson al 95% della fascia, che è il valore
// confrontato con CONFIG.pronostici.probMinima (con poche partite la stima puntuale è troppo ottimista).

// Valori isotonici (non decrescenti) delle fasce [{ n, vera }] già in ordine di fascia.
export function isotonica(fasce) {
  const blocchi = [];
  for (const f of fasce) {
    blocchi.push({ peso: f.n, somma: f.n * f.vera, quante: 1 });
    while (blocchi.length > 1) {
      const b = blocchi[blocchi.length - 1];
      const a = blocchi[blocchi.length - 2];
      if (a.somma / a.peso <= b.somma / b.peso + 1e-12) break;
      blocchi.splice(-2, 2, { peso: a.peso + b.peso, somma: a.somma + b.somma, quante: a.quante + b.quante });
    }
  }
  return blocchi.flatMap((b) => Array(b.quante).fill(b.somma / b.peso));
}

// Limite inferiore dell'intervallo di Wilson (z = 1,96: 95%) per una frequenza p su n partite.
export function wilsonInferiore(p, n, z = 1.96) {
  if (!(n > 0)) return 0;
  const z2 = z * z;
  const centro = p + z2 / (2 * n);
  const margine = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centro - margine) / (1 + z2 / n));
}

// Fasce utilizzabili (almeno minCampioni partite), in ordine, con isotonica e limite di Wilson della fascia
// (n della fascia, stima isotonica).
export function fasceIsotoniche(fasce, minCampioni) {
  const valide = (Array.isArray(fasce) ? fasce : [])
    .filter((f) => f && Number.isFinite(f.da) && Number.isFinite(f.vera) && f.n >= minCampioni)
    .sort((a, b) => a.da - b.da);
  const iso = isotonica(valide);
  return valide.map((f, i) => ({ ...f, isotonica: iso[i], limite: wilsonInferiore(iso[i], f.n) }));
}
