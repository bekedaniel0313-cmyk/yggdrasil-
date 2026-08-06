const CACHE='yggdrasil-cache-v1';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./manifest.webmanifest','./icon-192.png','./icon-512.png']).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r&&r.ok){const cl=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cl))}
      return r;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./')))
  );
});
