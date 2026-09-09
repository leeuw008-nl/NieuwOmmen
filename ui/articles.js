
function formatDate(d){
  if(!d || isNaN(d.getTime()) || d.getTime()===0) return '';
  return d.toLocaleDateString('nl-NL',{day:'numeric', month:'short'})+' '+d.toLocaleTimeString('nl-NL',{hour:'2-digit', minute:'2-digit'});
}
export function renderArticles(allArticles, state){
  const c=document.getElementById('news-container'); if(!c) return;
  const filtered = allArticles.filter(a=>{ const s=state[a.id]; return s && s.aan; }).sort((a,b)=>b.pubDate-a.pubDate);
  c.innerHTML = `<div class="articles-count">${filtered.filter(a=>!a.isFallback).length} artikelen - ${filtered.length} geladen</div>` + filtered.map(a=>{
    if(a.isFallback) return `<div class="article fallback"><h2><a href="${a.link}" target="_blank">${a.source}</a></h2><div>${a.description}</div></div>`;
    return `<div class="article"><h2><a href="${a.link}" target="_blank">${a.title}</a></h2><small>${a.source} - ${formatDate(a.pubDate)}</small><div>${a.description}</div></div>`;
  }).join('');
}
