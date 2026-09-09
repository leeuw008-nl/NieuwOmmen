
import { putCachedSource } from './cache.js';
const WORKER = 'https://ommen-push-v2.leeuw008.workers.dev';

export async function fetchViaWorker(url){
  try{
    const r = await fetch(`${WORKER}/proxy?url=${encodeURIComponent(url)}&t=${Date.now()}`, {cache:'no-store'});
    if(!r.ok) throw new Error('proxy fail '+r.status);
    const t = await r.text();
    if(t.length<150) throw new Error('empty '+t.length);
    if(t.includes('Just a moment')) throw new Error('cf challenge');
    putCachedSource(url, t);
    return t;
  }catch(e1){
    // fallback 1: direct
    try{ const r2 = await fetch(url, {cache:'no-store'}); if(r2.ok){ const t2=await r2.text(); if(t2.length>500){ putCachedSource(url,t2); return t2; } } }catch{}
    // fallback 2: allorigins (voor Vechtdal)
    try{
      const r3 = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}&t=${Date.now()}`, {cache:'no-store'});
      if(r3.ok){ const j=await r3.json(); if(j.contents && j.contents.length>200){ putCachedSource(url,j.contents); return j.contents; } }
    }catch{}
    // fallback 3: rss2json voor feeds die geblokkeerd zijn
    if(url.includes('rtvvechtdal.nl') || url.includes('vechtdalcentraal.nl')){
      try{
        const rss2json = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&t=${Date.now()}`;
        const r4 = await fetch(rss2json, {cache:'no-store'});
        if(r4.ok){ const j=await r4.json(); if(j.items){ let xml = '<rss><channel>'; j.items.forEach(it=>{ xml += `<item><title><![CDATA[${it.title}]]></title><link>${it.link}</link><pubDate>${it.pubDate}</pubDate><description><![CDATA[${it.description}]]></description></item>`; }); xml += '</channel></rss>'; return xml; } }
      }catch{}
    }
    throw e1;
  }
}
