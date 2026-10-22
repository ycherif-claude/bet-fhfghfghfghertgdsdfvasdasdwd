// Regressione logistica con penalità L2 (metodo di Newton), su caratteristiche standardizzate.
const sigmoide = (z) => 1 / (1 + Math.exp(-z));

function risolvi(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || M[c][c] === 0) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => (r[i] === 0 ? 0 : r[n] / r[i]));
}

// X: righe di caratteristiche (senza intercetta), y: 0/1. `l2`: penalità sui coefficienti (non sull'intercetta).
export function addestra(X, y, { l2 = 1, iterazioni = 25 } = {}) {
  const d = X[0].length;
  const medie = Array.from({ length: d }, (_, j) => X.reduce((a, r) => a + r[j], 0) / X.length);
  const dev = medie.map((m, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - m) ** 2, 0) / X.length) || 1);
  const Z = X.map((r) => [1, ...r.map((v, j) => (v - medie[j]) / dev[j])]);
  let w = new Array(d + 1).fill(0);
  for (let it = 0; it < iterazioni; it++) {
    const g = new Array(d + 1).fill(0);
    const H = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      const p = sigmoide(z.reduce((a, v, j) => a + v * w[j], 0));
      const e = p - y[i];
      const s = p * (1 - p);
      for (let j = 0; j <= d; j++) {
        g[j] += e * z[j];
        for (let k = j; k <= d; k++) H[j][k] += s * z[j] * z[k];
      }
    }
    for (let j = 1; j <= d; j++) { g[j] += l2 * w[j]; H[j][j] += l2; }
    for (let j = 0; j <= d; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    const passo = risolvi(H, g);
    w = w.map((v, j) => v - passo[j]);
    if (Math.max(...passo.map(Math.abs)) < 1e-8) break;
  }
  return {
    coefficienti: w,
    prevedi: (r) => sigmoide(w[0] + r.reduce((a, v, j) => a + w[j + 1] * ((v - medie[j]) / dev[j]), 0)),
  };
}
