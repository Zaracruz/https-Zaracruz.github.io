// Minimal Service Worker to enable PWA installation
self.addEventListener('fetch', (event) => {
  // This can be empty, but must exist to satisfy the 'offline' requirement
  return;
});