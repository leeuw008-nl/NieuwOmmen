// article-focus.js v8 - snelle exacte push-identificatie, geen brede bron/path-match: push -> omlijnd artikel in app (niet extern)
(function(){
  const HIGHLIGHT_CLASS = 'focused-article';
  let focusedLink = null;
  let focusedSource = null;
  let focusedId = null;

  function getState(){ try{ return JSON.parse(localStorage.getItem('nieuwsommen_bronnen_v2')||'{}'); }catch{ return {}; } }
  function saveState(s){ localStorage.setItem('nieuwsommen_bronnen_v2', JSON.stringify(s)); }

  function ensureSourceEnabled(sourceId){
    if(!sourceId) return false;
    const state=getState();
    if(!state[sourceId]) state[sourceId]={aan:true,vandaag:false,scope:'gemeente'};
    let wasOff=!state[sourceId].aan;
    if(wasOff){
      state[sourceId].aan=true;
      saveState(state);
      if(typeof window.filterNews==='function') window.filterNews();
      if(typeof window.renderFilters==='function') setTimeout(()=>window.renderFilters(),100);
    }
    return wasOff;
  }

  function createFocusBanner(count){
    const old=document.getElementById('focus-banner');
    if(old) old.remove();
    const container=document.getElementById('news-container');
    if(!container) return;
    const banner=document.createElement('div');
    banner.id='focus-banner';
    banner.style.cssText='background:#eff6ff;border:2px solid #0b5bd3;border-radius:12px;padding:12px 16px;margin:0 0 16px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;animation:fadeIn .3s ease;';
    banner.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#1e40af;flex:1;min-width:200px;">
        <span style="background:#0b5bd3;color:white;border-radius:50%;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;">📍</span>
        <span>Nieuw artikel via push – alleen dit artikel</span>
      </div>
      <button id="btn-show-all" style="background:#0b5bd3;color:white;border:0;border-radius:12px;padding:10px 18px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(11,91,211,.3);">
        Toon alle ${count||''} artikelen →
      </button>
    `;
    container.insertAdjacentElement('afterbegin', banner);
    document.getElementById('btn-show-all').onclick=()=>exitFocusMode();
  }

  function exitFocusMode(){
    const banner=document.getElementById('focus-banner');
    if(banner) banner.remove();
    document.querySelectorAll('.article').forEach(el=>{
      el.style.display=''; el.style.outline=''; el.style.outlineOffset=''; el.style.boxShadow=''; el.classList.remove(HIGHLIGHT_CLASS);
    });
    if(typeof window.filterNews==='function') window.filterNews();
    try{ history.replaceState({}, '', location.pathname); }catch{}
    focusedLink=null; focusedSource=null; focusedId=null;
  }

  function getAssetId(url){
    try{
      const u=new URL(url);
      return u.searchParams.get('asset')||'';
    }catch{ 
      const m=url.match(/asset=(\d+)/);
      return m?m[1]:'';
    }
  }

  function normalizeLink(url){
    try{
      const u=new URL(url, location.href);
      u.hash='';
      return u.href.replace(/\\/$/,'').toLowerCase();
    }catch{
      return String(url||'').replace(/\\/$/,'').toLowerCase().trim();
    }
  }

  function findFocusedArticle(){
    if(!focusedLink) return null;
    const target=normalizeLink(focusedLink);
    const articles=document.querySelectorAll('.article');
    for(const el of articles){
      const a=el.querySelector('h2 a');
      if(a && normalizeLink(a.href)===target) return el;
    }
    return null;
  }

  function applyFocusMode(){
    const matchedEl=findFocusedArticle();
    if(!matchedEl) return false;

    const articles=document.querySelectorAll('.article');
    articles.forEach(el=>{
      const isMatch=el===matchedEl;
      el.style.display=isMatch?'':'none';
      el.classList.remove(HIGHLIGHT_CLASS);
      el.style.outline='';
      el.style.outlineOffset='';
      el.style.boxShadow='';
      el.style.borderRadius='';
      if(isMatch){
        el.classList.add(HIGHLIGHT_CLASS);
        el.style.outline='3px solid #0b5bd3';
        el.style.outlineOffset='4px';
        el.style.boxShadow='0 0 0 8px rgba(11,91,211,0.12), 0 12px 32px rgba(11,91,211,0.25)';
        el.style.borderRadius='12px';
      }
    });

    const total=window.allArticles?window.allArticles.length:articles.length;
    createFocusBanner(total);
    setTimeout(()=>matchedEl.scrollIntoView({behavior:'smooth', block:'center'}),100);
    console.log('[focus v8] Exact artikel gevonden', matchedEl.querySelector('h2')?.textContent?.slice(0,80));
    return true;
  }

  function showNotFound(){
    const articles=document.querySelectorAll('.article');
    articles.forEach(el=>{
      el.style.display='';
      el.classList.remove(HIGHLIGHT_CLASS);
      el.style.outline='';
      el.style.outlineOffset='';
      el.style.boxShadow='';
      el.style.borderRadius='';
    });
    const container=document.getElementById('news-container');
    if(!container) return;
    const old=document.getElementById('focus-banner'); if(old) old.remove();
    const banner=document.createElement('div');
    banner.id='focus-banner';
    banner.style.cssText='background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:12px 16px;margin:0 0 16px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
    banner.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#92400e;flex:1;">
        <span style="background:#f59e0b;color:white;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">⚠️</span>
        <span>Artikel niet in de huidige lijst – <a href="${focusedLink}" target="_blank" style="color:#0b5bd3;text-decoration:underline;">open bij bron</a></span>
      </div>
      <button id="btn-show-all" style="background:#0b5bd3;color:white;border:0;border-radius:8px;padding:10px 16px;font-weight:800;cursor:pointer;">Toon alle →</button>
    `;
    container.insertAdjacentElement('afterbegin', banner);
    document.getElementById('btn-show-all').onclick=()=>banner.remove();
  }

  function checkFocusParam(){
    const params=new URLSearchParams(location.search);
    const focus=params.get('focus');
    const highlight=params.get('highlight');
    const src=params.get('src');
    const id=params.get('id') || params.get('focusId');
    let targetLink=focus?decodeURIComponent(focus):null;
    if(!targetLink && highlight) targetLink=decodeURIComponent(highlight);
    if(!targetLink) return;

    focusedLink=targetLink;
    focusedSource=src?decodeURIComponent(src):null;
    focusedId=id?decodeURIComponent(id):(highlight?decodeURIComponent(highlight):null);
    if(focusedSource) ensureSourceEnabled(focusedSource);

    if(window._focusWaitTimer) clearInterval(window._focusWaitTimer);
    if(window._focusWaitTimeout) clearTimeout(window._focusWaitTimeout);

    let found=false;
    const started=Date.now();
    const tryFind=()=>{
      if(applyFocusMode()){ found=true; cleanup(); return; }
      if(Date.now()-started>=8000){ cleanup(); showNotFound(); }
    };
    const cleanup=()=>{
      if(window._focusWaitTimer){ clearInterval(window._focusWaitTimer); window._focusWaitTimer=null; }
      if(window._focusWaitTimeout){ clearTimeout(window._focusWaitTimeout); window._focusWaitTimeout=null; }
    };

    // Niet wachten op een globale 'loaded'-vlag: zodra het exacte artikel
    // door de normale renderer verschijnt, wordt het direct omlijnd.
    tryFind();
    if(!found){
      window._focusWaitTimer=setInterval(tryFind,150);
      window._focusWaitTimeout=setTimeout(()=>{ if(!found){ cleanup(); showNotFound(); } },8200);
    }
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message', e=>{
      if(e.data && (e.data.type==='NOTIFICATION_CLICK' || e.data.type==='PUSH_CLICKED')){
        const link=e.data.link || e.data.url || e.data.focusUrl;
        const src=e.data.source; const id=e.data.id || e.data.articleId;
        if(link){
          focusedLink=link; focusedSource=src; focusedId=id;
          if(src) ensureSourceEnabled(src);
          try{ const newUrl=`/?focus=${encodeURIComponent(link)}&src=${encodeURIComponent(src||'')}&id=${encodeURIComponent(id||'')}`; history.replaceState({}, '', newUrl); }catch{}
          setTimeout(()=>checkFocusParam(), 400);
        }
      }
    });
  }

  window.exitFocusMode=exitFocusMode;
  window.showOnlyFocusedArticle=applyFocusMode;
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(checkFocusParam, 100));
  window.addEventListener('load', ()=>setTimeout(checkFocusParam, 300));
})();
