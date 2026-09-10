function parseNieuwsbriefECHT(json){
  try{
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const items = data.items || data.articles || data || [];
    return items.map(it=>{
      const title = it.title || it.subject || 'Nieuwsbrief';
      const link = it.link || it.url || 'https://nieuwommen.leeuw008.nl/';
      let pubDate = new Date();
      if(it.pubDate || it.date || it.updated){ const d=new Date(it.pubDate||it.date||it.updated); if(!isNaN(d.getTime())) pubDate=d; }
      const desc = it.description || it.body || it.excerpt || title;
      return {title: title.slice(0,120), link, pubDate, description: desc.slice(0,200)+' [...]', source:'Nieuwsbrief', id:'Nieuwsbrief'};
    }).slice(0,10);
  }catch(e){ console.log('parse nieuwsbrief fail', e.message); return []; }
}

export function parseNieuwsbrief(json){
  return parseNieuwsbriefECHT(json);
}
