import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

export default function offlineCachePlugin() {
  let config;
  return {
    name: 'cupping-offline-cache', apply: 'build', enforce: 'post',
    configResolved(value) { config = value; },
    async closeBundle() {
      const root = resolve(config.root, config.build.outDir);
      const paths = [];
      const visit = async directory => {
        for (const item of await readdir(directory, { withFileTypes: true })) {
          const path = resolve(directory, item.name);
          if (item.isDirectory()) await visit(path);
          else if (item.name !== 'sw.js') paths.push(path);
        }
      };
      await visit(root);
      paths.sort();
      const hash = createHash('sha256');
      for (const path of paths) { hash.update(relative(root, path)); hash.update(await readFile(path)); }
      const cacheName = `osito-cupping-${hash.digest('hex').slice(0, 16)}`;
      const urls = paths.map(path => config.base + relative(root, path).split('\\').join('/'));
      const source = `const CACHE = ${JSON.stringify(cacheName)};
const FILES = ${JSON.stringify(urls)};
const HOME = ${JSON.stringify(config.base + 'index.html')};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('osito-cupping-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match(HOME)));
  } else if (FILES.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
`;
      await writeFile(resolve(root, 'sw.js'), source);
    }
  };
}
