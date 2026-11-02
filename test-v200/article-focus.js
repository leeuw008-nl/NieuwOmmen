// article-focus.js v200 - deep link ?open=
function handlePushDeepLink(){
  try{
    const params = new URLSearchParams(window.location.search);
    const openUrl = params.get('open');
    if(!openUrl) return;
    let tries=0;
    const tryScroll=()=>{
      tries++;
      const articles = window.getAllArticles ? window.getAllArticles() : [];
      if(articles.length===0 && tries<40){ setTimeout(tryScroll, 500); return; }
      const targetLink = decodeURIComponent(openUrl);
      const divs=document.querySelectorAll('.article');
      for(const div of divs){
        const a=div.querySelector('h2 a');
        if(a && (a.href===targetLink || a.href===openUrl || targetLink.includes(a.href) || a.href.includes(targetLink))){
          div.scrollIntoView({behavior:'smooth', block:'center'});
          div.style.outline='4px solid #0a7a3d'; div.style.outlineOffset='4px';
          setTimeout(()=>{ div.style.outline=''; div.style.outlineOffset=''; }, 5000);
          break;
        }
      }
      history.replaceState({},'', window.location.pathname);
    };
    setTimeout(tryScroll, 800);
  }catch(e){ console.error('deep-link error', e); }
}
handlePushDeepLink();
document.addEventListener('DOMContentLoaded', ()=> setTimeout(handlePushDeepLink, 1000));
