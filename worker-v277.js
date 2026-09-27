// Worker v277 - DEFINITIEVE FIX - betrouwbare account-sync

const BRONNEN = [
{id:'De Stentor', name:'De Stentor', url:'https://www.destentor.nl/ommen/rss.xml', type:'rss'},
{id:'Gemeente Ommen', name:'Gemeente Ommen', url:'https://www.ommen.nl/feed/', type:'rss'},
{id:'Natuurlijk Ommen', name:'Natuurlijk Ommen', url:'https://www.natuurlijkommen.nl/feed/', type:'rss'},
{id:'Ommen City', name:'Ommen City', url:'https://ommencity.nl/feed/', type:'rss'},
{id:'OudOmmen', name:'OudOmmen', url:'https://weblog.oudommen.nl/feed/', type:'rss'},
{id:'RondOmmen', name:'RondOmmen', url:'https://www.rondommen.nl/feed/', type:'rss'},
{id:'RTV Oost', name:'RTV Oost', url:'https://www.oost.nl/nieuws/vechtdal', type:'oost'},
{id:'RTV Vechtdal', name:'RTV Vechtdal', url:'https://rtvvechtdal.nl/', type:'rtv-vechtdal'},
{id:'Vechtdal Centraal', name:'Vechtdal Centraal', url:'https://www.vechtdalcentraal.nl/feed/', type:'rss'},
{id:'Nieuwsbrief', name:'Nieuwsbrief', url:'https://nieuwommen.leeuw008.nl/', type:'nieuwsbrief'},
];
const ADMIN_EMAILS = ['leeuw008@gmail.com', 'tj.deleeuw@gmail.com'];
const VAPID_PUBLIC_FALLBACK = 'BBnCDkkzIXwUYFrF8ct-OXtRQ6-HaqF74grNVDLe4pw1SwG8_JyMYIHItRY6smyqPpdt81U1EZF33loTsepqnYo';

function corsHeaders(){ return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'86400'}; }
function json(data, status=200, extra={}){ return new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store',...corsHeaders(),...extra}}); }
function text(msg, status=200, extra={}){ return new Response(msg, {status, headers:{'Content-Type':'text/plain',...corsHeaders(),...extra}}); }
function redirect(url){ return new Response('', {status:302, headers:{Location:url, ...corsHeaders()}}); }
function uint8ArrayToBase64Url(a){ return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function base64UrlToUint8Array(s){ const p='='.repeat((4-s.length%4)%4); const b64=(s+p).replace(/-/g,'+').replace(/_/g,'/'); const raw=atob(b64); const o=new Uint8Array(raw.length); for(let i=0;i<raw.length;++i) o[i]=raw.charCodeAt(i); return o; }
async function hashPassword(pw){ const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw+'-ommen-salt-v1')); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function makeToken(){ const a=new Uint8Array(32); crypto.getRandomValues(a); return uint8ArrayToBase64Url(a)+'.'+Date.now(); }
function safeId(endpoint){
try{
if(!endpoint || typeof endpoint !== 'string') return 'sub_'+Date.now();
try{ return btoa(endpoint).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'').slice(0,64); }
catch{ let h=0; for(let i=0;i<endpoint.length;i++){ h=(h*31+endpoint.charCodeAt(i))>>>0; } return 'sub_'+h+'_'+endpoint.length+'_'+Date.now().toString(36); }
}catch(e){ return 'sub_fallback_'+Date.now(); }
}

// v277: recursieve canonicalisatie; nested velden worden nu WEL vergeleken.
function stableStringify(obj){
try{
const sortObject = (value) => {
if(Array.isArray(value)) return value.map(sortObject);
if(value && typeof value === 'object'){
const out = {};
for(const key of Object.keys(value).sort()) out[key] = sortObject(value[key]);
return out;
}
return value;
};
return JSON.stringify(sortObject(obj));
}catch{
try{ return JSON.stringify(obj); }catch{ return String(obj); }
}
}

function getKV(env, name){
let kv = env && env[name];
if(!kv && name==='SUBS' && env.PUSH_KV) kv = env.PUSH_KV;
if(!kv && name==='SEEN' && env.PUSH_KV) kv = env.PUSH_KV;
if(!kv && name==='SUBS' && env.PUSH_SUBS) kv = env.PUSH_SUBS;
if(!kv && name==='SUBS' && env.ommem_push) kv = env.ommem_push;
const MEM = globalThis.__MEM__ || (globalThis.__MEM__ = {USERS:new Map(), SESSIONS:new Map(), SYNC:new Map(), SUBS:new Map(), SEEN:new Map(), NEWSLETTER:new Map(), CRON:new Map()});
const map = MEM[name];
if(!kv || typeof kv.get !== 'function'){
return {
async get(k,t){ const v=map.get(k); if(v===undefined) return null; if(t==='json'){ try{ return JSON.parse(v);}catch{ return v; } } return v; },
async put(k,v,opts){ map.set(k, typeof v==='string'? v: JSON.stringify(v)); return; },
async delete(k){ map.delete(k); return; },
async list(){ return {keys:[...map.keys()].map(k=>({name:k}))}; }
};
}
return kv;
}

async function getUserFromRequest(request, env){
try{
const auth = request.headers.get('Authorization')||'';
const m = auth.match(/Bearer\s+(.+)/);
let token = m ? m[1] : null;
if(!token){ try{ const url=new URL(request.url); token = url.searchParams.get('token'); }catch{} }
if(!token) return null;
const SESSIONS = getKV(env,'SESSIONS'); const sess = await SESSIONS.get(token, 'json'); if(!sess) return null;
return {token, ...sess};
}catch(e){ return null; }
}
function isAdminUser(sess){ return sess && sess.email && ADMIN_EMAILS.includes(sess.email.toLowerCase()); }
function getClientIP(request){ return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'onbekend'; }

async function createVapidHeaders(endpoint, env){
try{
const aud=new URL(endpoint).origin; const exp=Math.floor(Date.now()/1000)+12*3600;
const header={alg:'ES256', typ:'JWT'}; const payload={aud, exp, sub: env.VAPID_SUBJECT || 'mailto:leeuw008@gmail.com'};
const enc=(obj)=>uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
const unsigned=`${enc(header)}.${enc(payload)}`;
let jwk; const pkRaw=(env.VAPID_PRIVATE_KEY||'').trim(); const pubRaw=(env.VAPID_PUBLIC_KEY||VAPID_PUBLIC_FALLBACK).trim();
if(pkRaw.startsWith('{')){ jwk=JSON.parse(pkRaw); }
else if(pkRaw){
const dBytes=base64UrlToUint8Array(pkRaw); const pubBytes=base64UrlToUint8Array(pubRaw);
let xBytes,yBytes; if(pubBytes.length===65 && pubBytes[0]===4){ xBytes=pubBytes.slice(1,33); yBytes=pubBytes.slice(33,65); } else if(pubBytes.length===64){ xBytes=pubBytes.slice(0,32); yBytes=pubBytes.slice(32,64); } else throw new Error('pub length');
jwk={kty:'EC', crv:'P-256', x:uint8ArrayToBase64Url(xBytes), y:uint8ArrayToBase64Url(yBytes), d:uint8ArrayToBase64Url(dBytes)};
} else throw new Error('no pk');
const privateKey=await crypto.subtle.importKey('jwk', jwk, {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
const sigBuf=await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, privateKey, new TextEncoder().encode(unsigned));
const jwt=`${unsigned}.${uint8ArrayToBase64Url(new Uint8Array(sigBuf))}`;
return {Authorization:`vapid t=${jwt}, k=${pubRaw || VAPID_PUBLIC_FALLBACK}`};
}catch(e){ return {_vapid_error:e.message}; }
}

async function hmacSha256(keyBytes,dataBytes){const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,dataBytes));}
function concatBytes(...parts){const total=parts.reduce((n,p)=>n+p.length,0);const out=new Uint8Array(total);let off=0;for(const p of parts){out.set(p,off);off+=p.length;}return out;}
async function encryptWebPushPayload(payloadText,sub){
 const keys=sub&&sub.keys;if(!keys||!keys.p256dh||!keys.auth)throw new Error('subscription keys ontbreken (p256dh/auth)');
 const uaPublic=base64UrlToUint8Array(keys.p256dh),authSecret=base64UrlToUint8Array(keys.auth);
 if(uaPublic.length!==65||uaPublic[0]!==4)throw new Error('ongeldige p256dh sleutel');if(authSecret.length!==16)throw new Error('ongeldige auth sleutel');
 const uaPublicKey=await crypto.subtle.importKey('raw',uaPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const serverKeys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',serverKeys.publicKey));
 const sharedSecret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaPublicKey},serverKeys.privateKey,256));
 const enc=new TextEncoder(),prkKey=await hmacSha256(authSecret,sharedSecret);
 const keyInfo=concatBytes(enc.encode('WebPush: info'),new Uint8Array([0]),uaPublic,serverPublic);
 const ikm=await hmacSha256(prkKey,concatBytes(keyInfo,new Uint8Array([1])));
 const salt=new Uint8Array(16);crypto.getRandomValues(salt);const prk=await hmacSha256(salt,ikm);
 const cek=(await hmacSha256(prk,concatBytes(enc.encode('Content-Encoding: aes128gcm'),new Uint8Array([0,1])))).slice(0,16);
 const nonce=(await hmacSha256(prk,concatBytes(enc.encode('Content-Encoding: nonce'),new Uint8Array([0,1])))).slice(0,12);
 const plaintext=concatBytes(enc.encode(payloadText),new Uint8Array([2]));
 const aesKey=await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt']);
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},aesKey,plaintext));
 const header=new Uint8Array(86);header.set(salt);new DataView(header.buffer).setUint32(16,4096,false);header[20]=65;header.set(serverPublic,21);
 return concatBytes(header,ciphertext);
}
async function sendPush(sub,article,env){
 if(!article)return {ok:false,error:'geen artikel'};const hasValidLink=article.link&&typeof article.link==='string'&&article.link.startsWith('http')&&article.link.length>10;
 const hasEchtId=article.echtId||(article.id&&String(article.id).startsWith('echt-'));if(!hasValidLink&&!hasEchtId)return {ok:false,error:'geen geldige link'};
 if(!article.title||article.title.trim().length<3)return {ok:false,error:'geen titel'};if(article.isFallback)return {ok:false,error:'fallback geblokkeerd'};
 try{
  const endpoint=sub&&sub.endpoint;if(!endpoint)return {ok:false,error:'endpoint ontbreekt'};
  const isTest=!!(article.isTest||(article.id&&String(article.id).startsWith('test-')));
  const articleDate=article.pubDate?new Date(article.pubDate):new Date(); const dateText=isNaN(articleDate.getTime())?'':articleDate.toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}); const pushTitle=((article.source||'Nieuw(s)Ommen')+(dateText?' · '+dateText:'')).slice(0,80); const pushBody=article.title.slice(0,150); const payloadObj={title:pushTitle,body:pushBody,link:article.link,url:article.link,click_action:article.link,source:article.source,id:article.id||article.link,articleId:article.link,isTest,_isTestPush:isTest,isReal:!isTest,icon:'/icons/icon-192x192.png',badge:'/icons/badge-lion-96x96.png',data:{url:article.link,link:article.link,source:article.source,isTest,isReal:!isTest,icon:'/icons/icon-192x192.png',badge:'/icons/badge-lion-96x96.png'}};
  const vapidHeaders=await createVapidHeaders(endpoint,env);if(vapidHeaders._vapid_error)return {ok:false,error:'VAPID: '+vapidHeaders._vapid_error};
  const encryptedBody=await encryptWebPushPayload(JSON.stringify(payloadObj),sub);
  const resp=await fetch(endpoint,{method:'POST',headers:{'TTL':'86400','Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm','Urgency':'high',...vapidHeaders},body:encryptedBody});
  if(resp.status===404||resp.status===410){try{await getKV(env,'SUBS').delete(sub._id||safeId(endpoint));}catch{}}
  if(!resp.ok){let detail='';try{detail=(await resp.text()).slice(0,300);}catch{}return {ok:false,status:resp.status,error:detail||('push service HTTP '+resp.status)};}
  // Bewaar push-administratie centraal bij een geslaagde push.
  // Deze velden worden uitsluitend bijgewerkt na HTTP-succes; naam/bronnen blijven behouden.
  try{
    const SUBS=getKV(env,'SUBS');
    const key=sub._id||safeId(endpoint);
    const current=await SUBS.get(key,'json');
    if(current){
      const now=Date.now();
      current.lastPush=now;
      current.lastPushSource=article.source||'';
      current.lastPushTitle=article.title||'';
      current.pushCount=(Number(current.pushCount)||0)+1;
      current.updated=now;
      await SUBS.put(key,JSON.stringify(current));
    }
  }catch(e){ console.log('[v277] push administratie opslaan mislukt',e.message); }
  return {ok:true,status:resp.status};
 }catch(e){return {ok:false,error:e.message||String(e)};}
}

function extractRssDate(itemXml){
try{
const raw = (itemXml.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i)||[])[1]
|| (itemXml.match(/<published[^>]*>([^<]+)<\/published>/i)||[])[1]
|| (itemXml.match(/<updated[^>]*>([^<]+)<\/updated>/i)||[])[1]
|| (itemXml.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/i)||[])[1]
|| (itemXml.match(/<date[^>]*>([^<]+)<\/date>/i)||[])[1];
if(raw){ const d = new Date(raw); if(!isNaN(d.getTime())) return d.toISOString(); }
}catch{}
return null;
}
function parseRSS(xml, bronId, max=10){
const items=[...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,max);
let entries = [];
if(items.length===0) entries=[...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)].slice(0,max);
const all = items.length? items : entries;
return all.map(m=>{
const it=m[1];
const title=(it.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)||[])[1]||'';
let link=(it.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]||'';
if(!link || !link.includes('http')){ const hrefMatch = it.match(/<link[^>]+href=["']([^"']+)["']/i); if(hrefMatch) link = hrefMatch[1]; }
link=link.replace(/<!\[CDATA\[|\]\]>/g,'').trim();
if(!link.startsWith('http')){ const mm=it.match(/https?:\/\/[^\s<"]+/); if(mm) link=mm[0]; }
const realDate = extractRssDate(it);
return {title:title.replace(/<[^>]*>/g,'').trim().slice(0,120), link, source:bronId, pubDate: realDate, _realDate: !!realDate};
}).filter(x=>x.link && x.title);
}
function parseRTVVechtdal(html, bronId){
try{
const out=[];
const re = /<div class="allmode_item[^>]*>\s*<a href="([^"]+)"[^>]*>.*?allmode_date">([^<]+)<\/div>.*?alt="([^"]+)"/gis;
let m;
while((m=re.exec(html))!==null && out.length<10){
let href=m[1].trim(), dateStr=m[2].trim(), title=m[3].trim().slice(0,120), link=href;
if(link.startsWith('/?') || link.startsWith('?')) link='https://rtvvechtdal.nl/'+link.replace(/^\//,'');
else if(link.startsWith('/')) link='https://rtvvechtdal.nl'+link;
let iso=null; const dmatch=dateStr.match(/(\d{2})-(\d{2})-(\d{4})/);
if(dmatch){ const d=new Date(`${dmatch[3]}-${dmatch[2]}-${dmatch[1]}T00:00:00Z`); if(!isNaN(d.getTime())) iso=d.toISOString(); }
if(title && link) out.push({title,link,source:bronId,pubDate:iso});
}
return out;
}catch(e){ return []; }
}
async function fetchBron(b){
try{
if(b.type==='nieuwsbrief') return [];
const r=await fetch(b.url,{headers:{'User-Agent':'NieuwOmmenBot/1.0'},cf:{cacheTtl:600}});
if(!r.ok) throw new Error(''+r.status); const txt=await r.text();
if(b.type==='rss') return parseRSS(txt,b.id,5);
if(b.type==='rtv-vechtdal'){ const parsed=parseRTVVechtdal(txt,b.id); if(parsed.length>0) return parsed; return parseRSS(txt,b.id,5); }
if(b.type==='oost'){
const generic=/<a[^>]+href=["'](\/nieuws\/[^"']+)["'][^>]*>([^<]{15,120})</gi;
const out=[]; let m;
while((m=generic.exec(txt))!==null && out.length<5){ const link='https://www.oost.nl'+m[1], title=m[2].trim().slice(0,120); if(title.length>10) out.push({title,link,source:b.id,pubDate:null}); }
return out;
}
return parseRSS(txt,b.id,5);
}catch{ return []; }
}
async function getAllSubs(env){ try{ const SUBS=getKV(env,'SUBS'); const list=await SUBS.list(); const subs=[]; for(const k of list.keys){ const v=await SUBS.get(k.name,'json'); if(v) subs.push({...v,_id:k.name}); } return subs; }catch{ return []; } }
async function getSeenLinks(env){ try{ const SEEN=getKV(env,'SEEN'); const j=await SEEN.get('seen_links','json'); return new Set(j||[]); }catch{ return new Set(); } }
async function setSeenLinksIfChanged(env,set){
try{
const SEEN=getKV(env,'SEEN'); const existing=await SEEN.get('seen_links','json'); const existingSet=new Set(existing||[]);
if(existingSet.size===set.size){ let same=true; for(const v of set){ if(!existingSet.has(v)){same=false;break;} } if(same){console.log('[v277] seen_links unchanged, skip put');return false;} }
await SEEN.put('seen_links',JSON.stringify([...set].slice(-500))); console.log(`[v277] seen_links saved ${set.size}`); return true;
}catch(e){ console.log('[v277] setSeenLinks fail',e.message); return false; }
}
async function shouldSendToSub(sub,article,env){
try{
if(sub.userId){
const SYNC=getKV(env,'SYNC'); const syncData=await SYNC.get(sub.userId,'json');
if(syncData && syncData.state){
const state=syncData.state;
if(state.__pushEnabled===false) return false; if(state.pushEnabled===false) return false; if(state.push===false) return false; if(state.pushDisabled===true) return false;
const bronKeys=BRONNEN.map(b=>b.id); let aanCount=0, hasSettings=false;
for(const key of bronKeys){ const v=state[key]; if(v && typeof v==='object' && 'aan' in v){hasSettings=true;if(v.aan===true)aanCount++;} }
if(hasSettings && aanCount===0) return false;
const bronState=state[article.source];
if(bronState && typeof bronState==='object' && 'aan' in bronState){if(bronState.aan===false)return false;} else {if(hasSettings)return false;}
}
}
}catch(e){}
if(sub.sources && Array.isArray(sub.sources)){ if(sub.sources.length===0)return false; if(!sub.sources.includes(article.source))return false; }
if(sub.pushEnabled===false)return false;
return true;
}

export default {
async fetch(request,env,ctx){
const url=new URL(request.url); const path=url.pathname; const ch=corsHeaders();
if(request.method==='OPTIONS') return new Response('',{headers:ch});
if(path==='/admin' || path==='/admin/') return redirect('https://nieuwommen.leeuw008.nl/admin/');
try{
if(path==='/newsletter/feed' || path==='/api/newsletter/feed'){
try{
const NL=getKV(env,'NEWSLETTER'); let items=await NL.get('items','json')||[];
items=items.map(it=>{if(it.isEcht || (it.id && String(it.id).startsWith('echt-'))){const echtId=it.echtId||it.id;if(!it.link || it.link==='https://nieuwommen.leeuw008.nl/' || !it.link.includes('echt=')) it.link='https://nieuwommen.leeuw008.nl/?echt='+encodeURIComponent(echtId)+'&highlight='+encodeURIComponent(echtId);}return it;});
return json({items,count:items.length,source:'Nieuwsbrief',version:'v277'});
}catch(e){return json({items:[],error:e.message});}
}

if(path==='/auth/register' && request.method==='POST'){
const {email,password}=await request.json(); if(!email||!password||password.length<6)return json({error:'Email en wachtwoord min 6 tekens vereist'},400);
const USERS=getKV(env,'USERS'); const SESSIONS=getKV(env,'SESSIONS'); const key=email.toLowerCase(); const existing=await USERS.get(key,'json'); if(existing)return json({error:'Account bestaat al'},400);
const id='u_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); const pwHash=await hashPassword(password);
await USERS.put(key,JSON.stringify({id,email,passwordHash:pwHash,created:Date.now()}));
const token=makeToken(); await SESSIONS.put(token,JSON.stringify({userId:id,email,created:Date.now()}),{expirationTtl:60*60*24*90});
return json({token,id,email,user:{id,email},version:'v277'});
}
if(path==='/auth/login' && request.method==='POST'){
const {email,password}=await request.json(); if(!email||!password)return json({error:'Email en wachtwoord vereist'},400);
const USERS=getKV(env,'USERS'); const SESSIONS=getKV(env,'SESSIONS'); const user=await USERS.get(email.toLowerCase(),'json'); if(!user)return json({error:'Account niet gevonden'},401);
if(await hashPassword(password)!==user.passwordHash)return json({error:'Wachtwoord onjuist'},401);
const token=makeToken(); await SESSIONS.put(token,JSON.stringify({userId:user.id,email:user.email,created:Date.now()}),{expirationTtl:60*60*24*90});
return json({token,id:user.id,email:user.email,user:{id:user.id,email:user.email},version:'v277'});
}
if(path==='/auth/me'){const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);return json({user:{id:sess.userId,email:sess.email},id:sess.userId,email:sess.email});}
if(path==='/auth/logout' && request.method==='POST'){
const SESSIONS=getKV(env,'SESSIONS');try{const {token}=await request.json();if(token)await SESSIONS.delete(token);}catch{}
const auth=request.headers.get('Authorization')||'';const m=auth.match(/Bearer\s+(.+)/);if(m)await SESSIONS.delete(m[1]);return json({ok:true});
}

// v277: sync/save vergelijkt de VOLLEDIGE geneste state en meldt of er echt geschreven is.
if(path==='/sync/save' && request.method==='POST'){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);
const {state}=await request.json();if(!state)return json({error:'Geen state'},400);
const SYNC_KV=getKV(env,'SYNC');
try{
const existing=await SYNC_KV.get(sess.userId,'json');
if(existing && existing.state && stableStringify(existing.state)===stableStringify(state)){
console.log('[v277] sync/save skip - unchanged');
return json({ok:true,changed:false,skipped:true,updated:existing.updated||Date.now(),userId:sess.userId,aanCount:Object.values(existing.state||{}).filter(x=>x&&x.aan===true).length,version:'v277'});
}
}catch(e){console.log('[v277] sync compare error:',e.message);}
const updated=Date.now();
await SYNC_KV.put(sess.userId,JSON.stringify({state,updated}));
console.log('[v277] sync/save STORED',sess.userId,'updated=',updated,'keys=',Object.keys(state).length);
return json({ok:true,changed:true,skipped:false,updated,userId:sess.userId,aanCount:Object.values(state).filter(x=>x&&x.aan===true).length,version:'v277'});
}

if(path==='/sync/load'){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);
const data=await getKV(env,'SYNC').get(sess.userId,'json');if(!data)return json({state:null,updated:0,userId:sess.userId});return json({...data,userId:sess.userId,aanCount:Object.values(data.state||{}).filter(x=>x&&x.aan===true).length,version:'v277'});
}

if(path==='/subscribe' && request.method==='POST'){
try{
let bodyText;try{bodyText=await request.text();}catch(e){return json({error:'Kon body niet lezen: '+e.message},400);}
let body;try{body=JSON.parse(bodyText);}catch(e){return json({error:'Invalid JSON: '+e.message},400);}
const {endpoint,keys,sources,description}=body;if(!endpoint || typeof endpoint!=='string' || endpoint.length<10)return json({error:'no endpoint'},400);
let sess=null;try{sess=await getUserFromRequest(request,env);}catch(e){}
let id;try{id=safeId(endpoint);}catch(e){return json({error:'safeId fail: '+e.message},500);}
const SUBS=getKV(env,'SUBS');let existing=null;try{existing=await SUBS.get(id,'json');}catch(e){existing=null;}
const ip=getClientIP(request);const ua=request.headers.get('User-Agent')||'';
let finalSources=existing?.sources||[];if(Array.isArray(sources))finalSources=sources;
if(existing){
const sameSources=stableStringify(existing.sources||[])===stableStringify(finalSources);
const sameUser=(existing.userId||null)===(sess?sess.userId:existing.userId||null);
const samePush=(existing.pushEnabled!==false)===(body.pushEnabled!==false);
if(sameSources&&sameUser&&samePush){console.log('[v277] subscribe skip - unchanged',id.slice(0,10));return json({ok:true,id,linkedUser:sess?sess.userId:existing.userId||null,sources:finalSources,version:'v277',skipped:true});}
}
let preservedDescription=existing?.description||'';
if(!preservedDescription && sess?.userId){
  try{
    const all=await getAllSubs(env);
    const prior=all.filter(s=>s.userId===sess.userId && s.description && s._id!==id)
      .sort((a,b)=>(b.updated||b.created||0)-(a.updated||a.created||0))[0];
    if(prior) preservedDescription=prior.description;
  }catch{}
}
const now=Date.now();
const newSub={endpoint,keys:keys||existing?.keys||{},sources:finalSources,userId:sess?sess.userId:existing?.userId||null,email:sess?sess.email:existing?.email||null,description:description||preservedDescription||'',ip,userAgent:ua.slice(0,200),pushEnabled:body.pushEnabled!==false,created:existing?.created||now,updated:now,lastSeen:now,lastPush:existing?.lastPush||null,lastPushSource:existing?.lastPushSource||null,lastPushTitle:existing?.lastPushTitle||null,pushCount:existing?.pushCount||0};
await SUBS.put(id,JSON.stringify(newSub));return json({ok:true,id,linkedUser:sess?sess.userId:null,sources:finalSources,version:'v277'});
}catch(e){return json({error:'Subscribe crash: '+e.message,stack:e.stack},500);}
}
if(path==='/unsubscribe' && request.method==='POST'){try{const {endpoint}=await request.json();if(!endpoint)return json({error:'no endpoint'},400);await getKV(env,'SUBS').delete(safeId(endpoint));return json({ok:true});}catch(e){return json({error:'unsubscribe fail: '+e.message},500);}}
if(path==='/push/off' && request.method==='POST'){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);const SUBS=getKV(env,'SUBS');const all=await getAllSubs(env);let deleted=0;for(const sub of all){if(sub.userId===sess.userId){await SUBS.delete(sub._id);deleted++;}}const SYNC=getKV(env,'SYNC');const existing=await SYNC.get(sess.userId,'json')||{state:{}};const newState={...(existing.state||{}),__pushEnabled:false,pushEnabled:false};const updated=Date.now();await SYNC.put(sess.userId,JSON.stringify({state:newState,updated}));return json({ok:true,deleted,message:'Push uit - v277',updated});
}
if(path==='/push/on' && request.method==='POST'){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);const SYNC=getKV(env,'SYNC');const existing=await SYNC.get(sess.userId,'json')||{state:{}};const newState={...(existing.state||{}),__pushEnabled:true,pushEnabled:true};const updated=Date.now();await SYNC.put(sess.userId,JSON.stringify({state:newState,updated}));return json({ok:true,message:'Push aan - v277',updated});
}
if(path==='/last'){const last=await getKV(env,'SEEN').get('last_article','json')||{title:'Nieuw(s)Ommen',link:'/',source:'Ommen',id:'last'};return json(last);}
if(path.startsWith('/proxy')){const target=url.searchParams.get('url');if(!target)return text('missing url',400);try{const r=await fetch(target,{headers:{'User-Agent':'NieuwOmmenBot/1.0'},cf:{cacheTtl:600}});const txt=await r.text();return new Response(txt,{headers:{...ch,'Content-Type':r.headers.get('content-type')||'text/plain','Cache-Control':'no-store'}});}catch(e){return text('proxy error '+e.message,500);}}
if(path==='/test' || path==='/test-push'){
const q=url.searchParams;const srcParam=q.get('source')||'Nieuwsbrief';const testArticle={title:q.get('title')||'Test echte push + bronfilter',link:q.get('link')||'https://www.ommen.nl/actueel/',source:srcParam,id:q.get('id')||'test-'+Date.now(),isTest:q.get('real')!=='1'};
const subs=await getAllSubs(env);let sent=0;let blocked=[];let failed=[];for(const sub of subs){if(!(await shouldSendToSub(sub,testArticle,env))){blocked.push(sub._id.slice(0,8));continue;}const result=await sendPush(sub,testArticle,env);if(result.ok)sent++;else failed.push({id:sub._id.slice(0,8),status:result.status||0,error:result.error||'onbekend'});}
return json({ok:sent>0||subs.length===0,sent,total:subs.length,blocked,failed,source:testArticle.source,version:'v277'});
}
if(path==='/test-parser'){
const bronId=url.searchParams.get('bron')||'RTV Vechtdal';const b=BRONNEN.find(x=>x.id===bronId);if(!b)return json({error:'bron niet gevonden',bronnen:BRONNEN.map(x=>x.id)});const arts=await fetchBron(b);return json({bron:b,count:arts.length,articles:arts,version:'v277 parser test'});
}

// Debug v277: bindings expliciet zichtbaar, zodat SYNC niet ongemerkt naar in-memory fallback kan verdwijnen.
if(path==='/debug'){
const subs=await getAllSubs(env);const seen=await getSeenLinks(env);const SEEN=getKV(env,'SEEN');const SYNC=getKV(env,'SYNC');const NL=getKV(env,'NEWSLETTER');const syncList=await SYNC.list();let syncs=[];
for(const k of syncList.keys){const v=await SYNC.get(k.name,'json');if(v)syncs.push({userId:k.name,aanCount:v.state?Object.values(v.state).filter(x=>x&&typeof x==='object'&&x.aan===true).length:0,updated:v.updated||0});}
const newsletterItems=await NL.get('items','json')||[];const pushReady=subs.filter(s=>s.keys&&s.keys.p256dh&&s.keys.auth).length;
return json({time:new Date().toISOString(),version:'v277 - encrypted Web Push + recursive sync dedup - cron 1x per uur',subs:subs.length,pushKeys:{ready:pushReady,missing:subs.length-pushReady},seen:seen.size,last:await SEEN.get('last_article','json'),syncs,newsletterCount:newsletterItems.length,putsPerDayEstimate:'<10 bij huidig gebruik',freePlan:{cron:'1x per uur behouden',maxExternalSubrequests:50,cronPushSafetyCap:35},bindings:{USERS:!!env.USERS,SESSIONS:!!env.SESSIONS,SYNC:!!env.SYNC,SUBS:!!env.SUBS,NEWSLETTER:!!env.NEWSLETTER,SEEN:!!env.SEEN}});
}
if(path==='/stats'){const subs=await getAllSubs(env);const seen=await getSeenLinks(env);return json({subs:subs.length,seen:seen.size,last:await getKV(env,'SEEN').get('last_article','json'),version:'v277'});}

if(path.startsWith('/api/admin/')){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd - token verlopen, log opnieuw in'},401);if(!isAdminUser(sess))return json({error:'Geen admin rechten: '+sess.email},403);
if(path==='/api/admin/users'){const USERS=getKV(env,'USERS');const SYNC=getKV(env,'SYNC');const list=await USERS.list();const users=[];for(const k of list.keys){const u=await USERS.get(k.name,'json');if(!u)continue;const sync=await SYNC.get(u.id,'json');users.push({email:u.email||k.name,id:u.id,sync});}return json({users,count:users.length});}
if(path.startsWith('/api/admin/sync/')){const userId=path.split('/').pop();return json({userId,sync:await getKV(env,'SYNC').get(userId,'json')});}
if(path==='/api/admin/sync'){const SYNC=getKV(env,'SYNC');const list=await SYNC.list();const all=[];for(const k of list.keys){const v=await SYNC.get(k.name,'json');if(v)all.push({userId:k.name,...v});}return json({syncs:all});}
if(path==='/api/admin/subs'){
const subs=await getAllSubs(env);const enriched=subs.map(s=>({id:s._id,description:s.description||'',email:s.email||'',userId:s.userId||'',ip:s.ip||'',userAgent:s.userAgent||'',sources:s.sources||[],sourcesCount:(s.sources||[]).length,created:s.created||0,updated:s.updated||0,lastSeen:s.lastSeen||s.updated||0,lastPush:s.lastPush||0,lastPushSource:s.lastPushSource||'',lastPushTitle:s.lastPushTitle||'',pushCount:s.pushCount||0,pushEnabled:s.pushEnabled!==false,endpointPreview:s.endpoint?s.endpoint.slice(0,60)+'...':''})).sort((a,b)=>(b.lastPush||b.updated||0)-(a.lastPush||a.updated||0));return json({subs:enriched,count:enriched.length});
}
if(path==='/api/admin/subs/update' && request.method==='POST'){
try{const body=await request.json();const {id,description}=body;if(!id)return json({error:'id vereist'},400);const SUBS=getKV(env,'SUBS');const existing=await SUBS.get(id,'json');if(!existing)return json({error:'Sub niet gevonden: '+id},404);existing.description=(description||'').slice(0,100);existing.updated=Date.now();await SUBS.put(id,JSON.stringify(existing));return json({ok:true,id,description:existing.description});}catch(e){return json({error:'Update fout: '+e.message},500);}
}
if(path==='/api/admin/subs/delete' && request.method==='POST'){const {id}=await request.json();if(!id)return json({error:'id vereist'},400);await getKV(env,'SUBS').delete(id);return json({ok:true,deleted:id});}
if(path==='/api/admin/clear-all-subs' && request.method==='POST'){const SUBS=getKV(env,'SUBS');const all=await getAllSubs(env);for(const sub of all){await SUBS.delete(sub._id);}return json({ok:true,deleted:all.length});}
if(path==='/api/admin/newsletter/feed'){try{const NL=getKV(env,'NEWSLETTER');const items=await NL.get('items','json')||[];return json({items,count:items.length,version:'v277'});}catch(e){return json({items:[],error:e.message});}}
if(path==='/api/admin/newsletter' && request.method==='POST'){
try{const body=await request.json();const NL=getKV(env,'NEWSLETTER');const existing=await NL.get('items','json')||[];existing.unshift({title:body.subject,link:body.link||'https://nieuwommen.leeuw008.nl/',description:body.body||body.subject,pubDate:new Date().toISOString(),source:'Nieuwsbrief'});await NL.put('items',JSON.stringify(existing.slice(0,20)));return json({ok:true,message:'Nieuwsbrief opgeslagen',count:existing.length,version:'v277'});}catch(e){return json({error:'Newsletter fout: '+e.message},500);}
}
if(path==='/api/admin/newsletter/delete' && request.method==='POST'){
try{
const body=await request.json();const NL=getKV(env,'NEWSLETTER');let items=await NL.get('items','json')||[];
items=items.map(it=>{if(it.isEcht || (it.id && String(it.id).startsWith('echt-'))){const echtId=it.echtId||it.id;if(!it.link || it.link==='https://nieuwommen.leeuw008.nl/' || !it.link.includes('echt='))it.link='https://nieuwommen.leeuw008.nl/?echt='+encodeURIComponent(echtId)+'&highlight='+encodeURIComponent(echtId);}return it;});
const before=items.length;
if(typeof body.index==='number'&&body.index>=0&&body.index<items.length)items.splice(body.index,1);
else if(body.pubDate)items=items.filter(i=>i.pubDate!==body.pubDate);
else if(body.title&&body.link){const idx=items.findIndex(i=>i.title===body.title&&i.link===body.link);if(idx>=0)items.splice(idx,1);}
else return json({error:'Geef index of pubDate mee'},400);
await NL.put('items',JSON.stringify(items.slice(0,20)));return json({ok:true,deleted:before-items.length,count:items.length,version:'v277'});
}catch(e){return json({error:'Delete fout: '+e.message},500);}
}
if(path==='/api/admin/newsletter/update' && request.method==='POST'){
try{
const body=await request.json();const NL=getKV(env,'NEWSLETTER');let items=await NL.get('items','json')||[];
items=items.map(it=>{if(it.isEcht || (it.id && String(it.id).startsWith('echt-'))){const echtId=it.echtId||it.id;if(!it.link || it.link==='https://nieuwommen.leeuw008.nl/' || !it.link.includes('echt='))it.link='https://nieuwommen.leeuw008.nl/?echt='+encodeURIComponent(echtId)+'&highlight='+encodeURIComponent(echtId);}return it;});
let idx=-1;if(typeof body.index==='number')idx=body.index;else if(body.pubDate)idx=items.findIndex(i=>i.pubDate===body.pubDate);else if(body.oldPubDate)idx=items.findIndex(i=>i.pubDate===body.oldPubDate);
if(idx<0||idx>=items.length)return json({error:'Item niet gevonden op index '+body.index},404);
const old=items[idx];items[idx]={title:(body.subject||body.title||old.title||'').slice(0,200),link:(body.link||old.link||'https://nieuwommen.leeuw008.nl/'),description:(body.body||body.description||old.description||''),pubDate:old.pubDate,source:'Nieuwsbrief',updated:new Date().toISOString()};
await NL.put('items',JSON.stringify(items.slice(0,20)));return json({ok:true,item:items[idx],index:idx,version:'v277'});
}catch(e){return json({error:'Update fout: '+e.message},500);}
}
if(path==='/api/admin/test-push' && request.method==='POST'){
const {title,source,link,body,filter,isReal}=await request.json();const article={title:title||'Test push',source:source||'De Stentor',link:link||'https://www.ommen.nl/actueel/',id:(isReal?'real-':'test-')+Date.now(),isTest:!isReal};
const subs=await getAllSubs(env);let sent=0,total=0,skipped=[];for(const sub of subs){if(filter){const ok=await shouldSendToSub(sub,article,env);if(!ok){skipped.push(sub._id);continue;}}total++;if(await sendPush(sub,article,env))sent++;}if(!filter)total=subs.length;return json({sent,total,skipped,filtered:filter,article,version:'v277'});
}
if(path==='/api/admin/newsletter/push-real' && request.method==='POST'){
const {title,link,description}=await request.json();if(!title)return json({error:'title vereist'},400);
const article={title:title.slice(0,80),link:link||'https://nieuwommen.leeuw008.nl/',source:'Nieuwsbrief',id:'real-'+Date.now(),isTest:false,description:description||title};
try{const NL=getKV(env,'NEWSLETTER');const existing=await NL.get('items','json')||[];existing.unshift({title:article.title,link:article.link,description:article.description,pubDate:new Date().toISOString(),source:'Nieuwsbrief'});await NL.put('items',JSON.stringify(existing.slice(0,20)));}catch{}
const subs=await getAllSubs(env);let sent=0,skipped=[];for(const sub of subs){if(!(await shouldSendToSub(sub,article,env))){skipped.push(sub._id);continue;}if(await sendPush(sub,article,env))sent++;}
return json({sent,total:subs.length,skipped,article,message:'Echt nieuwsbrief artikel gepusht - v277'});
}
return json({error:'onbekende admin route: '+path},404);
}
return text('Nieuw(s)Ommen Worker v277 - betrouwbare sync, recursive state comparison - cron 0 */1 * * *',200);
}catch(e){return json({error:'Worker crash: '+e.message,stack:e.stack},500);}
},
async scheduled(event,env,ctx){
try{
console.log('[v277] Cron gestart - 1x per uur, 0 CRON.puts');
const seen=await getSeenLinks(env);const subs=await getAllSubs(env);if(subs.length===0)console.log('[v277] Geen subs, toch seen bijwerken als nodig');
let newArticles=[];let hasNew=false;
for(const bron of BRONNEN){
if(bron.type==='nieuwsbrief')continue;
const arts=await fetchBron(bron);
for(const art of arts){if(!seen.has(art.link)){newArticles.push(art);seen.add(art.link);hasNew=true;}}
await new Promise(r=>setTimeout(r,800));
}
if(!hasNew){console.log('[v277] Geen nieuwe artikelen - 0 puts');return;}
await setSeenLinksIfChanged(env,seen);
if(newArticles.length>0){try{const SEEN=getKV(env,'SEEN');await SEEN.put('last_article',JSON.stringify(newArticles[0]));console.log('[v277] last_article saved');}catch(e){console.log('[v277] last_article fail',e.message);}}
if(subs.length===0)return;
console.log(`[v277] ${newArticles.length} nieuwe artikelen, pushen naar ${subs.length} subs`);
newArticles.sort((a,b)=>{if(!a.pubDate&&!b.pubDate)return 0;if(!a.pubDate)return 1;if(!b.pubDate)return -1;return new Date(b.pubDate)-new Date(a.pubDate);});
let cronPushes=0;const MAX_CRON_PUSHES=35;
for(const article of newArticles){
if(cronPushes>=MAX_CRON_PUSHES)break;
const relevant=[];for(const sub of subs){if(cronPushes+relevant.length>=MAX_CRON_PUSHES)break;if(await shouldSendToSub(sub,article,env))relevant.push(sub);}
for(let i=0;i<relevant.length;i+=20){const batch=relevant.slice(i,Math.min(i+20,MAX_CRON_PUSHES-cronPushes));await Promise.all(batch.map(sub=>sendPush(sub,article,env)));cronPushes+=batch.length;await new Promise(r=>setTimeout(r,300));}
}
if(cronPushes>=MAX_CRON_PUSHES&&subs.length>MAX_CRON_PUSHES)console.log('[v277] Free-plan push safety cap 35 bereikt; resterende pushdoelen worden deze run niet verzonden');
console.log(`[v277] Cron klaar - ${hasNew ? '2 puts' : '0 puts'} gedaan`);
}catch(e){console.log('[v277] Cron error',e.message,e.stack);}
}
};