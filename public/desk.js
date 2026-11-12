import {configured, auth, helpfulError} from './firebase.js';
import {observeAuth, login, register, logout, requestVerification, refreshVerification,
  myMemberships, getHospital, createHospital, findInvitation, acceptInvitation, watchMembership} from './org-store.js';
import {canManageStaff, canManageDepartments, boardLink} from './org-model.js';
import {bootstrap, rollOverAll, observeQueues, observeTickets,
  issueTicket, createQueue, performAction} from './store.js';
import {dayKey} from './queue-engine.js';

const {esc,fmt}=window.turnahead, $=id=>document.getElementById(id);
const views=['login-view','register-view','verify-view','onboarding-view','invite-view','dashboard'];
let inviteId=new URLSearchParams(location.search).get('invite');
let currentHospital=null,currentMember=null,memberships=[],queues=[],tickets=[],selectedQueue=null,currentTicket=null;
let stopQueues=null,stopTickets=null,stopMember=null,authEpoch=0,toastTimer,noticeTimer;
let pendingSignIn=false,pendingSignOut=false,registration=false,inviteData=null,invitedHospital=null;
const show=(id,visible)=>$(id).hidden=!visible;
function view(name){views.forEach(v=>show(v,v===name));show('logout',Boolean(auth?.currentUser));show('workspace-switch',name==='dashboard'&&memberships.length>1);show('public-board-link',name==='dashboard');show('admin-link',name==='dashboard'&&canManageStaff(currentMember?.role));window.scrollTo(0,0);}
function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);show('toast',true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),4600);}
function notice(message,error=false){const el=$('notice');el.textContent=message;el.classList.toggle('error',error);show('notice',true);clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>show('notice',false),6000);}
function stopSubscriptions(){stopQueues?.();stopTickets?.();stopMember?.();stopQueues=stopTickets=stopMember=null;}
function refreshRole(){show('new-queue',canManageDepartments(currentMember?.role));show('admin-link',canManageStaff(currentMember?.role));$('role-chip').textContent=(currentMember?.role||'receptionist').toUpperCase();}
function render(){
  if(!currentHospital)return;
  $('facility-heading').textContent=`${currentHospital.name} · ${new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})}`;
  $('stat-waiting').textContent=queues.reduce((n,q)=>n+q.waiting,0);
  $('stat-active').textContent=queues.filter(q=>q.active).length;
  $('stat-completed').textContent=queues.reduce((n,q)=>n+(q.served||0),0);
  if(!selectedQueue||!queues.some(q=>q.id===selectedQueue))selectedQueue=queues[0]?.id;
  $('queue-tabs').innerHTML=queues.map(q=>`<button class="queue-tab ${selectedQueue===q.id?'active':''}" data-queue="${esc(q.id)}" type="button">${esc(q.name)}</button>`).join('');
  $('queue-tabs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{selectedQueue=b.dataset.queue;render();}));
  const q=queues.find(q=>q.id===selectedQueue);
  $('issue-ticket').disabled=!q||!!q?.paused;
  if(q){
    const active=!!q.active;
    $('queue-detail').innerHTML=`<div class="queue-view"><div class="queue-topline"><div><strong>${esc(q.name)}</strong><small>Department ${esc(q.prefix)} · Today's walk-in queue</small></div><span class="state-pill ${q.paused?'paused':''}">${q.paused?'⏸ PAUSED':'● ACCEPTING'}</span></div><div class="serving-box"><div><span>NOW SERVING</span><strong>${esc(q.active?.code||'—')}</strong><small>${active?'Patient has been called':'No patient currently being served'}</small></div><span class="serving-symbol">↗</span></div><div class="queue-facts"><span><b>${q.waiting}</b> waiting</span><span><b>${q.served}</b> completed</span><span><b>${q.avgMinutes} min</b> average service</span></div><div class="queue-buttons"><button class="btn btn-primary" data-action="next" ${q.paused||active||!q.waiting?'disabled':''}>Call next ↗</button><button class="btn btn-positive" data-action="complete" ${!active?'disabled':''}>✓ Complete</button><button class="btn btn-danger" data-action="skip" ${!active?'disabled':''}>Skip</button><button class="btn btn-outline" data-action="${q.paused?'resume':'pause'}">${q.paused?'▶ Resume':'⏸ Pause'}</button></div><div class="queue-caption">Public pages display token numbers only. Complete or skip the current ticket before calling the next visitor.</div></div>`;
    $('queue-detail').querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>action(q.id,b.dataset.action,b)));
  }else $('queue-detail').innerHTML='<div class="empty-state">No department yet. Ask your hospital administrator to create one.</div>';
  const latest=tickets.filter(t=>t.dayKey===dayKey());
  $('activity-count').textContent=`${latest.length} recent`;
  $('recent-tickets').innerHTML=latest.length?latest.slice(0,14).map(t=>`<div class="activity-item"><div class="activity-token">${esc(t.code)}</div><div class="activity-main"><b>${esc(t.queueName||'Service desk')}</b><small>${esc(fmt(t.createdAt))}</small></div><span class="activity-state">${esc(t.status)}</span></div>`).join(''):'<div class="empty-state">No tickets today. Create the first walk-in ticket to get started.</div>';
}
async function action(id,kind,button){button.disabled=true;try{const r=await performAction(currentHospital.id,id,kind);notice(`${r.code?r.code+' · ':''}${{next:'Called to reception',complete:'Marked complete',skip:'Skipped',pause:'Queue paused',resume:'Queue resumed'}[kind]}.`);}catch(e){notice(helpfulError(e),true);}finally{button.disabled=false;}}
async function openHospital(member){
  stopSubscriptions();currentMember=member;currentHospital=await getHospital(member.hospitalId);
  localStorage.setItem('turnahead-hospital',member.hospitalId);
  $('public-board-link').href=boardLink(member.hospitalId,location.href);
  $('admin-link').href='./admin.html?hospital='+encodeURIComponent(member.hospitalId);
  $('workspace-switch').innerHTML=memberships.map(m=>`<option value="${esc(m.hospitalId)}" ${m.hospitalId===member.hospitalId?'selected':''}>${esc(m.hospitalName||m.hospitalId)}</option>`).join('');
  refreshRole();
  queues=[];tickets=[];selectedQueue=null;render();view('dashboard');
  stopMember=watchMembership(member.hospitalId,auth.currentUser.uid,updated=>{
    if(!updated?.active){toast('Your access to this hospital has been disabled.',true);stopSubscriptions();currentHospital=null;routeCurrentUser();return;}
    currentMember=updated;refreshRole();
  },e=>toast(helpfulError(e),true));
  if(canManageDepartments(member.role))await bootstrap(member.hospitalId);
  await rollOverAll(member.hospitalId);
  stopQueues=observeQueues(member.hospitalId,data=>{queues=data;render();},e=>notice(helpfulError(e),true));
  stopTickets=observeTickets(member.hospitalId,data=>{tickets=data;render();},e=>notice(helpfulError(e),true));
}
async function routeCurrentUser(){
  const seq=++authEpoch;
  stopSubscriptions();currentHospital=null;currentMember=null;
  const user=auth?.currentUser;
  if(!user){memberships=[];view('login-view');if(pendingSignOut){toast('You have been signed out successfully.');pendingSignOut=false;}return;}
  show('logout',true);
  try{
    if(!user.emailVerified){$('verify-detail').textContent=`We sent a verification link to ${user.email}. Open the email, confirm your address, then return here.`;view('verify-view');return;}
    memberships=await myMemberships(user);if(seq!==authEpoch)return;
    const names=await Promise.all(memberships.map(m=>getHospital(m.hospitalId).catch(()=>({name:'Unknown hospital'}))));
    if(seq!==authEpoch)return;
    memberships=memberships.map((m,i)=>({...m,hospitalName:names[i].name}));
    const pendingInvite=/^[A-Za-z0-9]{20}$/.test(inviteId||'')?inviteId:null;
    if(pendingInvite && !memberships.some(m=>m.hospitalId===pendingInvite)){
      try{
        [invitedHospital,inviteData]=await Promise.all([getHospital(pendingInvite),findInvitation(pendingInvite,user.email)]);
        if(seq!==authEpoch)return;
        const active=inviteData?.status==='pending'&&inviteData.expiresAt?.toMillis()>Date.now();
        $('invite-detail').textContent=active?`${invitedHospital.name} invited ${user.email} as ${inviteData.role}. This workspace will remain separate from all other hospitals.`:'No active invitation matches this verified email. Ask your hospital administrator for a new invitation.';
        show('accept-invite',active);view('invite-view');return;
      }catch(e){$('invite-detail').textContent=helpfulError(e);show('accept-invite',false);view('invite-view');return;}
    }
    if(!memberships.length){view('onboarding-view');return;}
    const preferred=pendingInvite||localStorage.getItem('turnahead-hospital');
    const chosen=memberships.find(m=>m.hospitalId===preferred)||memberships[0];
    if(seq!==authEpoch)return;
    await openHospital(chosen);
  }catch(e){if(seq!==authEpoch)return;toast(helpfulError(e),true);view('onboarding-view');}
  finally{if(pendingSignIn){toast('Logged in successfully. Welcome back!');pendingSignIn=false;}}
}
$('show-register').addEventListener('click',()=>view('register-view'));
$('back-to-login').addEventListener('click',()=>view('login-view'));
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;$('login-error').textContent='';pendingSignIn=true;
  try{await login($('email').value,$('password').value);$('password').value='';}
  catch(err){pendingSignIn=false;$('login-error').textContent=helpfulError(err);}
  finally{b.disabled=false;}
});
$('register-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;$('register-error').textContent='';
  try{const r=await register($('register-email').value,$('register-password').value);$('register-password').value='';await requestVerification(r.user);toast('Account created! Check your inbox to verify your email.');}
  catch(err){$('register-error').textContent=helpfulError(err);}
  finally{b.disabled=false;}
});
$('verify-send').addEventListener('click',async()=>{try{await requestVerification();toast('Verification email sent. Check your inbox.');}catch(e){toast(helpfulError(e),true);}});
$('verify-refresh').addEventListener('click',async()=>{try{if(await refreshVerification())await routeCurrentUser();else toast('Email is not verified yet. Please open the link in your inbox.',true);}catch(e){toast(helpfulError(e),true);}});
$('hospital-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;$('hospital-error').textContent='';
  try{const hospital=await createHospital($('hospital-name').value);localStorage.setItem('turnahead-hospital',hospital.id);await routeCurrentUser();toast(`${hospital.name} is ready. You are its administrator.`);}
  catch(err){$('hospital-error').textContent=helpfulError(err);}finally{b.disabled=false;}
});
$('accept-invite').addEventListener('click',async()=>{
  const b=$('accept-invite');b.disabled=true;
  try{const h=await acceptInvitation(inviteId);history.replaceState(null,'','./desk.html');inviteId=null;localStorage.setItem('turnahead-hospital',h.id);await routeCurrentUser();toast(`Welcome to ${h.name}! Your staff access is active.`);}
  catch(e){toast(helpfulError(e),true);}finally{b.disabled=false;}
});
$('skip-invite').addEventListener('click',()=>{history.replaceState(null,'','./desk.html');inviteId=null;if(memberships.length)openHospital(memberships[0]).catch(e=>toast(helpfulError(e),true));else view('onboarding-view');});
$('workspace-switch').addEventListener('change',e=>{
  const m=memberships.find(x=>x.hospitalId===e.target.value);
  if(m)openHospital(m).catch(err=>toast(helpfulError(err),true));
});
$('logout').addEventListener('click',async()=>{
  pendingSignOut=true;try{stopSubscriptions();await logout();}catch(e){pendingSignOut=false;toast(helpfulError(e),true);}
});
$('issue-ticket').addEventListener('click',async()=>{
  const q=queues.find(x=>x.id===selectedQueue);if(!q||!currentHospital)return;
  const b=$('issue-ticket');b.disabled=true;
  try{
    currentTicket=await issueTicket(currentHospital.id,q.id);
    $('receipt-facility').textContent=currentHospital.name;$('receipt-code').textContent=currentTicket.code;
    $('receipt-queue').textContent=currentTicket.queue;
    $('receipt-qr').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(window.turnaheadQR.svg(currentTicket.trackingUrl));
    $('receipt-link').textContent=currentTicket.trackingUrl;show('ticket-modal',true);
  }catch(err){notice(helpfulError(err),true);}finally{b.disabled=false;}
});
$('close-ticket').addEventListener('click',()=>show('ticket-modal',false));
$('ticket-modal').addEventListener('click',e=>{if(e.target===$('ticket-modal'))show('ticket-modal',false);});
$('print-button').addEventListener('click',()=>window.print());
$('copy-button').addEventListener('click',async()=>{if(!currentTicket)return;try{await navigator.clipboard.writeText(currentTicket.trackingUrl);$('copy-button').textContent='Copied ✓';setTimeout(()=>$('copy-button').textContent='Copy tracking link',1800);}catch{notice('Copy unavailable. Select the link shown on the receipt.',true);}});
$('new-queue').addEventListener('click',()=>{if(canManageDepartments(currentMember?.role))show('queue-modal',true);});
$('close-queue').addEventListener('click',()=>show('queue-modal',false));
$('queue-modal').addEventListener('click',e=>{if(e.target===$('queue-modal'))show('queue-modal',false);});
$('queue-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;
  try{const q=await createQueue(currentHospital.id,$('queue-name').value);selectedQueue=q.id;$('queue-name').value='';show('queue-modal',false);notice(`${q.name} has been created.`);}catch(err){notice(helpfulError(err),true);}finally{b.disabled=false;}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){show('ticket-modal',false);show('queue-modal',false);}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentHospital)rollOverAll(currentHospital.id).catch(e=>notice(helpfulError(e),true));});
if(!configured){$('login-error').textContent='Firebase is not configured yet. See the repository setup guide.';view('login-view');}
else observeAuth(()=>routeCurrentUser());
