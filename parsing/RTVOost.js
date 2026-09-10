
export function parseRTVOost(html){
  const items=[]; let m;
  const reReal=/<div[^>]*publishedAt=["']([^"']+)["'][^>]*>[\s\S]*?<a[^>]+href=["'](\/nieuws\/(?!zwolle|twente|enschede|vechtdal|salland|kop-van-ove)[^"']*)["'][^>]*>[\s\S]*?<span[^>]*>([^<]{2,30})<\/span>[\s\S]*?<h[2-3][^>]*>([^<]{10,200})<\/h[2-3]>/gi;
  while((m=reReal.exec(html))!==null && items.length<25){
    let dateStr=m[1]; let link=m[2]; if(link.startsWith('/')) link='https://www.oost.nl'+link;
    let category=m[3].trim().toUpperCase(); let title=m[4].trim();
    if(['ALLE NIEUWS','ZWOLLE','TWENTE'].includes(title.toUpperCase())) continue;
    let pd=new Date(dateStr); if(isNaN(pd.getTime())) pd=new Date();
    let finalTitle = ['NIEUWS','112','ECONOMIE','SPORT'].includes(category) ? category+': '+title : title;
    if(!items.find(x=>x.link===link)) items.push({title:finalTitle, link, pubDate:pd, description:title+' [...]'});
  }
  if(items.length>0){ items.sort((a,b)=>b.pubDate-a.pubDate); return items; }
  const reBlock=/<a[^>]+href=["'](\/nieuws\/(?!zwolle|twente|enschede|vechtdal|salland|kop-van-overijssel)[^"']{10,150})["'][^>]*>([\s\S]*?)<\/a>/gi;
  let blockMatch; while((blockMatch=reBlock.exec(html))!==null && items.length<20){
    let link=blockMatch[1]; if(link.startsWith('/')) link='https://www.oost.nl'+link;
    let inner=blockMatch[2]; let titleMatch=inner.match(/<h[2-3][^>]*>([^<]{10,200})<\/h[2-3]>/i); let title=titleMatch?titleMatch[1].trim():'';
    if(!title) continue;
    if(!items.find(x=>x.link===link)) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
  }
  items.sort((a,b)=>b.pubDate-a.pubDate);
  return items;
}
