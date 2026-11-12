'use strict';
(() => {
  const {api,esc,listen,fmt}=window.turnahead;
  const $=id=>document.getElementById(id);
  let selectedQueue=null;
  let overview=null;
  let currentTicket=null;
  let messageTimer;
  function notice(message,error=false){const n=$('notice');n.textContent=message;n.classList.toggle('error',error);n.hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>n.hidden=true,7000);}
  const show=(id,value)=>{$(id).hidden=!value;};
  async function checkSession(){
    try{const s=await api('/api/session');show('login-view',!s.authenticated);show('dashboard',s.authenticated);show('logout',s.authenticated);if(s.authenticated)await refresh();}
    catch{show('login-view',true);show('dashboard',false);}
  }
  async function refresh(){
    try{overview=await api('/api/reception/overview');render();}
    catch(e){if(e.message.includes('login')){show('login-view',true);show('dashboard',false);}else notice(e.message,true);}
  }
  function render(){
    const queues=overview.queues;
    $('facility-heading').textContent=`${overview.facility} · ${new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})}`;
    $('stat-waiting').textContent=queues.reduce((n,q)=>n+q.waiting,0);
    $('stat-active').textContent=queues.filter(q=>q.active).length;
    $('stat-completed').textContent=queues.reduce((n,q)=>n+q.served,0);
    if(!selectedQueue||!queues.some(q=>q.id===selectedQueue))selectedQueue=queues[0]?.id;
    $('queue-tabs').innerHTML=queues.map(q=>`<button class="queue-tab ${selectedQueue===q.id?'active':''}" data-queue="${esc(q.id)}" type="button">${esc(q.name)}</button>`).join('');
    $('queue-tabs').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{selectedQueue=btn.dataset.queue;render();}));
    const q=queues.find(q=>q.id===selectedQueue);
    if(q){
      const isServing=!!q.active;
      $('queue-detail').innerHTML=`<div class="queue-view"><div class="queue-topline"><div><strong>${esc(q.name)}</strong><small>Department ${esc(q.prefix)} · Today's walk-in queue</small></div><span class="state-pill ${q.paused?'paused':''}">${q.paused?'⏸ PAUSED':'● ACCEPTING'}</span></div><div class="serving-box"><div><span>NOW SERVING</span><strong>${esc(q.active?.code||'—')}</strong><small>${q.active?'Patient has been called':'No patient currently being served'}</small></div><span class="serving-symbol">↗</span></div><div class="queue-facts"><span><b>${q.waiting}</b> waiting</span><span><b>${q.served}</b> completed</span><span><b>${q.avgMinutes} min</b> average service</span></div><div class="queue-buttons"><button class="btn btn-primary" data-action="next" ${q.paused||isServing||!q.waiting?'disabled':''}>Call next ↗</button><button class="btn btn-positive" data-action="complete" ${!isServing?'disabled':''}>✓ Complete</button><button class="btn btn-danger" data-action="skip" ${!isServing?'disabled':''}>Skip</button><button class="btn btn-outline" data-action="${q.paused?'resume':'pause'}">${q.paused?'▶ Resume':'⏸ Pause'}</button></div><div class="queue-caption">To protect patients, public pages display ticket numbers only. Mark a called ticket as complete or skipped before calling the next person.</div></div>`;
      $('queue-detail').querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>perform(q.id,btn.dataset.action,btn)));
    }
    const list=overview.tickets;
    $('activity-count').textContent=`${list.length} recent`;
    $('recent-tickets').innerHTML=list.length?list.slice(0,14).map(t=>{const q=queues.find(q=>q.id===t.queue_id);return `<div class="activity-item"><div class="activity-token">${esc(t.code)}</div><div class="activity-main"><b>${esc(q?.name||'Service desk')}</b><small>${esc(fmt(t.created_at))}</small></div><span class="activity-state">${esc(t.status)}</span></div>`;}).join(''):'<div class="empty-state">No tickets issued yet. Create the first walk-in ticket to get started.</div>';
  }
  async function perform(id,action,button){
    button.disabled=true;
    try{const r=await api(`/api/queues/${encodeURIComponent(id)}/${action}`,{method:'POST',body:'{}'});const label=r.code?`${r.code} · `:'';notice(`${label}${action==='next'?'Called to reception':action==='complete'?'Marked complete':action==='skip'?'Skipped':action==='pause'?'Queue paused':'Queue resumed'}.`);await refresh();}
    catch(e){notice(e.message,true);await refresh();}
  }
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;$('login-error').textContent='';
    try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';await checkSession();}
    catch(error){$('login-error').textContent=error.message;}
    finally{button.disabled=false;}
  });
  $('logout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST',body:'{}'});await checkSession();}catch(e){notice(e.message,true);}});
  $('issue-ticket').addEventListener('click',async()=>{
    const q=overview?.queues.find(q=>q.id===selectedQueue);
    if(!q)return;
    const b=$('issue-ticket');b.disabled=true;
    try{currentTicket=await api(`/api/queues/${encodeURIComponent(q.id)}/tickets`,{method:'POST',body:'{}'});$('receipt-facility').textContent=overview.facility;$('receipt-code').textContent=currentTicket.code;$('receipt-queue').textContent=currentTicket.queue;$('receipt-qr').src=currentTicket.qrUrl;$('receipt-link').textContent=currentTicket.trackingUrl;show('ticket-modal',true);await refresh();}
    catch(e){notice(e.message,true);}finally{b.disabled=false;}
  });
  $('close-ticket').addEventListener('click',()=>show('ticket-modal',false));
  $('ticket-modal').addEventListener('click',e=>{if(e.target===$('ticket-modal'))show('ticket-modal',false);});
  $('print-button').addEventListener('click',()=>window.print());
  $('copy-button').addEventListener('click',async()=>{if(!currentTicket)return;try{await navigator.clipboard.writeText(currentTicket.trackingUrl);$('copy-button').textContent='Copied ✓';setTimeout(()=>$('copy-button').textContent='Copy tracking link',1800);}catch{notice('Copy unavailable. You can select the link shown on the receipt.',true);}});
  $('new-queue').addEventListener('click',()=>show('queue-modal',true));
  $('close-queue').addEventListener('click',()=>show('queue-modal',false));
  $('queue-modal').addEventListener('click',e=>{if(e.target===$('queue-modal'))show('queue-modal',false);});
  $('queue-form').addEventListener('submit',async e=>{e.preventDefault();const name=$('queue-name').value.trim();try{const q=await api('/api/queues',{method:'POST',body:JSON.stringify({name})});selectedQueue=q.id;$('queue-name').value='';show('queue-modal',false);notice(`${q.name} has been created.`);await refresh();}catch(err){notice(err.message,true);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){show('ticket-modal',false);show('queue-modal',false);}});
  listen(()=>{if(!document.hidden)refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&overview)refresh();});
  checkSession();
})();