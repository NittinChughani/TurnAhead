/* Staging only; push delivery intentionally disabled. Never contact production. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
