
export function parseRondOmmen(xml){
  const items=[];
  let m;
  const re=/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/title>[\s\S]*?<link>([^<]+)<\/link>/gi;
  while((m=re.exec(xml))!==null && items.length<20){
    const title=m[1].replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&#8217;/g,"'").trim();
    let link=m[2].trim();
    if(title.length>5) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
  }
  return items;
}
