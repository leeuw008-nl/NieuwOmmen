
export function parseVechtdalCentraal(html){
  const items=[]; const seen=new Set();
  let re=/<h[2-3] class="entry-title[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi; let m;
  while((m=re.exec(html))!==null && items.length<25){
    let link=m[1]; if(link.startsWith('/')) link='https://www.vechtdalcentraal.nl'+link;
    if(seen.has(link)) continue; seen.add(link);
    const title=m[2].replace(/&#8217;/g,"'").replace(/&amp;/g,"&").trim();
    if(title.length>4) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
  }
  if(items.length>0) return items;
  const patterns=[
    /<h2[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]{8,200})<\/a>\s*<\/h2>/gi,
    /<article[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi
  ];
  for(const pat of patterns){
    let mm; while((mm=pat.exec(html))!==null && items.length<25){
      let link=mm[1]; if(link.startsWith('/')) link='https://www.vechtdalcentraal.nl'+link;
      if(seen.has(link)) continue; seen.add(link);
      let title=mm[2].replace(/<[^>]*>/g,'').trim();
      if(title.length>8) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
    }
    if(items.length>5) break;
  }
  return items;
}
