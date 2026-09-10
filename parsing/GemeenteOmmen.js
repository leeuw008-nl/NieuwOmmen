
export function parseGemeenteOmmen(html){
  const items=[];
  let m;
  // Nieuwe gemeente site gebruikt articles
  const patterns=[
    /<a[^>]+href="([^"]+)"[^>]*>[^<]*<h[2-3][^>]*>([^<]{8,200})<\/h[23]>/gi,
    /<h[2-3][^>]*>\s*<a href="([^"]+)"[^>]*>([^<]{8,200})<\/a>/gi,
    /<article[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>([^<]{8,200})<\/a>/gi
  ];
  const seen=new Set();
  for(const re of patterns){
    while((m=re.exec(html))!==null && items.length<10){
      let link=m[1]; let title=m[2].replace(/<[^>]*>/g,'').trim();
      if(link.startsWith('/')) link='https://www.ommen.nl'+link;
      if(!link.includes('ommen.nl')) continue;
      if(seen.has(link)) continue; seen.add(link);
      if(title.length>8) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
    }
    if(items.length>=5) break;
  }
  return items;
}
