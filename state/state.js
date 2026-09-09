
export function loadState(BRONNEN){
  try{
    const v2 = localStorage.getItem('nieuwsommen_bronnen_v2');
    if(v2){
      const s = JSON.parse(v2);
      BRONNEN.forEach(b=>{ if(!s[b.id]) s[b.id]={aan:true, vandaag:false, scope:'gemeente'}; });
      return s;
    }
  }catch{}
  const s={}; BRONNEN.forEach(b=>s[b.id]={aan:true, vandaag:false, scope:'gemeente'}); return s;
}
export function saveState(state){ localStorage.setItem('nieuwsommen_bronnen_v2', JSON.stringify(state)); }
