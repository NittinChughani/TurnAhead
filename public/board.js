'use strict';
(()=>{
  const {api,esc,listen}=window.turnahead;
  let initialized=false;
  async function refresh(){
    try{
      const data=await api('/api/public/queues');
      document.getElementById('board-facility').textContent=`${data.facility} · Live queue overview`;
      document.getElementById('board-grid').innerHTML=data.queues.map(q=>`<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>${q.paused?'PAUSED':'LIVE'}</span></div><div class="board-card-middle"><small>NOW SERVING</small><strong>${esc(q.active?.code||'—')}</strong></div><div class="board-card-bottom"><span>People waiting</span><b>${q.waiting}</b></div></article>`).join('')||'<div class="empty-state">No service queues configured.</div>';
      initialized=true;
    }catch{if(!initialized)document.getElementById('board-grid').innerHTML='<div class="empty-state">Unable to connect. Please refresh this page.</div>';}
  }
  listen(refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(()=>{if(!document.hidden)refresh();},30000);
  refresh();
})();