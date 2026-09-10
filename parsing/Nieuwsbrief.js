
export function parseNieuwsbrief(json){
  try{
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const items = data.items || data.articles || data || [];
    return items.map(it=>{
      const title = it.title || it.subject || 'Nieuwsbrief';
      const link = it.link || it.url || 'https://nieuwommen.leeuw008.nl/';
      let pubDate = new Date();
      if(it.pubDate || it.date){ const d=new Date(it.pubDate||it.date); if(!isNaN(d.getTime())) pubDate=d; }
      const desc = it.description || it.body || title;
      return {title: title.slice(0,120), link, pubDate, description: desc.slice(0,200)+' [...]'};
    }).slice(0,10);
  }catch(e){ return []; }
}
