'use strict';
(function () {
  let stored=null;try{stored=localStorage.getItem('turnahead-v4-preview-theme');}catch{}
  const theme = stored === 'dark' || stored === 'light' ? stored : (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  document.documentElement.dataset.theme=theme;
  document.querySelectorAll('[data-theme-toggle]').forEach(btn=>{
    btn.setAttribute('aria-pressed', String(theme==='dark'));
    btn.addEventListener('click',()=>{
      const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
      document.documentElement.dataset.theme=next;
      try{localStorage.setItem('turnahead-v4-preview-theme',next);}catch{}
      document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.setAttribute('aria-pressed',String(next==='dark')));
    });
  });
})();
window.turnahead = {
  esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));},
  fmt(date){if(!date)return '—';return new Date(date).toLocaleTimeString('en-PK',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit'});}
};


// Floating navigation is visible at the top, slides away once the visitor scrolls.
// A focused keyboard control remains accessible even if the page is scrolled.
(function enableFloatingNavigation(){
  const header=document.querySelector('.site-header');
  if(!header)return;
  let pending=false;
  const update=()=>{
    pending=false;
    header.classList.toggle('nav-scrolled-away',window.scrollY>Math.max(70,header.offsetHeight));
  };
  window.addEventListener('scroll',()=>{
    if(!pending){pending=true;requestAnimationFrame(update);}
  },{passive:true});
  window.addEventListener('pageshow',update);
  window.addEventListener('resize',update,{passive:true});
  update();
})();

