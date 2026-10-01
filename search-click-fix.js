// search-click-fix v1 - klik in zoekveld mag de bronselectie niet openen
(function(){
  function init(){
    const input=document.getElementById('search-input');
    if(!input) return;
    input.addEventListener('click',e=>e.stopPropagation());
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
