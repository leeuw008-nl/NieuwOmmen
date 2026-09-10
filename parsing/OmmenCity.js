
export function parseOmmenCity(xml){
  const items=[];
  let m;
  const patterns=[
    /<item>[\s\S]*?<title><!\[CDATA\[([^\]]+)\]\]>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/gi,
    /<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/gi,
    /<entry>[\s\S]*?<title[^>]*>([^<]+)<\/title>[\s\S]*?<link[^>]+href="([^"]+)"[\s\S]*?<\/entry>/gi
  ];
  for(const re of patterns){
    while((m=re.exec(xml))!==null && items.length<10){
      const title=m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim();
      let link=m[2].trim();
      if(title.length>4) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
    }
    if(items.length>0) break;
  }
  return items;
}
