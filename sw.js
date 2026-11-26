/* ================================================================
   MANDALA ENSAMBLES – Service Worker del Portal Docentes
   Estrategia: Network First (prioriza siempre contenido fresco).
   Cambiar CACHE_NAME en cada versión (igual que APP_VERSION).
   ================================================================ */

const CACHE_NAME = 'mdl-docentes-v0.6';

const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './src/app.js',
    './src/config/constants.js',
    './src/config/firebase.js',
    './src/services/acceso.js',
    './src/services/permisos.js',
    './src/services/calendario.js',
    './src/services/docentes.js',
    './src/services/suplencias.js',
    './src/services/pase.js',
    './src/ui/vistas.js',
    './src/ui/agenda.js',
    './src/ui/util.js',
    './src/ui/suplencias.js',
    './logo.png',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    // Solo archivos propios; Firebase y Google van siempre directo a la red
    if (new URL(event.request.url).origin !== self.location.origin) return;
    event.respondWith(
        fetch(event.request)
            .then((res) => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return res;
            })
            .catch(() => caches.match(event.request))
    );
});
