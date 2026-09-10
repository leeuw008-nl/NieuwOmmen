
export function parseRTVVechtdal(html){
  const items=[];
  const now=new Date();
  const reFull=/<div class="allmode_date">([^<]+)<\/div>[\s\S]{0,800}?<h[2-3] class="allmode_title"><a href="([^"]+)">([^<]+)<\/a>[\s\S]{0,800}?<div class="allmode_(?:intro|text|introtext)[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while((m=reFull.exec(html))!==null && items.length<20){
    const dparts=m[1].split('-');
    let pd=new Date(now);
    if(dparts.length===3){
      const d=new Date(parseInt(dparts[2]), parseInt(dparts[1])-1, parseInt(dparts[0]), now.getHours(), now.getMinutes(), now.getSeconds());
      if(!isNaN(d.getTime())) pd=d;
    }
    let link=m[2].replace(/&amp;/g,'&');
    if(!link.startsWith('http')) link='https://www.rtvvechtdal.nl'+(link.startsWith('/')?'':'/')+link;
    let intro=m[4].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,200)+' [...]';
    items.push({title:m[3].trim(), link, pubDate:pd, description:intro});
  }
  if(items.length===0){
    const re2=/<div class="allmode_date">([^<]+)<\/div>[\s\S]{0,500}?<h[2-3] class="allmode_title"><a href="([^"]+)">([^<]+)<\/a>/gi;
    while((m=re2.exec(html))!==null && items.length<15){
      let link=m[2]; if(!link.startsWith('http')) link='https://www.rtvvechtdal.nl'+link;
      items.push({title:m[3].trim(), link, pubDate:new Date(), description:m[3].trim()+' [...]'});
    }
  }
  return items;
}
