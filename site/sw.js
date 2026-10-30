// App installata [utente, 29/10/2026]: prima sempre la rete (dati e codice aggiornati), e solo se manca la rete
// l'ultima copia salvata. Le chiamate all'API di GitHub (segnature) non passano mai dalla copia.
const CACHE = 'giocate-v2';
const GUSCIO = ['./', 'index.html', 'storico.html', 'app.js', 'storico.js', 'giocata.js', 'stile.css', 'manifest.webmanifest', 'icona-180.png', 'icona-192.png', 'icona-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // GitHub Pages fa tenere i file al browser per 10 minuti: subito dopo un aggiornamento il telefono usava il codice
  // vecchio con i dati nuovi (30/10/2026, "Ancora nessuna partita" nello storico). Si chiede sempre al server se
  // il file è cambiato (no-cache); le pagine (navigate) vanno così come sono.
  const richiesta = e.request.mode === 'navigate' ? e.request : new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' });
  e.respondWith(
    fetch(richiesta)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? caches.match('index.html'))),
  );
});
