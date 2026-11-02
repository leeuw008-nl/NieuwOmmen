// Pushproef v1 – uitsluitend voor push-testomgeving
const API = "https://nieuwommen-push-test.leeuw008.workers.dev";
const $ = id => document.getElementById(id);
function say(s){$("status").textContent=s}
function b64url(s){const p="=".repeat((4-s.length%4)%4);const b=(s+p).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}
async function api(path,options={}){const r=await fetch(API+path,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"HTTP "+r.status);return j}
async function subscribe(){
 try{
  if(!("serviceWorker" in navigator)||!("PushManager" in window))throw new Error("Deze browser ondersteunt geen Web Push.");
  if(!window.isSecureContext)throw new Error("Push vereist een beveiligde HTTPS-verbinding.");
  const cfg=await api("/vapid");if(!cfg.publicKey)throw new Error("De VAPID-public key ontbreekt op de testserver.");
  const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Meldingentoestemming: "+permission);
  const reg=await navigator.serviceWorker.register("./service-worker.js",{scope:"./"});await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64url(cfg.publicKey)});
  const saved=await api("/subscribe",{method:"POST",body:JSON.stringify(sub.toJSON())});
  if(!saved.ok||!saved.saved)throw new Error("Server heeft registratie niet bevestigd.");
  say("Aangemeld. Serverbevestiging ontvangen. Registratie-ID: "+saved.id);
  $("result").textContent="Pushabonnement opgeslagen op de afzonderlijke testserver.";
 }catch(e){say("FOUT: "+e.message);$("result").textContent="Aanmelden niet geslaagd."}
}
async function unsubscribe(){
 try{const reg=await navigator.serviceWorker.getRegistration("./");const sub=reg&&await reg.pushManager.getSubscription();if(sub){await api("/unsubscribe",{method:"POST",body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}say("Dit apparaat is afgemeld voor de pushproef.");}
 catch(e){say("Afmelden: "+e.message)}
}
$("subscribe").addEventListener("click",subscribe);$("unsubscribe").addEventListener("click",unsubscribe);
api("/health").then(x=>say("Testserver bereikbaar · "+x.version)).catch(e=>say("Testserver nog niet ingericht: "+e.message));
