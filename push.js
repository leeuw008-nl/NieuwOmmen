// push.js v262 - FIX email niet zichtbaar bij abonnementen + koppel bestaande subs aan user na login
const WORKER_URL = 'https://ommen-push-v2.leeuw008.workers.dev';
const VAPID_PUBLIC_KEY = 'BBnCDkkzIXwUYFrF8ct-OXtRQ6-HaqF74grNVDLe4pw1SwG8_JyMYIHItRY6smyqPpdt81U1EZF33loTsepqnYo';
let swReg=null;

function urlBase64ToUint8Array(s){ const p='='.repeat((4-s.length%4)%4); const b64=(s+p).replace(/-/g,'+').replace(/_/g,'/'); const raw=atob(b64); const o=new Uint8Array(raw.length); for(let i=0;i<raw.length;++i) o[i]=raw.charCodeAt(i); return o; }
function getBell(){ return document.getElementById('push-bell-btn'); }
function ensureBell(){
  const slot=document.getElementById('bell-slot'); if(!slot) return null;
  let btn=getBell(); if(!btn){ btn=document.createElement('button'); btn.id='push-bell-btn'; btn.textContent='🔕'; btn.title='Push meldingen aan/uit'; slot.appendChild(btn); }
  return btn;
}
function getSources(){ 
  try{ 
    const v=JSON.parse(localStorage.getItem('nieuwsommen_bronnen_v2')||'{}'); 
    const keys = Object.keys(v).filter(k=> v[k] && typeof v[k]==='object' && 'aan' in v[k]);
    if(keys.length>0){
      const a=keys.filter(k=>v[k]?.aan);
      console.log('[push v270] getSources - hasSettings', keys.length, 'aan', a.length, '=>', a);
      return a;
    }
    const a=Object.keys(v).filter(k=>v[k]?.aan);
    if(a.length) return a;
  }catch(e){ console.log('[push v270] getSources parse fail', e.message); }
  if(!localStorage.getItem('nieuwsommen_bronnen_v2')){
    return ["De Stentor","Gemeente Ommen","Ommen City","OudOmmen","RondOmmen","RTV Oost","RTV Vechtdal","Vechtdal Centraal","Natuurlijk Ommen"];
  }
  return [];
}
function getAuthToken(){
  return localStorage.getItem('ommen_auth_token') || localStorage.getItem('ommen_token') || '';
}
function authHeaders(){
  const t=getAuthToken();
  return t ? {'Authorization':'Bearer '+t, 'Content-Type':'application/json'} : {'Content-Type':'application/json'};
}

async function updateSourcesOnServer(){
  try{
    if(!swReg) swReg = await navigator.serviceWorker.ready;
    const sub = await swReg.pushManager.getSubscription();
    if(!sub){ console.log('[push v270] geen sub, skip updateSources'); return; }
    const token=getAuthToken();
    console.log('[push v270] updateSources met token?', !!token, 'email?', localStorage.getItem('ommen_user_email')||'geen', 'bronnen:', getSources());
    await fetch(WORKER_URL+'/subscribe',{
      method:'POST',
      headers: authHeaders(),
      body:JSON.stringify({endpoint:sub.endpoint,keys:{},sources:getSources(), pushEnabled:true, token: token||undefined})
    });
    console.log('[push v270] Sources geupdate op server:', getSources(), 'met user?', !!token);
  }catch(e){ console.log('[push v270] update sources fail', e.message); }
}

// NIEUW v262: koppel alle bestaande anonieme subs aan ingelogde user
async function linkAnonymousSubsToUser(){
  try{
    const token=getAuthToken();
    if(!token){ console.log('[push v270] linkAnonymous - geen token'); return; }
    if(!swReg) swReg = await navigator.serviceWorker.ready;
    const sub = await swReg.pushManager.getSubscription();
    if(!sub){ console.log('[push v270] linkAnonymous - geen sub'); return; }
    console.log('[push v270] linkAnonymous - koppel sub aan user - v270 met email');
    await fetch(WORKER_URL+'/subscribe',{
      method:'POST',
      headers: authHeaders(),
      body:JSON.stringify({endpoint:sub.endpoint,keys:{},sources:getSources(), pushEnabled:true})
    });
    console.log('[push v270] linkAnonymous - klaar, check admin Abonnementen voor email');
  }catch(e){ console.log('[push v270] linkAnonymous fail', e.message); }
}

async function setPushOffOnServer(){
  try{
    const token=getAuthToken();
    if(!token){ console.log('[push v270] geen auth token, alleen lokaal uitzetten'); return; }
    const r=await fetch(WORKER_URL+'/push/off',{method:'POST',headers: authHeaders(),body: JSON.stringify({token})});
    const j=await r.json().catch(()=>({})); console.log('[push v270] /push/off', r.status, j);
  }catch(e){ console.log('[push v270] /push/off fail', e.message); }
}

async function setPushOnOnServer(){
  try{
    const token=getAuthToken(); if(!token) return;
    const r=await fetch(WORKER_URL+'/push/on',{method:'POST',headers: authHeaders(),body: JSON.stringify({token})});
    const j=await r.json().catch(()=>({})); console.log('[push v270] /push/on', r.status, j);
  }catch(e){ console.log('[push v270] /push/on fail', e.message); }
}

async function onBellClick(e){
  e.preventDefault(); e.stopPropagation();
  console.log('[push v270] CLICK');
  const b=getBell();
  try{
    if(!swReg) swReg=await navigator.serviceWorker.ready;
    let ex=null; try{ ex=await swReg.pushManager.getSubscription(); }catch{}
    console.log('[push v270] existing?',!!ex);
    if(ex){
      console.log('[push v270] unsubscribing - /unsubscribe + /push/off');
      await fetch(WORKER_URL+'/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:ex.endpoint})}).catch(()=>{});
      try{ await ex.unsubscribe(); }catch{}
      await setPushOffOnServer();
      b.textContent='🔕'; b.classList.remove('enabled','active');
      localStorage.setItem('ommen_push_subscribed','0');
      try{
        const syncRaw=localStorage.getItem('nieuwsommen_bronnen_v2');
        if(syncRaw){
          const sync=JSON.parse(syncRaw); sync.__pushEnabled=false; sync.pushEnabled=false;
          localStorage.setItem('nieuwsommen_bronnen_v2', JSON.stringify(sync));
        }
      }catch{}
      alert('Meldingen uit - je krijgt nu geen push meer');
    }else{
      const perm=await Notification.requestPermission(); 
      console.log('[push v270] perm',perm);
      if(perm!=='granted'){ alert('Geen toestemming - kijk bij slotje in adresbalk > Meldingen > Toestaan'); return; }
      console.log('[push v270] subscribing - /push/on + subscribe');
      await setPushOnOnServer();
      const sub=await swReg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
      const p256dh=btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const auth=btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))).replace(/\+/g,'-').replace(/_/g,'_').replace(/=+$/,'');
      console.log('[push v270] POST /subscribe met bronnen', getSources(), 'en token?', !!getAuthToken());
      const r=await fetch(WORKER_URL+'/subscribe',{method:'POST',headers: authHeaders(), body:JSON.stringify({endpoint:sub.endpoint,keys:{p256dh,auth},sources:getSources(), pushEnabled:true})});
      console.log('[push v270] response',r.status); const t=await r.text(); console.log('[push v270] body', t);
      if(!r.ok) throw new Error(t);
      b.textContent='🔔'; b.classList.add('enabled','active');
      localStorage.setItem('ommen_push_subscribed','1');
      try{
        const syncRaw=localStorage.getItem('nieuwsommen_bronnen_v2');
        if(syncRaw){
          const sync=JSON.parse(syncRaw); sync.__pushEnabled=true; sync.pushEnabled=true;
          localStorage.setItem('nieuwsommen_bronnen_v2', JSON.stringify(sync));
        }
      }catch{}
      alert('Meldingen aan! Bronnen: '+getSources().length);
    }
  }catch(err){ console.error('[push v270] ERR',err); alert('Fout: '+err.message); }
}

async function init(){
  const b=ensureBell(); if(!b) return;
  console.log('[push v270] init - worker:', WORKER_URL, 'token?', !!getAuthToken());
  document.removeEventListener('click', window._pushClickHandler);
  window._pushClickHandler = (ev)=>{ if(ev.target.closest && ev.target.closest('#push-bell-btn')) onBellClick(ev); };
  document.addEventListener('click', window._pushClickHandler);
  try{ 
    swReg=await navigator.serviceWorker.ready; 
    const s=await swReg.pushManager.getSubscription(); 
    b.textContent=s?'🔔':'🔕'; if(s) b.classList.add('enabled','active'); 
    console.log('[push v270] hasSub',!!s); 
    if(s){
      // v262 FIX: als ingelogd, koppel sub aan user zodat email zichtbaar wordt in Abonnementen
      if(getAuthToken()){
        await linkAnonymousSubsToUser();
      }
      updateSourcesOnServer();
    }
  }catch(e){ console.log('[push v270] init err',e); }
}

window.updatePushBell = init;
window.updatePushSubscription = updateSourcesOnServer;
window.linkAnonymousSubsToUser = linkAnonymousSubsToUser;

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
setTimeout(init,1000);

window.addEventListener('storage', (e)=>{
  if(e.key === 'nieuwsommen_bronnen_v2'){
    setTimeout(()=>updateSourcesOnServer(), 500);
  }
});

// NIEUW v262: na login automatisch koppelen
window.addEventListener('ommen_user_logged_in', ()=>{
  console.log('[push v270] event ommen_user_logged_in ontvangen, koppel subs');
  setTimeout(()=>{ linkAnonymousSubsToUser(); updateSourcesOnServer(); }, 500);
});
