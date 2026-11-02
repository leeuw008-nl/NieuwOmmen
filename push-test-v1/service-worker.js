// Pushproef v1 – scope uitsluitend /push-test-v1/
self.addEventListener("push",event=>{
 let d={};try{d=event.data?event.data.json():{}}catch{d={body:event.data?.text?.()||"Testbericht"}}
 event.waitUntil(self.registration.showNotification(d.title||"Nieuw(s)Ommen – pushproef",{body:d.body||"De pushmelding is ontvangen.",icon:"./icon-192.png",badge:"./icon-192.png",tag:"push-test-v1",data:{url:d.url||self.registration.scope}}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();const url=event.notification.data?.url||self.registration.scope;
 event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
  for(const c of list){if(new URL(c.url).origin===self.location.origin)return c.navigate(url).then(x=>x&&x.focus())}
  return clients.openWindow(url);
 }));
});
self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
