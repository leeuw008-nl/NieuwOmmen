
export function parseNatuurlijkOmmen(xml){
  const items=[];
  let m;
  const re=/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?<\/title>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/gi;
  while((m=re.exec(xml))!==null && items.length<10){
    const title=m[1].trim(); const link=m[2].trim();
    const desc=m[3].replace(/<[^>]*>/g,' ').trim().slice(0,180);
    items.push({title, link, pubDate:new Date(), description:(desc||title)+' [...]'});
  }
  if(items.length===0){
    const re2=/<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<link>([^<]+)<\/link>/gi;
    while((m=re2.exec(xml))!==null && items.length<10){
      items.push({title:m[1].trim(), link:m[2].trim(), pubDate:new Date(), description:m[1].trim()+' [...]'});
    }
  }
  return items;
}
