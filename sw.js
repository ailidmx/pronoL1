// Service Worker — Prono L1
// Gère l'installation PWA + la réception des notifications push.
// Ne pas ajouter de gestionnaire "fetch" ici sans une bonne raison —
// cela peut provoquer des échecs réseau sur certaines requêtes
// (vécu le 06/07/2026).

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

// Réception d'une notification push envoyée par le serveur
self.addEventListener('push', event => {
    let data = { titre: 'Prono-L1', corps: 'Nouvelle notification', url: 'https://prono-l1.docdadi.synology.me' };
    try {
        if (event.data) data = { ...data, ...event.data.json() };
    } catch (e) { /* payload non-JSON, on garde les valeurs par défaut */ }

    event.waitUntil(
        self.registration.showNotification(data.titre, {
            body: data.corps,
            icon: '/icon192.png',
            badge: '/icon192.png',
            data: { url: data.url },
        })
    );
});

// Clic sur la notification : focus un onglet déjà ouvert sur l'appli,
// sinon en ouvre un nouveau
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data?.url || 'https://prono-l1.docdadi.synology.me';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
            for (const client of clientsArr) {
                if (client.url.startsWith(url) && 'focus' in client) return client.focus();
            }
            return self.clients.openWindow(url);
        })
    );
});
