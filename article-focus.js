// article-focus.js v6 - DEFINITIEF: push -> omlijnd artikel in app (niet extern)
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

  function applyFocusMode(){
    if(!focusedLink) return false;
    const articles=document.querySelectorAll('.article');
    if(articles.length===0) return false;

    const normFocus=decodeURIComponent(focusedLink).toLowerCase().trim();
    const focusAsset=getAssetId(focusedLink);
    const focusHost=(()=>{ try{ return new URL(focusedLink).hostname.toLowerCase(); }catch{ return ''; } })();
    const focusPath=(()=>{ try{ return new URL(focusedLink).pathname.toLowerCase(); }catch{ return ''; } })();

    let found=false; let matchedEl=null;

    articles.forEach(el=>{
      const linkEl=el.querySelector('h2 a');
      if(!linkEl){ el.style.display='none'; return; }
      const href=linkEl.href;
      const normHref=href.toLowerCase();
      const hrefAsset=getAssetId(href);
      const hrefHost=(()=>{ try{ return new URL(href).hostname.toLowerCase(); }catch{ return ''; } })();

      let isMatch=false;
      // Exact
      if(href===focusedLink || normHref===normFocus) isMatch=true;
      // Asset ID match (RTV Vechtdal)
      if(!isMatch && focusAsset && hrefAsset && focusAsset===hrefAsset) isMatch=true;
      // ID contains
      if(!isMatch && focusedId){
        const nid=decodeURIComponent(focusedId).toLowerCase();
        if(nid.length>5 && (normHref.includes(nid) || normFocus.includes(nid))) isMatch=true;
      }
      // Same host + path
      if(!isMatch && focusHost && hrefHost && focusHost===hrefHost){
        try{
          const uF=new URL(focusedLink); const uH=new URL(href);
          if(uF.pathname===uH.pathname && uF.search===uH.search) isMatch=true;
          else if(uF.pathname!=='/' && uH.pathname.includes(uF.pathname)) isMatch=true;
          else if(uH.pathname!=='/' && uF.pathname.includes(uH.pathname)) isMatch=true;
        }catch{}
      }

      if(isMatch){
        el.style.display=''; el.classList.add(HIGHLIGHT_CLASS);
        el.style.outline='3px solid #0b5bd3'; el.style.outlineOffset='4px';
        el.style.boxShadow='0 0 0 8px rgba(11,91,211,0.12), 0 12px 32px rgba(11,91,211,0.25)';
        el.style.borderRadius='12px';
        if(!matchedEl) matchedEl=el;
        found=true;
      }else{
        el.style.display='none';
      }
    });

    // Fallback: bron
    if(!found && focusedSource){
      const srcLower=focusedSource.toLowerCase();
      let matches=[];
      articles.forEach(el=>{
        const sm=el.querySelector('small');
        if(sm && sm.textContent.toLowerCase().includes(srcLower)) matches.push(el);
      });
      if(matches.length>0){
        matches.forEach((el,i)=>{
          if(i===0){
            el.style.display=''; el.classList.add(HIGHLIGHT_CLASS);
            el.style.outline='3px solid #0b5bd3'; el.style.outlineOffset='4px';
            el.style.boxShadow='0 0 0 8px rgba(11,91,211,0.12), 0 12px 32px rgba(11,91,211,0.25)';
            el.style.borderRadius='12px';
            matchedEl=el;
          }else el.style.display='none';
        });
        found=true;
      }
    }

    if(found && matchedEl){
      const total=window.allArticles?window.allArticles.length:articles.length;
      createFocusBanner(total);
      setTimeout(()=>matchedEl.scrollIntoView({behavior:'smooth', block:'center'}), 300);
      console.log('[focus v6] Gevonden', matchedEl.querySelector('h2')?.textContent?.slice(0,50));
      return true;
    }

    console.log('[focus v6] Geen match voor', focusedLink, 'asset', focusAsset);
    // Toon gele banner met externe link knop, maar verberg niet alles
    articles.forEach(el=>{ el.style.display=''; el.classList.remove(HIGHLIGHT_CLASS); el.style.outline=''; el.style.boxShadow=''; });
    const container=document.getElementById('news-container');
    if(container){
      const old=document.getElementById('focus-banner'); if(old) old.remove();
      const banner=document.createElement('div');
      banner.id='focus-banner';
      banner.style.cssText='background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:12px 16px;margin:0 0 16px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
      banner.innerHTML=`
        <div style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:#92400e;flex:1;">
          <span style="background:#f59e0b;color:white;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">⚠️</span>
          <span>Artikel niet in lijst – <a href="${focusedLink}" target="_blank" style="color:#0b5bd3;text-decoration:underline;">open bij bron</a></span>
        </div>
        <button id="btn-show-all" style="background:#0b5bd3;color:white;border:0;border-radius:8px;padding:10px 16px;font-weight:800;cursor:pointer;">Toon alle →</button>
      `;
      container.insertAdjacentElement('afterbegin', banner);
      document.getElementById('btn-show-all').onclick=()=>{ banner.remove(); };
    }
    return false;
  }

  function checkFocusParam(){
    const params=new URLSearchParams(location.search);
    const focus=params.get('focus');
    const highlight=params.get('highlight');
    const src=params.get('src');
    const id=params.get('id');
    let targetLink=focus?decodeURIComponent(focus):null;
    if(!targetLink && highlight) targetLink=decodeURIComponent(highlight);
    if(!targetLink) return;
    focusedLink=targetLink;
    focusedSource=src?decodeURIComponent(src):null;
    focusedId=id?decodeURIComponent(id):(highlight?decodeURIComponent(highlight):null);
    if(focusedSource) ensureSourceEnabled(focusedSource);
    let tries=0;
    const iv=setInterval(()=>{
      tries++;
      const hasArt=document.querySelectorAll('.article').length>0;
      const loaded=window.allArticles && window.allArticles.length>0;
      if((hasArt && loaded) || tries>80){
        clearInterval(iv);
        if(!applyFocusMode() && tries<80) setTimeout(()=>applyFocusMode(), 800);
      }
    }, 300);
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message', e=>{
      if(e.data && e.data.type==='NOTIFICATION_CLICK'){
        const link=e.data.link || e.data.url || e.data.focusUrl;
        const src=e.data.source; const id=e.data.id;
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
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(checkFocusParam, 600));
  window.addEventListener('load', ()=>setTimeout(checkFocusParam, 1200));
})();
