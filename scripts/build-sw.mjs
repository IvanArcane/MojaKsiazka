import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const files = (await readdir('dist', { recursive: true }))
  .map(file => file.replaceAll('\\', '/'))
  .filter(file => /\.(html|js|css|svg|png|webmanifest)$/.test(file) && file !== 'sw.js').sort()
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile(`dist/${file}`))
const version = hash.digest('hex').slice(0, 16)
await writeFile('dist/sw.js', `
const PREFIX = 'moja-polka:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + '${version}';
const FILES = ${JSON.stringify(files)};
const URLS = FILES.map(file => new URL(file, self.registration.scope).href);
const INDEX = new URL('index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const appNavigation = request.mode === 'navigate' &&
    (url.pathname === new URL(self.registration.scope).pathname || url.pathname === new URL(INDEX).pathname);
  const key = appNavigation ? INDEX : url.href;
  if (!URLS.includes(key)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(key)).then(cached => cached || fetch(request)));
});
`)
console.log(`Service worker: ${files.length} plików aplikacji, wersja ${version}`)
