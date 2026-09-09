
export async function enrichOostInApp(arts, fetchViaWorker){
  const out=[];
  for(const a of arts.slice(0,6)){
    try{
      const html = await fetchViaWorker(a.link);
      let og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
      if(!og) og = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      if(og && og[1] && og[1].length>30){
        let d = og[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').trim();
        if(d.length>180) d=d.slice(0,177)+' [...]'; else d=d+' [...]';
        out.push({...a, description:d});
      } else {
        out.push({...a, description: a.title + ' - Lees het volledige artikel op RTV Oost voor meer achtergrond, reacties en updates uit Overijssel [...]'});
      }
    }catch{
      out.push({...a, description: a.title + ' - Lees het volledige artikel op RTV Oost voor meer achtergrond, reacties en updates uit Overijssel [...]'});
    }
  }
  return [...out, ...arts.slice(6)];
}
