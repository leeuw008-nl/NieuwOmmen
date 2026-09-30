// article-focus.js v11 - voorkom late 'niet gevonden' melding na succesvolle match
(function(){
  const HIGHLIGHT_CLASS='focused-article';
  let focusedLink=null, focusedSource=null, focusedId=null, focusedTitle=null;
  let focusActive=false, observer=null, applyTimer=null, notFoundTimer=null;
  let loadingShown=false;

  function getState(){try{return JSON.parse(localStorage.getItem('nieuwsommen_bronnen_v2')||'{}');}catch{return {};}}
  function saveState(s){try{localStorage.setItem('nieuwsommen_bronnen_v2',JSON.stringify(s));}catch{}}

  function ensureSourceEnabled(sourceId){
    if(!sourceId) return;
    const state=getState();
    if(!state[sourceId]) state[sourceId]={aan:true,vandaag:false,scope:'gemeente'};
    if(!state[sourceId].aan){
      state[sourceId].aan=true;
      saveState(state);
      try{if(typeof window.filterNews==='function') window.filterNews();}catch{}
      setTimeout(()=>{try{if(typeof window.renderFilters==='function') window.renderFilters();}catch{}},100);
    }
  }

  function normalizeText(s){
    return String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  }

  function normalizeLink(url){
    try{
      const u=new URL(url,location.href);
      u.hash='';
      const drop=['highlight','focus','focusid','frompush','pushtitle','pushsource','externallink'];
      [...u.searchParams.keys()].forEach(k=>{if(drop.includes(k.toLowerCase()))u.searchParams.delete(k);});
      return u.href.replace(/\/$/,'').toLowerCase();
    }catch{
      return String(url||'').replace(/\/$/,'').toLowerCase().trim();
    }
  }

  function articleMatches(el){
    const a=el.querySelector('h2 a');
    if(!a) return false;

    // 1. Exacte link-match.
    if(focusedLink && normalizeLink(a.href)===normalizeLink(focusedLink)) return true;

    // 2. Titel als veilige fallback wanneer een bron de URL normaliseert/wijzigt.
    if(focusedTitle){
      const title=normalizeText(a.textContent);
      if(title===normalizeText(focusedTitle)){
        if(!focusedSource) return true;
        const small=normalizeText(el.querySelector('small')?.textContent);
        return small.includes(normalizeText(focusedSource));
      }
    }

    return false;
  }

  function showFocusLoading(title){
    const existing=document.getElementById('focus-loading');
    const text=title ? 'Ophalen artikel "'+title+'"' : 'Ophalen artikel...';
    if(existing){
      const label=existing.querySelector('.focus-loading-text');
      if(label) label.textContent=text;
      return;
    }
    const overlay=document.createElement('div');
    overlay.id='focus-loading';
    overlay.style.cssText='position:fixed;left:0;right:0;top:0;bottom:0;z-index:9999;background:rgba(255,255,255,.97);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';
    overlay.innerHTML='<div style="text-align:center;max-width:520px;padding:24px 20px;">'+
      '<div style="font-size:42px;line-height:1;margin-bottom:18px;animation:focusHourglass 1.2s ease-in-out infinite;">⏳</div>'+
      '<div class="focus-loading-text" style="font-size:17px;font-weight:700;color:#1e40af;line-height:1.45;">'+escapeHtml(text)+'</div>'+
      '<div style="margin-top:8px;font-size:13px;color:#64748b;">Even geduld...</div></div>';
    if(!document.getElementById('focus-loading-style')){
      const style=document.createElement('style');
      style.id='focus-loading-style';
      style.textContent='@keyframes focusHourglass{0%,100%{transform:rotate(0deg);opacity:.8}50%{transform:rotate(180deg);opacity:1}}';
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
    loadingShown=true;
  }

  function hideFocusLoading(){
    const overlay=document.getElementById('focus-loading');
    if(overlay) overlay.remove();
    loadingShown=false;
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>'\"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;' }[c]));
  }

  function createFocusBanner(total){
    const container=document.getElementById('news-container'); if(!container) return;
    let banner=document.getElementById('focus-banner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='focus-banner';
      banner.style.cssText='background:#eff6ff;border:2px solid #0b5bd3;border-radius:12px;padding:12px 16px;margin:0 0 16px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;animation:fadeIn .3s ease;';
      banner.innerHTML='<div style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#1e40af;flex:1;min-width:200px;"><span style="background:#0b5bd3;color:white;border-radius:50%;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;">📍</span><span>Nieuw artikel via push – alleen dit artikel</span></div><button id="btn-show-all" style="background:#0b5bd3;color:white;border:0;border-radius:12px;padding:10px 18px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(11,91,211,.3);">Toon alle '+(total||'')+' artikelen →</button>';
      container.insertAdjacentElement('afterbegin',banner);
      const btn=banner.querySelector('#btn-show-all');
      if(btn) btn.onclick=exitFocusMode;
    }else{
      const btn=banner.querySelector('#btn-show-all');
      if(btn) btn.textContent='Toon alle '+(total||'')+' artikelen →';
    }
  }

  function applyFocusMode(){
    if(!focusActive) return false;
    const articles=[...document.querySelectorAll('.article')];
    const matched=articles.find(articleMatches);
    if(!matched) return false;

    // Het artikel is gevonden: de tijdelijke niet-gevonden timer mag
    // nooit later alsnog de succesvolle focusbalk overschrijven.
    if(notFoundTimer){
      clearTimeout(notFoundTimer);
      notFoundTimer=null;
    }

    let count=articles.length;
    articles.forEach(el=>{
      const yes=el===matched;
      el.style.display=yes?'':'none';
      el.classList.toggle(HIGHLIGHT_CLASS,yes);
      el.style.outline=yes?'3px solid #0b5bd3':'';
      el.style.outlineOffset=yes?'4px':'';
      el.style.boxShadow=yes?'0 0 0 8px rgba(11,91,211,0.12),0 12px 32px rgba(11,91,211,0.25)':'';
      el.style.borderRadius=yes?'12px':'';
    });
    hideFocusLoading();
    createFocusBanner(count);
    setTimeout(()=>{try{matched.scrollIntoView({behavior:'smooth',block:'center'});}catch{}},80);
    console.log('[focus v9] Exact push-artikel gevonden:',matched.querySelector('h2')?.textContent?.trim().slice(0,100));
    return true;
  }

  function scheduleApply(){
    if(applyTimer) clearTimeout(applyTimer);
    applyTimer=setTimeout(()=>{applyTimer=null;applyFocusMode();},30);
  }

  function showNotFound(){
    if(!focusActive) return;
    if(applyFocusMode()) return;
    const container=document.getElementById('news-container'); if(!container) return;
    const old=document.getElementById('focus-banner'); if(old) old.remove();
    const banner=document.createElement('div');
    banner.id='focus-banner';
    banner.style.cssText='background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:12px 16px;margin:0 0 16px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
    banner.innerHTML='<div style="font-size:13px;font-weight:700;color:#92400e;flex:1;">⚠️ Het push-artikel staat niet in de huidige selectie.</div><button id="btn-show-all" style="background:#0b5bd3;color:white;border:0;border-radius:8px;padding:10px 16px;font-weight:800;cursor:pointer;">Toon alle artikelen →</button>';
    container.insertAdjacentElement('afterbegin',banner);
    document.getElementById('btn-show-all').onclick=exitFocusMode;
  }

  function startObserver(){
    const container=document.getElementById('news-container');
    if(!container || observer) return;
    observer=new MutationObserver(()=>{if(focusActive)scheduleApply();});
    observer.observe(container,{childList:true,subtree:true});
  }

  function exitFocusMode(){
    focusActive=false;
    if(observer){observer.disconnect();observer=null;}
    if(applyTimer)clearTimeout(applyTimer);
    if(notFoundTimer)clearTimeout(notFoundTimer);
    const banner=document.getElementById('focus-banner'); if(banner)banner.remove();
    hideFocusLoading();
    document.querySelectorAll('.article').forEach(el=>{
      el.style.display='';el.style.outline='';el.style.outlineOffset='';el.style.boxShadow='';el.style.borderRadius='';el.classList.remove(HIGHLIGHT_CLASS);
    });
    try{if(typeof window.filterNews==='function')window.filterNews();}catch{}
    try{history.replaceState({},'',location.pathname);}catch{}
    focusedLink=focusedSource=focusedId=focusedTitle=null;
  }

  function activate(link,source,id,title){
    focusedLink=link||null;
    focusedSource=source||null;
    focusedId=id||null;
    focusedTitle=title||null;
    focusActive=!!(focusedLink||focusedTitle);
    if(!focusActive)return;
    showFocusLoading(focusedTitle || focusedLink || '');
    ensureSourceEnabled(focusedSource);
    startObserver();
    scheduleApply();
    if(notFoundTimer)clearTimeout(notFoundTimer);
    notFoundTimer=setTimeout(showNotFound,10000);
  }

  function checkFocusParam(){
    const p=new URLSearchParams(location.search);
    const link=p.get('focus')||p.get('highlight');
    const source=p.get('src')||p.get('pushSource')||'';
    const id=p.get('id')||p.get('focusId')||'';
    const title=p.get('title')||p.get('pushTitle')||'';
    if(link)activate(link,decodeURIComponent(source||''),decodeURIComponent(id||''),decodeURIComponent(title||''));
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',e=>{
      if(!e.data)return;
      if(e.data.type==='NOTIFICATION_CLICK'||e.data.type==='PUSH_CLICKED'){
        const link=e.data.link||e.data.url||e.data.focusUrl||e.data.highlight;
        if(link){
          activate(link,e.data.source||e.data.pushSource||'',e.data.id||e.data.articleId||'',e.data.title||e.data.pushTitle||'');
          try{
            const u=new URL(location.href);
            u.pathname='/';
            u.search='';
            u.searchParams.set('highlight',link);
            if(e.data.source)u.searchParams.set('pushSource',e.data.source);
            if(e.data.articleId||e.data.id)u.searchParams.set('focusId',e.data.articleId||e.data.id);
            if(e.data.title)u.searchParams.set('pushTitle',e.data.title);
            history.replaceState({},'',u.href);
          }catch{}
          scheduleApply();
        }
      }
    });
  }

  window.exitFocusMode=exitFocusMode;
  window.showOnlyFocusedArticle=applyFocusMode;
  document.addEventListener('DOMContentLoaded',()=>{startObserver();setTimeout(checkFocusParam,50);});
  window.addEventListener('load',()=>setTimeout(checkFocusParam,100));
})();
