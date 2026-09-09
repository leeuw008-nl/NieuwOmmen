
import { BRONNEN, BRON_URLS } from './config/bronnen.js';
import { fetchViaWorker } from './fetch/fetchViaWorker.js';
import { enrichOostInApp } from './enrich/enrichOost.js';
import { loadState, saveState } from './state/state.js';
import { updateSourceLeds } from './ui/leds.js';
import { renderArticles } from './ui/articles.js';

// PARSING - LOCKED - nooit aanpassen zonder expliciet verzoek
import { parseDeStentor } from './parsing/De Stentor.js';
import { parseRondOmmen } from './parsing/RondOmmen.js';
import { parseOmmenCity } from './parsing/Ommen City.js';
import { parseOudOmmen } from './parsing/OudOmmen.js';
import { parseNatuurlijkOmmen } from './parsing/Natuurlijk Ommen.js';
import { parseRTVOost } from './parsing/RTV Oost.js';
import { parseRTVVechtdal } from './parsing/RTV Vechtdal.js';
import { parseVechtdalCentraal } from './parsing/Vechtdal Centraal.js';
import { parseGemeenteOmmen } from './parsing/Gemeente Ommen.js';
import { parseNieuwsbrief } from './parsing/Nieuwsbrief.js';

const BRON_PARSERS = {
  'De Stentor': parseDeStentor,
  'RondOmmen': parseRondOmmen,
  'Ommen City': parseOmmenCity,
  'OudOmmen': parseOudOmmen,
  'Natuurlijk Ommen': parseNatuurlijkOmmen,
  'RTV Oost': parseRTVOost,
  'RTV Vechtdal': parseRTVVechtdal,
  'Vechtdal Centraal': parseVechtdalCentraal,
  'Gemeente Ommen': parseGemeenteOmmen,
  'Nieuwsbrief': parseNieuwsbrief
};

let state = loadState(BRONNEN);
let allArticles = [];
let loadedSources = new Set();

async function loadOneSource(b){
  const cfg = BRON_URLS[b.id];
  try{
    let raw = await fetchViaWorker(cfg.url);
    let arts = await BRON_PARSERS[b.id](raw);
    if(arts.length===0) throw new Error('empty na parsing');
    if(b.id==='RTV Oost'){
      // enrich gebeurt HIER, niet in parsing/RTV Oost.js
      arts = await enrichOostInApp(arts, fetchViaWorker);
    }
    return arts.map(a=>({...a, source:b.name, id:b.id, isFallback:false, pubDate:a.pubDate||new Date(), description:a.description||a.title+' [...]'}));
  }catch(e){
    console.log('load fail', b.id, e.message);
    return [{title:b.name, link:cfg.homepage, pubDate:new Date(0), description:'Bron tijdelijk offline - homepage [...]', source:b.name, id:b.id, isFallback:true}];
  }
}

async function refreshNews(){
  allArticles=[]; loadedSources=new Set();
  const results = await Promise.allSettled(BRONNEN.map(b=>loadOneSource(b).then(arts=>({b,arts}))));
  const fresh=[]; results.forEach(r=>{ if(r.status==='fulfilled'){ fresh.push(...r.value.arts); loadedSources.add(r.value.b.id); } });
  allArticles=fresh;
  renderArticles(allArticles, state);
  updateSourceLeds(BRONNEN, allArticles, loadedSources);
}

document.addEventListener('DOMContentLoaded', ()=>{ setTimeout(()=>refreshNews(), 200); });
window.refreshNews=refreshNews;
