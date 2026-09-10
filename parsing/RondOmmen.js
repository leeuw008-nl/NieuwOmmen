
export function parseRondOmmen(xml){
  const items=[]; const re=/<item>[\s\S]*?<title><!\[CDATA\[([^\]]+)\]\]>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/gi;
  let m; while((m=re.exec(xml))!==null && items.length<20){ items.push({title:m[1].trim(), link:m[2].trim(), pubDate:new Date(), description:m[1].trim()+' [...]'}); }
  return items;
}
