// push.js v200 - clean, no timeouts
const PUSH_WORKER_URL = 'https://ommen-push.leeuw008.workers.dev';
let VAPID_PUBLIC_KEY = null;

async function getVapidKey(){
  if(VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  try{
    const r = await fetch(`${PUSH_WORKER_URL}/vapid`);
    const j = await r.json();
    VAPID_PUBLIC_KEY = j.publicKey;
    return VAPID_PUBLIC_KEY;
  }catch(e){ console.error('VAPID ophalen mislukt', e); return null; }
}
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g,'+').replace(/_/g,'/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;++i) outputArray[i]=rawData.charCodeAt(i);
  return outputArray;
}
async function subscribePush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){ alert('Push wordt niet ondersteund'); return; }
  if(!VAPID_PUBLIC_KEY) await getVapidKey();
  if(!VAPID_PUBLIC_KEY){ alert('VAPID key nog niet beschikbaar'); return; }
  try{
    const reg = await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});
    await navigator.serviceWorker.ready;
    if(Notification.permission==='denied'){ alert('Meldingen zijn geblokkeerd.\n\nIn Edge/Chrome: klik op slotje in adresbalk > Meldingen > Toestaan.'); return; }
    const permission = await Notification.requestPermission();
    if(permission!=='granted'){ alert('Geen toestemming voor notificaties ('+permission+')'); return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    const sources = (typeof getSelectedSources==='function')?getSelectedSources(): (window.BRONNEN? window.BRONNEN.map(b=>b.id):[]);
    const payload = Object.assign({}, sub.toJSON(), {sources});
    await fetch(PUSH_WORKER_URL+'/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    localStorage.setItem('ommen_push_test_v200_subscribed','1');
    updatePushButton();
  }catch(e){ console.error(e); alert('Push mislukt: '+e.message); }
}
async function unsubscribePush(){
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    if(reg){ const sub=await reg.pushManager.getSubscription(); if(sub){ await fetch(PUSH_WORKER_URL+'/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})}); await sub.unsubscribe(); } }
    localStorage.removeItem('ommen_push_test_v200_subscribed');
    updatePushButton();
  }catch(e){ console.error(e); }
}
function updatePushButton(){
  const btn=document.getElementById('push-toggle'); if(!btn) return;
  const isOn=localStorage.getItem('ommen_push_test_v200_subscribed')==='1';
  btn.textContent=isOn?'🔔':'🔕';
  btn.classList.toggle('enabled', isOn);
  btn.title=isOn?'Push aan - klik om uit te zetten':'Push uit - klik om aan te zetten';
  btn.setAttribute('aria-pressed', isOn?'true':'false');
  // groene styling via CSS class
  if(isOn){ btn.style.background='#E8FFEA'; btn.style.borderColor='#A7F3D0'; }
  else { btn.style.background='#ffffff'; btn.style.borderColor='#e5e7eb'; }
}
function injectPushButton(){
  if(document.getElementById('push-toggle')){ updatePushButton(); return; }
  const slot = document.getElementById('bell-slot');
  if(!slot) return;
  const btn=document.createElement('button');
  btn.id='push-toggle';
  btn.type='button';
  btn.style.cssText='padding:0 6px;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer;font-size:20px;line-height:1;background:#fff;width:42px;height:28px;display:flex;align-items:center;justify-content:center;';
  btn.onclick=async()=>{ if(localStorage.getItem('ommen_push_test_v200_subscribed')==='1') await unsubscribePush(); else await subscribePush(); };
  slot.innerHTML=''; slot.appendChild(btn);
  updatePushButton();
}
function ensurePushInit(){
  injectPushButton();
  getVapidKey();
}
document.addEventListener('DOMContentLoaded', ensurePushInit);
window.subscribePush=subscribePush; window.unsubscribePush=unsubscribePush; window.updatePushButton=updatePushButton; window.injectPushButton=injectPushButton;
