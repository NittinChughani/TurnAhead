import { configured, auth, helpfulError } from './firebase.js';
import { facility, observeAuth, login, logout, authorized, bootstrap, rollOverAll,
  observeQueues, observeTickets, issueTicket, createQueue, performAction } from './store.js';
import { dayKey } from './queue-engine.js';

const {esc,fmt}=window.turnahead;
const $=id=>document.getElementById(id);
let selectedQueue=null,queues=[],tickets=[],currentTicket=null,messageTimer;
let stopQueues=null,stopTickets=null,unsubAuth=null;
const show=(id,value)=>{$(id).hidden=!value;};
function notice(message,error=false){const n=$('notice');n.textContent=message;n.classList.toggle('error',error);n.hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>n.hidden=true,7000);}
function loginError(message){show('login-view',true);show('dashboard',false);$('login-error').textContent=message;}
function stopSubscriptions(){stopQueues?.();stopTickets?.();stopQueues=null;stopTickets=null;}
function render(){
  $('facility-heading').textContent=`${facility} · ${new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})}`;
  $('stat-waiting').textContent=queues.reduce((n,q)=>n+q.waiting,0);
  $('stat-active').textContent=queues.filter(q=>q.active).length;
  $('stat-completed').textContent=queues.reduce((n,q)=>n+(q.served||0),0);
  if(!selectedQueue||!queues.some(q=>q.id===selectedQueue))selectedQueue=queues[0]?.id;
  $('queue-tabs').innerHTML=queues.map(q=>`<button class="queue-tab ${selectedQueue===q.id?'active':''}" data-queue="${esc(q.id)}" type="button">${esc(q.name)}</button>`).join('');
  $('queue-tabs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{selectedQueue=b.dataset.queue;render();}));
  const q=queues.find(q=>q.id===selectedQueue);
  $('issue-ticket').disabled=!q || !!q?.paused;
  if(q){
    const active=!!q.active;
    $('queue-detail').innerHTML=`<div class="queue-view"><div class="queue-topline"><div><strong>${esc(q.name)}</strong><small>Department ${esc(q.prefix)} · Today's walk-in queue</small></div><span class="state-pill ${q.paused?'paused':''}">${q.paused?'⏸ PAUSED':'● ACCEPTING'}</span></div><div class="serving-box"><div><span>NOW SERVING</span><strong>${esc(q.active?.code||'—')}</strong><small>${active?'Patient has been called':'No patient currently being served'}</small></div><span class="serving-symbol">↗</span></div><div class="queue-facts"><span><b>${q.waiting}</b> waiting</span><span><b>${q.served}</b> completed</span><span><b>${q.avgMinutes} min</b> average service</span></div><div class="queue-buttons"><button class="btn btn-primary" data-action="next" ${q.paused||active||!q.waiting?'disabled':''}>Call next ↗</button><button class="btn btn-positive" data-action="complete" ${!active?'disabled':''}>✓ Complete</button><button class="btn btn-danger" data-action="skip" ${!active?'disabled':''}>Skip</button><button class="btn btn-outline" data-action="${q.paused?'resume':'pause'}">${q.paused?'▶ Resume':'⏸ Pause'}</button></div><div class="queue-caption">Public pages show token numbers only. Complete or skip the current ticket before calling the next person.</div></div>`;
    $('queue-detail').querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>action(q.id,b.dataset.action,b)));
  }else $('queue-detail').innerHTML='<div class="empty-state">No department configured yet.</div>';
  const latest=tickets.filter(t=>t.dayKey===dayKey());
  $('activity-count').textContent=`${latest.length} recent`;
  $('recent-tickets').innerHTML=latest.length?latest.slice(0,14).map(t=>`<div class="activity-item"><div class="activity-token">${esc(t.code)}</div><div class="activity-main"><b>${esc(t.queueName||'Service desk')}</b><small>${esc(fmt(t.createdAt))}</small></div><span class="activity-state">${esc(t.status)}</span></div>`).join(''):'<div class="empty-state">No tickets today. Create the first walk-in ticket to get started.</div>';
}
async function action(id,kind,button){button.disabled=true;try{const r=await performAction(id,kind);notice(`${r.code?r.code+' · ':''}${{next:'Called to reception',complete:'Marked complete',skip:'Skipped',pause:'Queue paused',resume:'Queue resumed'}[kind]}.`);}catch(e){notice(helpfulError(e),true);}finally{button.disabled=false;}}
async function startDashboard(){
  stopSubscriptions();await bootstrap();await rollOverAll();
  show('login-view',false);show('dashboard',true);show('logout',true);$('login-error').textContent='';
  stopQueues=observeQueues(data=>{queues=data;render();},e=>notice(helpfulError(e),true));
  stopTickets=observeTickets(data=>{tickets=data;render();},e=>notice(helpfulError(e),true));
}
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.target.querySelector('button[type="submit"]');b.disabled=true;$('login-error').textContent='';
  try{await login($('email').value.trim(),$('password').value);$('password').value='';}
  catch(err){loginError(helpfulError(err));}
  finally{b.disabled=false;}
});
$('logout').addEventListener('click',async()=>{stopSubscriptions();await logout();});
$('issue-ticket').addEventListener('click',async()=>{
  const q=queues.find(x=>x.id===selectedQueue);if(!q)return;
  const b=$('issue-ticket');b.disabled=true;
  try{
    currentTicket=await issueTicket(q.id);
    $('receipt-facility').textContent=facility;$('receipt-code').textContent=currentTicket.code;
    $('receipt-queue').textContent=currentTicket.queue;
    $('receipt-qr').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(window.turnaheadQR.svg(currentTicket.trackingUrl));
    $('receipt-link').textContent=currentTicket.trackingUrl;
    show('ticket-modal',true);
  }catch(err){notice(helpfulError(err),true);}finally{b.disabled=false;}
});
$('close-ticket').addEventListener('click',()=>show('ticket-modal',false));
$('ticket-modal').addEventListener('click',e=>{if(e.target===$('ticket-modal'))show('ticket-modal',false);});
$('print-button').addEventListener('click',()=>window.print());
$('copy-button').addEventListener('click',async()=>{if(!currentTicket)return;try{await navigator.clipboard.writeText(currentTicket.trackingUrl);$('copy-button').textContent='Copied ✓';setTimeout(()=>$('copy-button').textContent='Copy tracking link',1800);}catch{notice('Copy unavailable; select the link shown on the receipt.',true);}});
$('new-queue').addEventListener('click',()=>show('queue-modal',true));
$('close-queue').addEventListener('click',()=>show('queue-modal',false));
$('queue-modal').addEventListener('click',e=>{if(e.target===$('queue-modal'))show('queue-modal',false);});
$('queue-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.target.querySelector('button[type="submit"]');b.disabled=true;
  try{const q=await createQueue($('queue-name').value);selectedQueue=q.id;$('queue-name').value='';show('queue-modal',false);notice(`${q.name} has been created.`);}catch(err){notice(helpfulError(err),true);}finally{b.disabled=false;}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){show('ticket-modal',false);show('queue-modal',false);}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden && auth?.currentUser)rollOverAll().catch(e=>notice(helpfulError(e),true));});
if(!configured){loginError('Connect Firebase first: follow the setup instructions in the GitHub README. No patient data is being stored yet.');}
else {
  $('login-error').textContent='';show('login-view',true);
  unsubAuth=observeAuth(async user=>{
    if(!user){stopSubscriptions();show('login-view',true);show('dashboard',false);show('logout',false);return;}
    try{if(!await authorized(user)){stopSubscriptions();await logout();loginError('Your Firebase account is not approved for reception. Add staff/{your UID} with active: true in Firestore.');return;}
      await startDashboard();
    }catch(e){loginError(helpfulError(e));}
  });
}
