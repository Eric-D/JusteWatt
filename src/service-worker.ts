/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { self } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';

/** Hors ligne : l'application et ses fichiers sont mis en cache ; la météo l'est déjà dans IndexedDB. */
const scope = new URL(self.registration.scope);
const files = [...immutable, ...assets].map((f) => new URL(f.path, scope).href);
const SHELL = new URL('404.html', scope).href;
const CACHE = `justewatt-${files.length}-${immutable[0]?.path.split('/').pop() ?? 'dev'}`;

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll([...files, SHELL]))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET' || new URL(req.url).origin !== scope.origin) return;
	if (req.mode === 'navigate') {
		// page toujours fraîche en ligne, coquille de l'application hors ligne
		event.respondWith(
			fetch(req).catch(() => caches.match(SHELL).then((r) => r ?? Response.error()))
		);
		return;
	}
	event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
});
