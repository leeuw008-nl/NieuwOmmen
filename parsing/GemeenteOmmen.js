
export function parseGemeenteOmmen(html){
  const items=[]; const re=/<a[^>]+href="([^"]+)"[^>]*class="[^"]*nieuws[^"]*"[^>]*>[\s\S]*?<h[23][^>]*>([^<]{8,150})<\/h[23]>/gi;
  let m; while((m=re.exec(html))!==null && items.length<15){
    let link=m[1]; if(link.startsWith('/')) link='https://www.ommen.nl'+link;
    items.push({title:m[2].trim(), link, pubDate:new Date(), description:m[2].trim()+' [...]'});
  }
  if(items.length===0){
    const re2=/<article[\s\S]*?<a href="([^"]+)"[^>]*>([^<]{10,150})<\/a>/gi;
    while((m=re2.exec(html))!==null && items.length<15){
      let link=m[1]; if(link.startsWith('/')) link='https://www.ommen.nl'+link;
      items.push({title:m[2].trim(), link, pubDate:new Date(), description:m[2].trim()+' [...]'});
    }
  }
  return items;
}
