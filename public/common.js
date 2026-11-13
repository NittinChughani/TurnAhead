'use strict';
(function () {
  const stored = localStorage.getItem('turnahead-theme');
  const theme = stored === 'dark' || stored === 'light' ? stored : (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  document.documentElement.dataset.theme=theme;
  document.querySelectorAll('[data-theme-toggle]').forEach(btn=>{
    btn.setAttribute('aria-pressed', String(theme==='dark'));
    btn.addEventListener('click',()=>{
      const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
      document.documentElement.dataset.theme=next;
      localStorage.setItem('turnahead-theme',next);
      document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.setAttribute('aria-pressed',String(next==='dark')));
    });
  });
})();
window.turnahead = {
  esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));},
  fmt(date){if(!date)return '—';return new Date(date).toLocaleTimeString('en-PK',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit'});}
};
