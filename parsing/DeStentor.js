
export function parseDeStentor(xml){
  const items=[]; const re=/<item>[\s\S]*?<title><!\[CDATA\[([^\]]+)\]\]>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<pubDate>([^<]+)<\/pubDate>[\s\S]*?<\/item>/gi;
  let m; while((m=re.exec(xml))!==null && items.length<25){ let pd=new Date(m[3]); items.push({title:m[1].trim(), link:m[2].trim(), pubDate:isNaN(pd)?new Date():pd, description:m[1].trim()+' [...]'}); }
  if(items.length===0){
    const re2=/<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/gi;
    while((m=re2.exec(xml))!==null && items.length<25){ items.push({title:m[1].trim(), link:m[2].trim(), pubDate:new Date(), description:m[1].trim()+' [...]'}); }
  }
  return items;
}
