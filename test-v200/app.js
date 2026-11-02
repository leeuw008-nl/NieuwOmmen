// app.js v200 - UI state & bron filters
const BRONNEN = [
  {id:'De Stentor', name:'De Stentor', sub:'regionaal (Ommen)'},
  {id:'Gemeente Ommen', name:'Gemeente Ommen', sub:'officiële berichten'},
  {id:'Ommen City', name:'Ommen City', sub:'lokaal nieuws Ommen'},
  {id:'OudOmmen', name:'OudOmmen', sub:'artikelen over historie'},
  {id:'RondOmmen', name:'RondOmmen', sub:'lokaal nieuws'},
  {id:'RTV Oost', name:'RTV Oost', sub:'regionaal Overijssel'},
  {id:'RTV Vechtdal', name:'RTV Vechtdal', sub:'lokaal Vechtdal - via VechtdalLeeft'},
  {id:'Vechtdal Centraal', name:'Vechtdal Centraal', sub:'112 & dorpsnieuws'},
  {id:'Natuurlijk Ommen', name:'Natuurlijk Ommen', sub:'evenementen & toerisme'},
];
let state = {};
function loadState(){
  try{
    const v2 = localStorage.getItem('nieuwsommen_test_v200_bronnen');
    if(v2){
      state = JSON.parse(v2);
      let changed=false;
      if(state['Salland Centraal']){ delete state['Salland Centraal']; changed=true; }
      BRONNEN.forEach(b=>{ if(!state[b.id]){ state[b.id]={aan:true, vandaag:false, scope:'gemeente'}; changed=true; }});
      if(changed) saveState();
    } else {
      BRONNEN.forEach(b=> state[b.id] = {aan:true, vandaag:false, scope:'gemeente'});
      saveState();
    }
  }catch(e){ 
    BRONNEN.forEach(b=> state[b.id]={aan:true,vandaag:false,scope:'gemeente'});
  }
}
function saveState(){
  localStorage.setItem('nieuwsommen_test_v200_bronnen', JSON.stringify(state));
  updateHiddenCompat(); updateHeaderCount();
}
function updateHiddenCompat(){
  const cont = document.getElementById('compat-sources'); if(!cont) return;
  cont.innerHTML='';
  BRONNEN.forEach(b=>{
    const s = state[b.id] || {aan:true,vandaag:false,scope:'gemeente'};
    let cb = document.createElement('input');
    cb.type='checkbox'; cb.className='source-filter'; cb.value=b.id; cb.checked=s.aan; cb.dataset.source=b.id;
    cont.appendChild(cb);
    cb.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const gemeenteCount = BRONNEN.filter(b=> (state[b.id]?.scope||'gemeente')==='gemeente').length;
  const onlyCb = document.getElementById('only-ommen');
  if(onlyCb){ onlyCb.checked = gemeenteCount >= 5; onlyCb.dispatchEvent(new Event('change',{bubbles:true})); }
}
function renderFilters(){
  const list = document.getElementById('source-list'); if(!list) return;
  list.innerHTML='';
  BRONNEN.forEach(b=>{
    const s = state[b.id] || {aan:true,vandaag:false,scope:'gemeente'};
    const row = document.createElement('div');
    row.className='source-row'+(s.aan?'':' off');
    const scopeIsGemeente = s.scope==='gemeente';
    row.innerHTML = `<div class="source-meta"><div class="source-name">${b.name}</div><div class="source-sub">${b.sub}</div></div>
      <div class="toggles">
        <div class="toggle-col"><label class="mini-switch vandaag ${s.vandaag?'checked':''}"><input type="checkbox" ${s.vandaag?'checked':''} data-type="vandaag" data-id="${b.id}"><span class="mini-slider"></span></label><span class="mini-label">${s.vandaag?'VANDAAG':'MEER'}</span></div>
        <div class="toggle-col"><label class="mini-switch ${scopeIsGemeente?'checked scope-gemeente':'checked scope-regio'}" style="background:${scopeIsGemeente?'#0b5bd3':'#7c3aed'}"><input type="checkbox" ${scopeIsGemeente?'checked':''} data-type="scope" data-id="${b.id}"><span class="mini-slider"></span></label><span class="mini-label">${scopeIsGemeente?'GEMEENTE':'REGIO'}</span></div>
        <div class="toggle-col"><label class="mini-switch aan ${s.aan?'checked':''}"><input type="checkbox" ${s.aan?'checked':''} data-type="aan" data-id="${b.id}"><span class="mini-slider"></span></label><span class="mini-label">${s.aan?'AAN':'UIT'}</span></div>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('change', (e)=>{
      const id = e.target.dataset.id; const type = e.target.dataset.type;
      if(!state[id]) state[id]={aan:true,vandaag:false,scope:'gemeente'};
      if(type==='vandaag') state[id].vandaag = e.target.checked;
      if(type==='scope') state[id].scope = e.target.checked?'gemeente':'regio';
      if(type==='aan') state[id].aan = e.target.checked;
      saveState(); renderFilters();
      if(window.filterNews) window.filterNews();
    });
  });
}
function updateHeaderCount(){
  const aan = Object.values(state).filter(s=>s.aan).length;
  const countEl = document.getElementById('header-count');
  if(countEl) countEl.textContent = `${aan} v/d ${BRONNEN.length} bronnen ingeschakeld`;
  const btn = document.getElementById('btn-all');
  if(btn){
    btn.classList.remove('all-on','all-off','some-on');
    if(aan===BRONNEN.length){ btn.classList.add('all-on'); btn.textContent='Alles aan'; }
    else if(aan===0){ btn.classList.add('all-off'); btn.textContent='Alles uit'; }
    else { btn.classList.add('some-on'); btn.textContent='Alles aan/uit'; }
  }
}
function openPanel(){ document.getElementById('filter-header')?.classList.add('open'); document.getElementById('source-panel')?.classList.add('open'); document.body.classList.add('panel-open'); }
function closePanel(){ document.getElementById('filter-header')?.classList.remove('open'); document.getElementById('source-panel')?.classList.remove('open'); document.body.classList.remove('panel-open'); }
function resetFilters(){ BRONNEN.forEach(b=>state[b.id]={aan:true,vandaag:false,scope:'gemeente'}); saveState(); renderFilters(); if(window.filterNews) filterNews(); }
function setupFilterHeader(){
  const fh = document.getElementById('filter-header'); if(!fh) return;
  fh.addEventListener('click', (e)=>{
    if(e.target.id==='btn-all' || e.target.closest('#btn-all') || e.target.closest('.bell-slot')){
      if(e.target.closest('.bell-slot')) return;
      e.stopPropagation();
      const allOn = Object.values(state).every(s=>s.aan);
      BRONNEN.forEach(b=>state[b.id].aan = !allOn);
      saveState(); renderFilters(); if(window.filterNews) filterNews(); return;
    }
    const p = document.getElementById('source-panel');
    if(p.classList.contains('open')) closePanel(); else openPanel();
  });
}
function moveOldBell(){
  const slot = document.getElementById('bell-slot'); if(!slot) return;
  const header = document.querySelector('header');
  const candidates = header.querySelectorAll('button, [id*="push" i], [class*="push" i], [id*="bell" i], [class*="bell" i]');
  candidates.forEach(el=>{
    if(el.closest('#bell-slot') || el.id==='btn-all' || el.classList.contains('filter-header-arrow') || el.closest('.filter-header-left')) return;
    const txt = (el.textContent + ' ' + (el.innerHTML||'')).toLowerCase();
    if(txt.includes('🔔') || el.id.toLowerCase().includes('push') || el.className.toLowerCase().includes('bell') || el.className.toLowerCase().includes('push')){
      slot.appendChild(el);
    }
  });
}
document.addEventListener('DOMContentLoaded', ()=>{
  loadState(); renderFilters(); saveState(); closePanel(); setupFilterHeader();
  moveOldBell(); setTimeout(moveOldBell,300); setTimeout(moveOldBell,1000);
});
window.closePanel=closePanel; window.resetFilters=resetFilters; window.BRONNEN=BRONNEN; window.getAppState=()=>state;
