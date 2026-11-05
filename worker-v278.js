// Worker v278 - DEFINITIEVE FIX - betrouwbare account-sync

const BRONNEN = [
{id:'De Stentor', name:'De Stentor', url:'https://www.destentor.nl/ommen/rss.xml', type:'rss'},
{id:'Gemeente Ommen', name:'Gemeente Ommen', url:'https://www.ommen.nl/actueel/', type:'gemeente'},
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

// v278: recursieve canonicalisatie; nested velden worden nu WEL vergeleken.
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

async function sendPush(sub, article, env){
if(!article) return false;
const hasValidLink = article.link && typeof article.link === 'string' && article.link.startsWith('http') && article.link.length > 10;
const hasEchtId = article.echtId || (article.id && String(article.id).startsWith('echt-'));
if(!hasValidLink && !hasEchtId){ console.log('[v306 FIX #6] sendPush blocked - geen geldige link', article.title||article.id); return false; }
if(!article.title || article.title.trim().length < 3){ console.log('[v306 FIX #6] blocked - geen titel'); return false; }
if(article.isFallback) return false;
try{
const endpoint = sub.endpoint; const vapidHeaders = await createVapidHeaders(endpoint, env);
const isTest = !!(article.isTest || (article.id && String(article.id).startsWith('test-')));
const payloadObj = {
title: article.title.slice(0,80),
body: `${article.source}: ${article.title}`.slice(0,150),
link: article.link, url: article.link, click_action: article.link,
source: article.source, id: article.id||article.link, articleId: article.link,
isTest, _isTestPush: isTest, isReal: !isTest,
icon: '/icons/icon-192x192.png', badge: '/icons/badge-lion-96x96.png',
data:{url: article.link, link: article.link, source: article.source, isTest, isReal: !isTest, icon:'/icons/icon-192x192.png', badge:'/icons/badge-lion-96x96.png'}
};
let resp = await fetch(endpoint, {method:'POST', headers:{'TTL':'86400','Content-Type':'application/octet-stream','Urgency':'high',...vapidHeaders}, body: JSON.stringify(payloadObj)});
if(!resp.ok){ resp = await fetch(endpoint, {method:'POST', headers:{'TTL':'86400','Urgency':'high',...vapidHeaders}}); }
const ok = resp.ok || resp.status===201 || resp.status===204;
return ok;
}catch(e){ return false; }
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

// v278 staged canonical pipeline. Source list and selection rules match the app.
const MAX_PER_BRON={'De Stentor':25,'RondOmmen':20,'Ommen City':10,'OudOmmen':10,'Vechtdal Centraal':10,'Nieuwsbrief':10,'Natuurlijk Ommen':10,'Gemeente Ommen':10,'RTV Oost':10,'RTV Vechtdal':10};
const SOURCE_URLS={'De Stentor':'https://www.destentor.nl/ommen/rss.xml','Gemeente Ommen':'https://www.ommen.nl/actueel/','Natuurlijk Ommen':'https://www.natuurlijkommen.nl/feed/','Ommen City':'https://ommencity.nl/feed/','OudOmmen':'https://weblog.oudommen.nl/feed/','RondOmmen':'https://www.rondommen.nl/feed/','RTV Oost':'https://www.oost.nl/nieuws/vechtdal','RTV Vechtdal':'https://rtvvechtdal.nl/','Vechtdal Centraal':'https://www.vechtdalcentraal.nl/feed/'};
const GEMEENTE_PLAATSEN=['Ommen','Lemele','Vilsteren','Beerze','Beerzerveld','Witharen','Archem','Arriën','Arriërveld','Besthmen','Dalmsholte','Eerde','Emsland','Giethmen','Hoogengraven','Junne','Nieuwebrug','Ommerbosch','Ommerkanaal','Ommerschans','Ommerveld','Rotbrink','Stegeren','Stegerveld','Varsen','Vinkenbuurt','Zeesse','Beerzerpoort'];
function municipalityArticle(a){const t=((a.title||'')+' '+(a.description||'')).toLowerCase();return GEMEENTE_PLAATSEN.some(p=>t.includes(p.toLowerCase()));}
function amsterdamParts(d){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);const o={};for(const x of p)if(x.type!=='literal')o[x.type]=Number(x.value);return o;}
function amsterdamDayKey(d){const p=amsterdamParts(d);return String(p.year)+'-'+String(p.month).padStart(2,'0')+'-'+String(p.day).padStart(2,'0');}
function dateOnlyWithPollClock(date,poll){const d=new Date(date),p=amsterdamParts(poll);const wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);const offset=wall-Math.floor(poll.getTime()/1000)*1000;return new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),p.hour,p.minute,p.second)-offset);}
function selectedForState(a,state){const s=state&&state[a.source];if(!s||s.aan!==true||a.isFallback)return false;if(s.scope==='gemeente'&&!municipalityArticle(a))return false;if(s.vandaag===true&&amsterdamDayKey(new Date(a.pubDate))!==amsterdamDayKey(new Date()))return false;return true;}
function cleanText(s){return String(s||'').replace(/&amp;/g,'&').replace(/&#8217;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function parseRssCanonical(xml,source,max){let es=[...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)];if(!es.length)es=[...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)];return es.slice(0,max).map(m=>{const x=m[1],title=cleanText((x.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)||[])[1]||'');let link=(x.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]||'';if(!link||link.includes('<'))link=(x.match(/<link[^>]+href=["']([^"']+)["']/i)||[])[1]||'';link=link.replace(/<!\[CDATA\[|\]\]>/g,'').trim();if(!link.startsWith('http'))link=(x.match(/https?:\/\/[^\s<"\]]+/)||[])[0]||link;const raw=(x.match(/<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i)||[])[1]||'';const d=raw?new Date(cleanText(raw)):null;const descRaw=(x.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i)||[])[1]||(x.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)||[])[1]||(x.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)||[])[1]||'';const desc=cleanText(descRaw);return{title,link,source,pubDate:d&&!isNaN(d)?d.toISOString():null,_dateOnly:!!(d&&!isNaN(d)&&d.getHours()===0&&d.getMinutes()===0),description:desc.slice(0,180)};}).filter(a=>a.title&&a.link&&a.link.startsWith('http'));}
function extractGemeenteDescription(pos,clean){
 const slice=clean.substring(pos,pos+1500),re=/<(p|div)[^>]*>([\s\S]*?)<\/\1>/gi;let m;
 while((m=re.exec(slice))!==null){let t=m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();if(t.length<30||t.length>400)continue;if(/^\d{1,2}\s+\w+\s+\d{4}/.test(t))continue;if(t.includes('Facebook')&&t.includes('Instagram'))continue;if(t.includes('prefetch')||t.includes('wp-admin'))continue;if(/^(Lees meer|Meer lezen|Home|Actueel)$/i.test(t))continue;return t.length>180?t.slice(0,177)+' [...]':t+' [...]';}
 return ' [...]';
}
function parseGemeenteCanonical(html){const out=[],seen=new Set(),months={januari:0,februari:1,maart:2,april:3,mei:4,juni:5,juli:6,augustus:7,september:8,oktober:9,november:10,december:11};const clean=html.replace(/<!--[\s\S]*?-->/g,' '),re=/<h[23][^>]*>\s*<a[^>]+href=["']([^"']*\/actueel\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[23]>/gi;let m;while((m=re.exec(clean))&&out.length<10){const link=m[1].startsWith('http')?m[1]:'https://www.ommen.nl'+m[1],title=cleanText(m[2]);if(title.length<8||seen.has(link))continue;seen.add(link);const block=clean.substring(Math.max(0,m.index-500),m.index+2500).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');let d=null,dateOnly=false;let dm=block.match(/(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})[^\d]{0,20}(\d{1,2})\s*:\s*(\d{2})/i);if(dm)d=new Date(+dm[3],months[dm[2].toLowerCase()],+dm[1],+dm[4],+dm[5]);else{dm=block.match(/(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i);if(dm){d=new Date(+dm[3],months[dm[2].toLowerCase()],+dm[1]);dateOnly=true;}}out.push({title:title.slice(0,130),link,source:'Gemeente Ommen',pubDate:d&&!isNaN(d)?d.toISOString():null,_dateOnly:dateOnly||!!(d&&d.getHours()===0&&d.getMinutes()===0),description:extractGemeenteDescription(m.index,clean)});}return out;}
function parseOostCanonical(html){const out=[],seen=new Set();let m;const re=/<div[^>]*publishedAt=["']([^"']+)["'][^>]*>[\s\S]*?<a[^>]+href=["'](\/nieuws\/(?!zwolle|twente|enschede|vechtdal|salland|kop-van-overijssel)[^"']{10,150})["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*name-label[^"']*["'][^>]*>([^<]{2,20})<\/div>[\s\S]*?<h[2-3][^>]*>([^<]{12,200})<\/h3>/gi;while((m=re.exec(html))&&out.length<25){const d=new Date(m[1]),link='https://www.oost.nl'+m[2],cat=m[3].trim().toUpperCase(),title=m[4].trim();if(isNaN(d)||seen.has(link)||['ALLE NIEUWS','ZWOLLE','TWENTE'].includes(title.toUpperCase()))continue;seen.add(link);out.push({title:['NIEUWS','112','ECONOMIE','SPORT'].includes(cat)?cat+': '+title:title,link,source:'RTV Oost',pubDate:d.toISOString(),description:title+' [...]'});}if(!out.length){const r=/<a[^>]+href=["'](\/nieuws\/(?!zwolle|twente|enschede|vechtdal|salland|kop-van-overijssel)[^"']{10,150})["'][^>]*>([\s\S]*?)<\/a>/gi;while((m=r.exec(html))&&out.length<20){const link='https://www.oost.nl'+m[1],t=(m[2].match(/<h[23][^>]*>([^<]{12,180})<\/h[23]>/i)||[])[1];if(!t||seen.has(link))continue;const title=t.trim();if(['alle nieuws','zwolle','twente','enschede','vechtdal','salland','kop van overijssel'].includes(title.toLowerCase()))continue;seen.add(link);out.push({title,link,source:'RTV Oost',pubDate:null,description:title+' [...]'});}}return out.slice(0,10);}
function parseRtvVechtdalCanonical(html){const out=[],seen=new Set();let m;const re=/<div class="allmode_date">([^<]+)<\/div>[\s\S]{0,600}?<h[2-3] class="allmode_title"><a href="([^"]+)">([^<]+)<\/a>[\s\S]{0,800}?<div class="allmode_(?:intro|text|introtext)[^>]*>([\s\S]*?)<\/div>/gi;while((m=re.exec(html))&&out.length<20){const p=m[1].trim().split('-'),d=p.length===3?new Date(+p[2],+p[1]-1,+p[0]):null;let link=m[2].replace(/&amp;/g,'&');if(!link.startsWith('http'))link='https://rtvvechtdal.nl'+(link.startsWith('/')?'':'/')+link;if(seen.has(link))continue;seen.add(link);out.push({title:cleanText(m[3]),link,source:'RTV Vechtdal',pubDate:d&&!isNaN(d)?d.toISOString():null,_dateOnly:!!d,description:cleanText(m[4]).slice(0,180)});}if(!out.length){const r=/<div class="allmode_date">([^<]+)<\/div>[\s\S]{0,500}?<h[2-3] class="allmode_title"><a href="([^"]+)">([^<]+)<\/a>/gi;while((m=r.exec(html))&&out.length<15){const p=m[1].trim().split('-'),d=p.length===3?new Date(+p[2],+p[1]-1,+p[0]):null;let link=m[2];if(!link.startsWith('http'))link='https://rtvvechtdal.nl'+(link.startsWith('/')?'':'/')+link;if(seen.has(link))continue;seen.add(link);out.push({title:cleanText(m[3]),link,source:'RTV Vechtdal',pubDate:d&&!isNaN(d)?d.toISOString():null,_dateOnly:!!d,description:cleanText(m[3])+' [...]'});}}return out.slice(0,10);}
function parseVechtdalCentraalCanonical(html){const out=[],seen=new Set();let m;for(const re of [/<h[2-3] class="entry-title[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi,/<h2[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]{8,200})<\/a>\s*<\/h2>/gi]){while((m=re.exec(html))&&out.length<20){let link=m[1];if(link.startsWith('/'))link='https://www.vechtdalcentraal.nl'+link;if(!link.includes('vechtdalcentraal.nl')||seen.has(link))continue;seen.add(link);out.push({title:cleanText(m[2]),link,source:'Vechtdal Centraal',pubDate:null,description:cleanText(m[2])+' [...]'});}if(out.length>5)break;}return out.slice(0,10);}
async function fetchCanonicalBron(id,env){if(id==='Nieuwsbrief'){const items=await getKV(env,'NEWSLETTER').get('items','json')||[];return Array.isArray(items)?items.slice(0,10).map(x=>({title:x.title||'Nieuwsbrief',link:x.link||'https://nieuwommen.leeuw008.nl/',source:id,pubDate:x.pubDate||null,description:x.description||x.body||x.excerpt||x.title||''})):[];}const r=await fetch(SOURCE_URLS[id],{headers:{'User-Agent':'NieuwOmmenBot/1.0'},cf:{cacheTtl:300}});if(!r.ok)throw new Error('HTTP '+r.status);const body=await r.text();if(id==='Gemeente Ommen')return parseGemeenteCanonical(body);if(id==='RTV Oost')return parseOostCanonical(body);if(id==='RTV Vechtdal'){const a=parseRtvVechtdalCanonical(body);if(a.length)return a;const fr=await fetch('https://rtvvechtdal.nl/feed/',{headers:{'User-Agent':'NieuwOmmenBot/1.0'},cf:{cacheTtl:300}});if(fr.ok)return parseRssCanonical(await fr.text(),id,10);return [];}if(id==='Vechtdal Centraal'){let a=parseRssCanonical(body,id,10);if(a.length)return a;a=parseVechtdalCentraalCanonical(body);if(a.length)return a;const hr=await fetch('https://www.vechtdalcentraal.nl/',{headers:{'User-Agent':'NieuwOmmenBot/1.0'},cf:{cacheTtl:300}});if(hr.ok)return parseVechtdalCentraalCanonical(await hr.text());return [];}return parseRssCanonical(body,id,MAX_PER_BRON[id]||10);}
let canonicalInFlight=null;
async function getCanonicalArticles(env,force=false){if(canonicalInFlight)return canonicalInFlight;canonicalInFlight=(async()=>{const kv=getKV(env,'SEEN');let old=null;try{old=await kv.get('article_cache','json');}catch{}const now=Date.now();if(!force&&old&&now-(old.fetchedAt||0)<300000&&Array.isArray(old.articles))return old;const results=await Promise.all(BRONNEN.map(async b=>{try{return{id:b.id,ok:true,articles:await fetchCanonicalBron(b.id,env)};}catch(e){return{id:b.id,ok:false,error:e.message,articles:[]};}}));const oldByLink=new Map((old?.articles||[]).map(a=>[a.link,a])),pollTimes={...(old?.pollTimes||{})},articles=[];for(const result of results){let sourceArts=result.articles;if(!result.ok)sourceArts=[...oldByLink.values()].filter(a=>a.source===result.id);for(const raw of sourceArts){if(!raw.link||!raw.title)continue;const a={...raw,source:result.id};const d=a.pubDate?new Date(a.pubDate):null,needsPoll=!d||isNaN(d)||a._dateOnly||(d.getHours()===0&&d.getMinutes()===0&&d.getSeconds()===0);if(needsPoll){if(!pollTimes[a.link]){const poll=new Date(now),assigned=a._dateOnly&&d&&!isNaN(d)?dateOnlyWithPollClock(d,poll):poll;pollTimes[a.link]=assigned.toISOString();}a.pubDate=pollTimes[a.link];}else a.pubDate=d.toISOString();delete a._dateOnly;articles.push(a);}}const keep=new Set(articles.map(a=>a.link));for(const k of Object.keys(pollTimes))if(!keep.has(k))delete pollTimes[k];const cache={fetchedAt:now,articles,sourceStatus:results.map(r=>({id:r.id,ok:r.ok,count:r.articles.length,error:r.ok?undefined:r.error})),pollTimes};await kv.put('article_cache',JSON.stringify(cache));return cache;})();try{return await canonicalInFlight;}finally{canonicalInFlight=null;}}

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
if(existingSet.size===set.size){ let same=true; for(const v of set){ if(!existingSet.has(v)){same=false;break;} } if(same){console.log('[v278] seen_links unchanged, skip put');return false;} }
await SEEN.put('seen_links',JSON.stringify([...set].slice(-500))); console.log(`[v278] seen_links saved ${set.size}`); return true;
}catch(e){ console.log('[v278] setSeenLinks fail',e.message); return false; }
}
async function shouldSendToSub(sub,article,env,syncCache=null){
 try{
  let filterState=null;
  if(sub.userId){
   const syncData=syncCache&&syncCache.has(sub.userId)?syncCache.get(sub.userId):await getKV(env,'SYNC').get(sub.userId,'json');
   if(syncData&&syncData.state){
    if(syncData.state.__pushEnabled===false||syncData.state.pushEnabled===false||syncData.state.push===false||syncData.state.pushDisabled===true)return false;
    const hasSyncSettings=BRONNEN.some(b=>syncData.state[b.id]&&typeof syncData.state[b.id]==='object'&&'aan' in syncData.state[b.id]);
    if(hasSyncSettings&&(syncData.updated||0)>=(sub.updated||0))filterState=syncData.state;
   }
  }
  if(!filterState&&sub.filters&&typeof sub.filters==='object')filterState=sub.filters;
  const hasSettings=filterState&&BRONNEN.some(b=>filterState[b.id]&&typeof filterState[b.id]==='object'&&'aan' in filterState[b.id]);
  if(hasSettings){if(!selectedForState(article,filterState))return false;}
  else if(!sub.sources||!Array.isArray(sub.sources)||!sub.sources.includes(article.source))return false;
 }catch(e){return false;}
 if(sub.pushEnabled===false)return false;
 return true;
}

export default {
async fetch(request,env,ctx){
const url=new URL(request.url); const path=url.pathname; const ch=corsHeaders();
if(request.method==='OPTIONS') return new Response('',{headers:ch});
if(path==='/admin' || path==='/admin/') return redirect('https://nieuwommen.leeuw008.nl/admin/');
try{
if(path==='/api/articles'){try{const c=await getCanonicalArticles(env);return json({articles:c.articles,sourceStatus:c.sourceStatus,generatedAt:c.fetchedAt,version:'v278-common-articles'});}catch(e){return json({error:'Artikelen ophalen mislukt: '+e.message,articles:[]},503);}}
if(path==='/newsletter/feed' || path==='/api/newsletter/feed'){
try{
const NL=getKV(env,'NEWSLETTER'); let items=await NL.get('items','json')||[];
items=items.map(it=>{if(it.isEcht || (it.id && String(it.id).startsWith('echt-'))){const echtId=it.echtId||it.id;if(!it.link || it.link==='https://nieuwommen.leeuw008.nl/' || !it.link.includes('echt=')) it.link='https://nieuwommen.leeuw008.nl/?echt='+encodeURIComponent(echtId)+'&highlight='+encodeURIComponent(echtId);}return it;});
return json({items,count:items.length,source:'Nieuwsbrief',version:'v278'});
}catch(e){return json({items:[],error:e.message});}
}

if(path==='/auth/register' && request.method==='POST'){
const {email,password}=await request.json(); if(!email||!password||password.length<6)return json({error:'Email en wachtwoord min 6 tekens vereist'},400);
const USERS=getKV(env,'USERS'); const SESSIONS=getKV(env,'SESSIONS'); const key=email.toLowerCase(); const existing=await USERS.get(key,'json'); if(existing)return json({error:'Account bestaat al'},400);
const id='u_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); const pwHash=await hashPassword(password);
await USERS.put(key,JSON.stringify({id,email,passwordHash:pwHash,created:Date.now()}));
const token=makeToken(); await SESSIONS.put(token,JSON.stringify({userId:id,email,created:Date.now()}),{expirationTtl:60*60*24*90});
return json({token,id,email,user:{id,email},version:'v278'});
}
if(path==='/auth/login' && request.method==='POST'){
const {email,password}=await request.json(); if(!email||!password)return json({error:'Email en wachtwoord vereist'},400);
const USERS=getKV(env,'USERS'); const SESSIONS=getKV(env,'SESSIONS'); const user=await USERS.get(email.toLowerCase(),'json'); if(!user)return json({error:'Account niet gevonden'},401);
if(await hashPassword(password)!==user.passwordHash)return json({error:'Wachtwoord onjuist'},401);
const token=makeToken(); await SESSIONS.put(token,JSON.stringify({userId:user.id,email:user.email,created:Date.now()}),{expirationTtl:60*60*24*90});
return json({token,id:user.id,email:user.email,user:{id:user.id,email:user.email},version:'v278'});
}
if(path==='/auth/me'){const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);return json({user:{id:sess.userId,email:sess.email},id:sess.userId,email:sess.email});}
if(path==='/auth/logout' && request.method==='POST'){
const SESSIONS=getKV(env,'SESSIONS');try{const {token}=await request.json();if(token)await SESSIONS.delete(token);}catch{}
const auth=request.headers.get('Authorization')||'';const m=auth.match(/Bearer\s+(.+)/);if(m)await SESSIONS.delete(m[1]);return json({ok:true});
}

// v278: sync/save vergelijkt de VOLLEDIGE geneste state en meldt of er echt geschreven is.
if(path==='/sync/save' && request.method==='POST'){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);
const {state}=await request.json();if(!state)return json({error:'Geen state'},400);
const SYNC_KV=getKV(env,'SYNC');
try{
const existing=await SYNC_KV.get(sess.userId,'json');
if(existing && existing.state && stableStringify(existing.state)===stableStringify(state)){
console.log('[v278] sync/save skip - unchanged');
return json({ok:true,changed:false,skipped:true,updated:existing.updated||Date.now(),version:'v278'});
}
}catch(e){console.log('[v278] sync compare error:',e.message);}
const updated=Date.now();
await SYNC_KV.put(sess.userId,JSON.stringify({state,updated}));
console.log('[v278] sync/save STORED',sess.userId,'updated=',updated,'keys=',Object.keys(state).length);
return json({ok:true,changed:true,skipped:false,updated,version:'v278'});
}

if(path==='/sync/load'){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);
const data=await getKV(env,'SYNC').get(sess.userId,'json');if(!data)return json({state:null,updated:0});return json(data);
}

if(path==='/subscribe' && request.method==='POST'){
try{
let bodyText;try{bodyText=await request.text();}catch(e){return json({error:'Kon body niet lezen: '+e.message},400);}
let body;try{body=JSON.parse(bodyText);}catch(e){return json({error:'Invalid JSON: '+e.message},400);}
const {endpoint,keys,sources,description,filters}=body;if(!endpoint || typeof endpoint!=='string' || endpoint.length<10)return json({error:'no endpoint'},400);
let sess=null;try{sess=await getUserFromRequest(request,env);}catch(e){}
let id;try{id=safeId(endpoint);}catch(e){return json({error:'safeId fail: '+e.message},500);}
const SUBS=getKV(env,'SUBS');let existing=null;try{existing=await SUBS.get(id,'json');}catch(e){existing=null;}
const ip=getClientIP(request);const ua=request.headers.get('User-Agent')||'';
let finalSources=existing?.sources||[];if(Array.isArray(sources))finalSources=sources;
if(existing){
const sameSources=stableStringify(existing.sources||[])===stableStringify(finalSources);
const sameFilters=stableStringify(existing.filters||{})===stableStringify(filters||existing.filters||{});
const sameUser=(existing.userId||null)===(sess?sess.userId:existing.userId||null);
const samePush=(existing.pushEnabled!==false)===(body.pushEnabled!==false);
if(sameSources&&sameFilters&&sameUser&&samePush){console.log('[v278] subscribe skip - unchanged',id.slice(0,10));return json({ok:true,id,linkedUser:sess?sess.userId:existing.userId||null,sources:finalSources,version:'v278',skipped:true});}
}
const now=Date.now();
const newSub={endpoint,keys:keys||existing?.keys||{},sources:finalSources,filters:filters&&typeof filters==='object'?filters:(existing?.filters||null),userId:sess?sess.userId:existing?.userId||null,email:sess?sess.email:existing?.email||null,description:description||existing?.description||'',ip,userAgent:ua.slice(0,200),pushEnabled:body.pushEnabled!==false,created:existing?.created||now,updated:now,lastSeen:now,lastPush:existing?.lastPush||null,lastPushSource:existing?.lastPushSource||null,pushCount:existing?.pushCount||0};
await SUBS.put(id,JSON.stringify(newSub));return json({ok:true,id,linkedUser:sess?sess.userId:null,sources:finalSources,version:'v278'});
}catch(e){return json({error:'Subscribe crash: '+e.message,stack:e.stack},500);}
}
if(path==='/unsubscribe' && request.method==='POST'){try{const {endpoint}=await request.json();if(!endpoint)return json({error:'no endpoint'},400);await getKV(env,'SUBS').delete(safeId(endpoint));return json({ok:true});}catch(e){return json({error:'unsubscribe fail: '+e.message},500);}}
if(path==='/push/off' && request.method==='POST'){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);const SUBS=getKV(env,'SUBS');const all=await getAllSubs(env);let deleted=0;for(const sub of all){if(sub.userId===sess.userId){await SUBS.delete(sub._id);deleted++;}}const SYNC=getKV(env,'SYNC');const existing=await SYNC.get(sess.userId,'json')||{state:{}};const newState={...(existing.state||{}),__pushEnabled:false,pushEnabled:false};const updated=Date.now();await SYNC.put(sess.userId,JSON.stringify({state:newState,updated}));return json({ok:true,deleted,message:'Push uit - v278',updated});
}
if(path==='/push/on' && request.method==='POST'){
const sess=await getUserFromRequest(request,env);if(!sess)return json({error:'Niet ingelogd'},401);const SYNC=getKV(env,'SYNC');const existing=await SYNC.get(sess.userId,'json')||{state:{}};const newState={...(existing.state||{}),__pushEnabled:true,pushEnabled:true};const updated=Date.now();await SYNC.put(sess.userId,JSON.stringify({state:newState,updated}));return json({ok:true,message:'Push aan - v278',updated});
}
if(path==='/last'){const last=await getKV(env,'SEEN').get('last_article','json')||{title:'Nieuw(s)Ommen',link:'/',source:'Ommen',id:'last'};return json(last);}
if(path.startsWith('/proxy')){const target=url.searchParams.get('url');if(!target)return text('missing url',400);try{const r=await fetch(target,{headers:{'User-Agent':'NieuwOmmenBot/1.0'},cf:{cacheTtl:600}});const txt=await r.text();return new Response(txt,{headers:{...ch,'Content-Type':r.headers.get('content-type')||'text/plain','Cache-Control':'no-store'}});}catch(e){return text('proxy error '+e.message,500);}}
if(path==='/test' || path==='/test-push'){
const q=url.searchParams;const srcParam=q.get('source')||'Nieuwsbrief';const testArticle={title:q.get('title')||'Test push '+srcParam,link:q.get('link')||'https://www.ommen.nl/actueel/',source:srcParam,pubDate:new Date().toISOString(),id:q.get('id')||'test-'+Date.now(),isTest:q.get('real')!=='1'};
const subs=await getAllSubs(env);let sent=0;let blocked=[];let failed=[];for(const sub of subs){if(!(await shouldSendToSub(sub,testArticle,env))){blocked.push(sub._id.slice(0,8));continue;}if(await sendPush(sub,testArticle,env))sent++;else failed.push(sub._id.slice(0,8));}
return text(`Test push v278 naar ${sent}/${subs.length} - geblokkeerd ${blocked.length} - failed ${failed.length} - bron: ${testArticle.source} - dedup puts`);
}
if(path==='/test-parser'){
const bronId=url.searchParams.get('bron')||'RTV Vechtdal';const b=BRONNEN.find(x=>x.id===bronId);if(!b)return json({error:'bron niet gevonden',bronnen:BRONNEN.map(x=>x.id)});const arts=await fetchCanonicalBron(bronId,env);return json({bron:b,count:arts.length,articles:arts,version:'v278 canonical parser test'});
}

// Debug v278: bindings expliciet zichtbaar, zodat SYNC niet ongemerkt naar in-memory fallback kan verdwijnen.
if(path==='/debug'){
const subs=await getAllSubs(env);const seen=await getSeenLinks(env);const SEEN=getKV(env,'SEEN');const SYNC=getKV(env,'SYNC');const NL=getKV(env,'NEWSLETTER');const syncList=await SYNC.list();let syncs=[];
for(const k of syncList.keys){const v=await SYNC.get(k.name,'json');if(v)syncs.push({userId:k.name,aanCount:v.state?Object.values(v.state).filter(x=>x&&typeof x==='object'&&x.aan===true).length:0,updated:v.updated||0});}
const newsletterItems=await NL.get('items','json')||[];
return json({time:new Date().toISOString(),version:'v278 - recursive sync dedup + binding diagnostics - cron 1x per uur',subs:subs.length,seen:seen.size,last:await SEEN.get('last_article','json'),syncs,newsletterCount:newsletterItems.length,putsPerDayEstimate:'<10',bindings:{USERS:!!env.USERS,SESSIONS:!!env.SESSIONS,SYNC:!!env.SYNC,SUBS:!!env.SUBS,NEWSLETTER:!!env.NEWSLETTER,SEEN:!!env.SEEN}});
}
if(path==='/stats'){const subs=await getAllSubs(env);const seen=await getSeenLinks(env);return json({subs:subs.length,seen:seen.size,last:await getKV(env,'SEEN').get('last_article','json'),version:'v278'});}

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
if(path==='/api/admin/newsletter/feed'){try{const NL=getKV(env,'NEWSLETTER');const items=await NL.get('items','json')||[];return json({items,count:items.length,version:'v278'});}catch(e){return json({items:[],error:e.message});}}
if(path==='/api/admin/newsletter' && request.method==='POST'){
try{const body=await request.json();const NL=getKV(env,'NEWSLETTER');const existing=await NL.get('items','json')||[];existing.unshift({title:body.subject,link:body.link||'https://nieuwommen.leeuw008.nl/',description:body.body||body.subject,pubDate:new Date().toISOString(),source:'Nieuwsbrief'});await NL.put('items',JSON.stringify(existing.slice(0,20)));return json({ok:true,message:'Nieuwsbrief opgeslagen',count:existing.length,version:'v278'});}catch(e){return json({error:'Newsletter fout: '+e.message},500);}
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
await NL.put('items',JSON.stringify(items.slice(0,20)));return json({ok:true,deleted:before-items.length,count:items.length,version:'v278'});
}catch(e){return json({error:'Delete fout: '+e.message},500);}
}
if(path==='/api/admin/newsletter/update' && request.method==='POST'){
try{
const body=await request.json();const NL=getKV(env,'NEWSLETTER');let items=await NL.get('items','json')||[];
items=items.map(it=>{if(it.isEcht || (it.id && String(it.id).startsWith('echt-'))){const echtId=it.echtId||it.id;if(!it.link || it.link==='https://nieuwommen.leeuw008.nl/' || !it.link.includes('echt='))it.link='https://nieuwommen.leeuw008.nl/?echt='+encodeURIComponent(echtId)+'&highlight='+encodeURIComponent(echtId);}return it;});
let idx=-1;if(typeof body.index==='number')idx=body.index;else if(body.pubDate)idx=items.findIndex(i=>i.pubDate===body.pubDate);else if(body.oldPubDate)idx=items.findIndex(i=>i.pubDate===body.oldPubDate);
if(idx<0||idx>=items.length)return json({error:'Item niet gevonden op index '+body.index},404);
const old=items[idx];items[idx]={title:(body.subject||body.title||old.title||'').slice(0,200),link:(body.link||old.link||'https://nieuwommen.leeuw008.nl/'),description:(body.body||body.description||old.description||''),pubDate:old.pubDate,source:'Nieuwsbrief',updated:new Date().toISOString()};
await NL.put('items',JSON.stringify(items.slice(0,20)));return json({ok:true,item:items[idx],index:idx,version:'v278'});
}catch(e){return json({error:'Update fout: '+e.message},500);}
}
if(path==='/api/admin/test-push' && request.method==='POST'){
const {title,source,link,body,filter,isReal}=await request.json();const article={title:title||'Test push',source:source||'De Stentor',link:link||'https://www.ommen.nl/actueel/',pubDate:new Date().toISOString(),id:(isReal?'real-':'test-')+Date.now(),isTest:!isReal};
const subs=await getAllSubs(env);let sent=0,total=0,skipped=[];for(const sub of subs){if(filter){const ok=await shouldSendToSub(sub,article,env);if(!ok){skipped.push(sub._id);continue;}}total++;if(await sendPush(sub,article,env))sent++;}if(!filter)total=subs.length;return json({sent,total,skipped,filtered:filter,article,version:'v278'});
}
if(path==='/api/admin/newsletter/push-real' && request.method==='POST'){
const {title,link,description}=await request.json();if(!title)return json({error:'title vereist'},400);
const article={title:title.slice(0,80),link:link||'https://nieuwommen.leeuw008.nl/',source:'Nieuwsbrief',pubDate:new Date().toISOString(),id:'real-'+Date.now(),isTest:false,description:description||title};
try{const NL=getKV(env,'NEWSLETTER');const existing=await NL.get('items','json')||[];existing.unshift({title:article.title,link:article.link,description:article.description,pubDate:new Date().toISOString(),source:'Nieuwsbrief'});await NL.put('items',JSON.stringify(existing.slice(0,20)));}catch{}
const subs=await getAllSubs(env);let sent=0,skipped=[];for(const sub of subs){if(!(await shouldSendToSub(sub,article,env))){skipped.push(sub._id);continue;}if(await sendPush(sub,article,env))sent++;}
return json({sent,total:subs.length,skipped,article,message:'Echt nieuwsbrief artikel gepusht - v278'});
}
return json({error:'onbekende admin route: '+path},404);
}
return text('Nieuw(s)Ommen Worker v278 - centrale artikelverwerking - cron 0 */1 * * *',200);
}catch(e){return json({error:'Worker crash: '+e.message,stack:e.stack},500);}
},
async scheduled(event,env,ctx){
 try{
  console.log('[v278] Cron gestart - centrale artikelenlijst');
  const cache=await getCanonicalArticles(env,true),seen=await getSeenLinks(env),subs=await getAllSubs(env),newArticles=[];
  const syncCache=new Map(),syncKV=getKV(env,'SYNC');
  for(const sub of subs)if(sub.userId&&!syncCache.has(sub.userId))syncCache.set(sub.userId,await syncKV.get(sub.userId,'json'));
  for(const a of cache.articles)if(!seen.has(a.link)){if(a.source!=='Nieuwsbrief')newArticles.push(a);seen.add(a.link);}
  if(!newArticles.length){await setSeenLinksIfChanged(env,seen);console.log('[v278] Geen nieuwe nieuwsartikelen voor push');return;}
  await setSeenLinksIfChanged(env,seen);
  try{await getKV(env,'SEEN').put('last_article',JSON.stringify(newArticles[0]));}catch{}
  if(!subs.length)return;
  newArticles.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
  for(const article of newArticles){const eligible=[];for(const sub of subs)if(await shouldSendToSub(sub,article,env,syncCache))eligible.push(sub);for(let i=0;i<eligible.length;i+=20)await Promise.all(eligible.slice(i,i+20).map(sub=>sendPush(sub,article,env)));}
  console.log('[v278] Cron klaar - '+newArticles.length+' nieuwe artikelen');
 }catch(e){console.log('[v278] Cron error',e.message,e.stack);}
}
};