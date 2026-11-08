const CACHE='savanna-shell-v1';
const SHELL=['./','./index.html','./style.css','./touch.css','./config.js','./js/online.js','./js/movement.mjs','./js/quest.mjs','./js/audio.js','./js/core.js','./js/world.js','./vendor/three.min.js','./manifest.webmanifest','./icons/savanna-192.png','./icons/savanna-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('savanna-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 const url=new URL(request.url);
 if(url.pathname.endsWith('/config.js')){event.respondWith(fetch(request).catch(()=>caches.match(request)));return;}
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}).catch(()=>caches.match(request).then(saved=>saved||caches.match('./index.html'))));return;
 }
 event.respondWith(caches.match(request).then(saved=>saved||fetch(request).then(response=>{
  if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;
 })));
});
