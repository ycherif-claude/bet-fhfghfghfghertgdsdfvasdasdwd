// Segnatura delle giocate: costruzione, percorso e scrittura sul repository
// tramite l'API GitHub. Modulo ES usato dal browser e dai test in Node.

const API = 'https://api.github.com';
const CHIAVE_REPO = 'bet.repo';
const CHIAVE_TOKEN = 'bet.token';

export function percorsoSegnatura(idGiocata) {
  return `data/segnature/${String(idGiocata).replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
}

export function costruisciSegnatura({ idGiocata, fatta, quotaReale, puntataReale }, adesso) {
  if (fatta) {
    if (!Number.isFinite(quotaReale) || quotaReale <= 1) throw new Error('Quota reale non valida');
    if (!Number.isFinite(puntataReale) || puntataReale <= 0) throw new Error('Puntata reale non valida');
  }
  return {
    idGiocata,
    fatta: Boolean(fatta),
    quotaReale: fatta ? quotaReale : null,
    puntataReale: fatta ? puntataReale : null,
    ora: adesso.toISOString(),
  };
}

function base64Utf8(testo) {
  const byte = new TextEncoder().encode(testo);
  let binario = '';
  for (const b of byte) binario += String.fromCharCode(b);
  return btoa(binario);
}

function impostazioni({ repo, token }) {
  if (!token) throw new Error('Codice segreto non impostato');
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('Repository non impostato (formato utente/nome)');
  return {
    url: (percorso) => `${API}/repos/${repo}/contents/${percorso}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };
}

function erroreHttp(azione, risposta) {
  return new Error(`${azione} non riuscito (HTTP ${risposta.status})`);
}

// sha del file se esiste, altrimenti null (404).
async function leggiSha(url, headers, fetchFn) {
  const r = await fetchFn(url, { method: 'GET', headers });
  if (r.status === 404) return null;
  if (!r.ok) throw erroreHttp('Lettura della segnatura', r);
  return (await r.json()).sha ?? null;
}

export async function salvaSegnatura(segnatura, { repo, token, fetch: fetchFn = globalThis.fetch }) {
  const { url, headers } = impostazioni({ repo, token });
  const indirizzo = url(percorsoSegnatura(segnatura.idGiocata));
  const sha = await leggiSha(indirizzo, headers, fetchFn);
  const corpo = {
    message: `Segnatura ${segnatura.idGiocata}`,
    content: base64Utf8(JSON.stringify(segnatura, null, 2) + '\n'),
  };
  if (sha) corpo.sha = sha;
  const r = await fetchFn(indirizzo, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw erroreHttp('Salvataggio della segnatura', r);
}

export async function cancellaSegnatura(idGiocata, { repo, token, fetch: fetchFn = globalThis.fetch }) {
  const { url, headers } = impostazioni({ repo, token });
  const indirizzo = url(percorsoSegnatura(idGiocata));
  const sha = await leggiSha(indirizzo, headers, fetchFn);
  if (!sha) return; // già assente
  const r = await fetchFn(indirizzo, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Annulla segnatura ${idGiocata}`, sha }),
  });
  if (r.status === 404) return;
  if (!r.ok) throw erroreHttp('Annullamento della segnatura', r);
}

// ---- Impostazioni salvate nel browser (ogni accesso protetto da try/catch) ----
export function leggiImpostazioni() {
  let repo = '';
  let token = '';
  try { repo = globalThis.localStorage?.getItem(CHIAVE_REPO) ?? ''; } catch { /* storage non disponibile */ }
  try { token = globalThis.localStorage?.getItem(CHIAVE_TOKEN) ?? ''; } catch { /* storage non disponibile */ }
  return { repo, token };
}

// Restituisce true se salvato. Un valore vuoto cancella la voce.
export function salvaImpostazioni({ repo, token }) {
  try {
    const s = globalThis.localStorage;
    if (!s) return false;
    if (repo) s.setItem(CHIAVE_REPO, repo); else s.removeItem(CHIAVE_REPO);
    if (token) s.setItem(CHIAVE_TOKEN, token); else s.removeItem(CHIAVE_TOKEN);
    return true;
  } catch {
    return false;
  }
}

// Toglie il codice segreto da questo browser. Restituisce true se riuscito.
export function cancellaToken() {
  try {
    const s = globalThis.localStorage;
    if (!s) return false;
    s.removeItem(CHIAVE_TOKEN);
    return true;
  } catch {
    return false;
  }
}
