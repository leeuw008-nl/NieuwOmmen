
export function updateSourceLeds(BRONNEN, allArticles, loadedSources){
  try{
    BRONNEN.forEach(b=>{
      const led=document.querySelector(`.source-led[data-id="${b.id}"]`);
      if(!led) return;
      const real = allArticles.filter(a=>a.id===b.id && !a.isFallback);
      const loaded = loadedSources.has(b.id);
      led.className='source-led '+( !loaded?'loading' : real.length>0?'ok' : 'fail');
    });
  }catch{}
}
