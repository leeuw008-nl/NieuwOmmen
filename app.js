// app.js v402 - DEFINITIEF MODULAIR - FIX voor bronselectiepagina
// Gebruikt config/bronnen.js, state/state.js, ui/* en parsing/*

import { BRONNEN, BRON_URLS, MAX_PER_BRON } from './config/bronnen.js';
import { loadState, saveState as saveStateModule } from './state/state.js';
import { updateSourceLeds } from './ui/leds.js';
import { renderArticles as renderArticlesModule } from './ui/articles.js';
import { renderBronselectie, setupBronselectieToggle, updateBronCount } from './ui/bronselectie.js';

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

// State
let state = loadState(BRONNEN);
let allArticles = [];
let loadedSources = new Set();

const WORKER = 'https://ommen-push-v2.leeuw008.workers.dev';
const SOURCE_CACHE_TTL = 1000 * 60 * 5;
const SOURCE_CACHE_KEY = 'ommen_source_cache_v1';
function getSourceCache(){ try{return JSON.parse(localStorage.getItem(SOURCE_CACHE_KEY)||'{}');}catch{return {};}}
function setSourceCache(c){ try{localStorage.setItem(SOURCE_CACHE_KEY, JSON.stringify(c));}catch{}}
function putCachedSource(url, data){
  if(!data || data.length<200) return;
  const cache=getSourceCache();
  cache[url]={data, ts:Date.now()};
  const keys=Object.keys(cache);
  if(keys.length>25){ const oldest=keys.sort((a,b)=>cache[a].ts-cache[b].ts)[0]; delete cache[oldest]; }
  setSourceCache(cache);
}
async function fetchViaWorker(url){
  const controller = new AbortController();
  const to = setTimeout(()=>controller.abort(), 6000);
  try{
    const r = await fetch(`${WORKER}/proxy?url=${encodeURIComponent(url)}&t=${Date.now()}`, {cache:'no-store', signal:controller.signal});
    clearTimeout(to);
    if(!r.ok) throw new Error('proxy fail '+r.status);
    const t = await r.text();
    if(t.length<150) throw new Error('proxy empty');
    putCachedSource(url, t);
    return t;
  }catch(e1){
    clearTimeout(to);
    try{
      const r2 = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}&t=${Date.now()}`, {cache:'no-store'});
      if(r2.ok){
        const j = await r2.json();
        if(j.contents && j.contents.length>200) {
          putCachedSource(url, j.contents);
          return j.contents;
        }
      }
    }catch{}
    throw e1;
  }
}

async function loadOneSource(b){
  const cfg = BRON_URLS[b.id];
  try{
    const parser = BRON_PARSERS[b.id];
    if(!parser) throw new Error('geen parser voor '+b.id);
    const rawData = await fetchViaWorker(cfg.url);
    let arts = await parser(rawData, b.id);
    if(arts.length===0 && cfg.fallback){
      try{ const raw2 = await fetchViaWorker(cfg.fallback); arts = await parser(raw2, b.id); }catch{}
    }
    if(arts.length===0) throw new Error('empty na parsing');
    return arts.map(a=>({...a, source:b.name, id:b.id, isFallback:false, pubDate:a.pubDate||new Date(), description:a.description||(a.title+' [...]')}));
  }catch(e){
    console.log('load fail', b.id, e.message);
    return [{title:b.name, link:cfg.homepage, pubDate:new Date(0), description:'Bron tijdelijk offline', source:b.name, id:b.id, isFallback:true}];
  }
}

function saveStateWrapper(){
  saveStateModule(state);
  updateBronCount(state);
  try{ if(window.pushFiltersToSW) window.pushFiltersToSW(); }catch{}
}

function filterNews(){
  // Gebruik nieuwe ui module
  renderArticlesModule(allArticles, state);
  updateSourceLeds(BRONNEN, allArticles, loadedSources);
  renderBronselectie({ state, allArticles, loadedSources, onSave: saveStateWrapper, onFilter: filterNews });
  updateBronCount(state);
}

async function refreshNews(){
  const container = document.getElementById('news-container');
  if(container) container.textContent = 'Bezig met laden...';
  allArticles = [];
  loadedSources = new Set();
  
  const actief = BRONNEN.filter(b => state[b.id]?.aan);
  const results = await Promise.all(actief.map(b => loadOneSource(b).then(arts => { loadedSources.add(b.id); return arts; })));
  allArticles = results.flat().slice(0, 150);
  filterNews();
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  setupBronselectieToggle({ state, onSave: saveStateWrapper, onFilter: filterNews });
  document.addEventListener('refreshBronselectie', () => {
    renderBronselectie({ state, allArticles, loadedSources, onSave: saveStateWrapper, onFilter: filterNews });
  });
  
  const search = document.getElementById('search-input');
  if(search) search.addEventListener('input', () => filterNews());
  
  const refreshBtn = document.getElementById('refresh-btn');
  if(refreshBtn) refreshBtn.addEventListener('click', refreshNews);

  renderBronselectie({ state, allArticles, loadedSources, onSave: saveStateWrapper, onFilter: filterNews });
  updateBronCount(state);
  await refreshNews();
});

// Expose voor compat
window.BRONNEN = BRONNEN;
window.getAppState = () => state;
window.filterNews = filterNews;
window.refreshNews = refreshNews;
window.loadState = () => state;
window.saveState = saveStateWrapper;
