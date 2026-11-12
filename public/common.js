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
  async api(url, options={}) {
    const response=await fetch(url,{cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
    const json=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(json.error||`Request failed (${response.status})`);
    return json;
  },
  esc(value) {return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));},
  listen(refresh) { const ev=new EventSource('/api/events');ev.addEventListener('change',refresh);return ev; },
  fmt(date){if(!date)return '—';return new Date(date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
};