
export function parseOudOmmen(xml){
  const items=[]; const re=/<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<pubDate>([^<]+)<\/pubDate>/gi;
  let m; while((m=re.exec(xml))!==null && items.length<10){ let pd=new Date(m[3]); items.push({title:m[1].trim(), link:m[2].trim(), pubDate:isNaN(pd)?new Date():pd, description:m[1].trim()+' [...]'}); }
  return items;
}
