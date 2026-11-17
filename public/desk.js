import {configured, auth, helpfulError} from './firebase.js';
import {observeAuth, login, logout, requestVerification, refreshVerification,
  myMemberships, getHospital, watchMembership,updateOwnProfilePhoto} from './org-store.js';
import {canManageStaff, canManageDepartments, boardLink, isStaffRole, staffGreeting} from './org-model.js';
import {bootstrap, rollOverAll, observeQueues, observeTickets,
  issueTicket, createQueue, performAction,recallMissedTicket} from './store.js';
import {dayKey,patientDisplayName,getDoctorLane,doctorActiveCodes,ticketStatusLabel} from './queue-engine.js';
import {watchDoctors} from './doctors.js';
import {doctorAvailable} from './doctor-model.js';
import {avatarContents,compressProfilePhoto} from './profile-photo.js';
import {bindLanguage,t} from './locale.js?v=2.6.1';
import {recallEligibility,graceMinutes} from './v26-engine.js';

const {esc,fmt}=window.turnahead, $=id=>document.getElementById(id);
const views=['login-view','verify-view','no-access-view','dashboard'];
// Old v2.1 invitation URLs continue through the dedicated activation screen.
if(new URLSearchParams(location.search).has('invite')) location.replace('./activate.html'+location.search);
let currentHospital=null,currentMember=null,memberships=[],queues=[],tickets=[],selectedQueue=null,currentTicket=null;
let doctors=[],stopDoctors=null,selectedDoctor=null,selectedCounter=1;
let stopQueues=null,stopTickets=null,stopMember=null,authEpoch=0,toastTimer,noticeTimer;
let pendingSignIn=false,pendingSignOut=false;
const loginButton=$('login-form').querySelector('[type=submit]');
const loginOriginal=loginButton.textContent;
function loadingLogin(busy){loginButton.disabled=busy;loginButton.classList.toggle('is-loading',busy);loginButton.textContent=busy?'Signing in…':loginOriginal;}
const show=(id,visible)=>$(id).hidden=!visible;
function view(name){if(name!=='login-view')loadingLogin(false);views.forEach(v=>show(v,v===name));show('logout',Boolean(auth?.currentUser));show('workspace-switch',name==='dashboard'&&memberships.filter(m=>isStaffRole(m.role)).length>1);show('public-board-link',name==='dashboard');show('staff-greeting',name==='dashboard'&&Boolean(currentMember));show('admin-link',name==='dashboard'&&canManageStaff(currentMember?.role));window.scrollTo(0,0);}
function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);show('toast',true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),4600);}
function notice(message,error=false){const el=$('notice');el.textContent=message;el.classList.toggle('error',error);show('notice',true);clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>show('notice',false),6000);}
function stopSubscriptions(){stopQueues?.();stopTickets?.();stopMember?.();stopDoctors?.();stopQueues=stopTickets=stopMember=stopDoctors=null;doctors=[];
  if(!currentHospital){tickets=[];$('recent-tickets').replaceChildren();}}
function refreshRole(){show('new-queue',canManageDepartments(currentMember?.role));show('admin-link',canManageStaff(currentMember?.role));$('role-chip').textContent=(currentMember?.role||'receptionist').toUpperCase();$('staff-greeting-name').textContent=currentMember?staffGreeting(currentMember):'';if(currentMember){const photo=avatarContents(currentMember,esc);$('staff-nav-avatar').innerHTML=photo;$('staff-profile-avatar').innerHTML=photo;}}
function render(){
  if(!currentHospital)return;
  $('facility-heading').textContent=`${currentHospital.name} · ${new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})}`;
  $('stat-waiting').textContent=queues.reduce((n,q)=>n+q.waiting,0);
  $('stat-active').textContent=queues.reduce((n,q)=>n+(q.activeCount||0),0);
  $('stat-completed').textContent=queues.reduce((n,q)=>n+(q.served||0),0);
  if(!selectedQueue||!queues.some(q=>q.id===selectedQueue)){selectedQueue=queues[0]?.id;selectedDoctor=null;}
  $('queue-tabs').innerHTML=queues.map(q=>`<button class="queue-tab ${selectedQueue===q.id?'active':''}" data-queue="${esc(q.id)}" type="button">${esc(q.name)}</button>`).join('');
  $('queue-tabs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{selectedQueue=b.dataset.queue;selectedDoctor=null;render();}));
  const q=queues.find(q=>q.id===selectedQueue);
  $('issue-ticket').disabled=!q||!!q?.paused;
  if(q){
    const available=doctors.filter(d=>d.departmentId===q.id);
    if(!selectedDoctor||!available.some(d=>d.id===selectedDoctor))selectedDoctor=available.find(d=>d.active)?.id||available[0]?.id||null;
    const d=available.find(d=>d.id===selectedDoctor),lane=d?getDoctorLane(q,d.id):null;
    const active=Boolean(lane?.active),paused=Boolean(q.paused||lane?.paused);
    const belongsHere=active&&lane.active.counter===`Counter ${selectedCounter}`;
    const doctorList=available.map(doc=>{
      const ln=getDoctorLane(q,doc.id);
      return `<button type="button" class="doctor-tab ${selectedDoctor===doc.id?'selected':''}" data-doctor-queue="${esc(doc.id)}"><span>${esc(doc.name)}</span><small>${ln.waitingNumbers.length} waiting · ${doc.active?'Available':'Inactive'}${ln.paused?' · On break':''}</small></button>`;
    }).join('');
    const detail=d?`<div class="doctor-queue-heading"><div><span class="kicker">DOCTOR-SPECIFIC QUEUE</span><h3>Dr. ${esc(d.name)}</h3><small>${esc(d.roomNumber?'Room '+d.roomNumber:'Room assigned on each ticket')}</small></div><span class="state-pill ${paused?'paused':''}">${paused?'⏸ ON BREAK':d.active?'● ACCEPTING':'INACTIVE'}</span></div><div class="serving-box"><div><span>NOW SERVING</span><strong>${esc(lane.active?.code||'—')}</strong><small>${active?`Called from ${esc(lane.active.counter||'reception')}`:'No patient currently being served'}</small></div><span class="serving-symbol">↗</span></div><div class="queue-facts"><span><b>${lane.waitingNumbers.length}</b> waiting for this doctor</span><span><b>${lane.served||0}</b> completed</span><span><b>${lane.avgMinutes||8} min</b> average</span></div><div class="queue-buttons"><button class="btn btn-primary" data-action="next" ${paused||active||!lane.waitingNumbers.length||!d.active?'disabled':''}>Call next ↗</button><button class="btn btn-positive" data-action="complete" ${!belongsHere?'disabled':''}>✓ Complete</button><button class="btn btn-danger" data-action="skip" ${!belongsHere?'disabled':''}>Skip</button><button class="btn btn-outline" data-action="${lane.paused?'resume':'pause'}" ${q.paused?'disabled':''}>${lane.paused?'▶ Resume':'⏸ Doctor break'}</button></div><p class="queue-caption">${active&&!belongsHere?`This patient belongs to ${esc(lane.active.counter)}. Select that counter to finish the ticket.`:'Each doctor has an independent FIFO line. Actions are committed atomically across reception counters.'}</p></div>`:'<div class="empty-state">No doctors registered in this department. Ask the administrator to add a doctor.</div>';
    $('queue-detail').innerHTML=`<div class="queue-view"><div class="queue-topline"><div><strong>${esc(q.name)}</strong><small>${esc(q.prefix)} · ${q.waiting} waiting across ${available.length} doctors</small></div><span class="state-pill ${q.paused?'paused':''}">${q.paused?'⏸ DEPARTMENT PAUSED':'● LIVE'}</span></div><button type="button" class="btn btn-small btn-outline" data-action="${q.paused?'resume-department':'pause-department'}">${q.paused?'▶ Resume department':'⏸ Pause department'}</button><div class="doctor-tabs" role="group" aria-label="Select doctor queue">${doctorList||'<p class="queue-caption">No doctors added yet.</p>'}</div>${detail}</div>`;
    $('queue-detail').querySelectorAll('[data-doctor-queue]').forEach(btn=>btn.addEventListener('click',()=>{selectedDoctor=btn.dataset.doctorQueue;render();}));
    $('queue-detail').querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>action(q.id,selectedDoctor,btn.dataset.action,btn)));
  }else $('queue-detail').innerHTML='<div class="empty-state">No department yet. Ask your hospital administrator to create one.</div>';
  const latest=tickets.filter(t=>t.dayKey===dayKey());
  renderV26();
  $('activity-count').textContent=`${latest.length} recent`;
  $('recent-tickets').innerHTML=latest.length?latest.slice(0,14).map(t=>`<div class="activity-item"><div class="activity-token">${esc(t.code)}</div><div class="activity-main"><b>${esc(t.patientName||'Older ticket')} · ${esc(t.queueName||'Service desk')}</b><small>Dr. ${esc(t.doctorName||'—')} · ${esc(fmt(t.createdAt))}${t.calledCounter?' · '+esc(t.calledCounter):''}</small></div><span class="activity-state">${esc(ticketStatusLabel(t))}</span></div>`).join(''):'<div class="empty-state">No tickets today. Create the first walk-in ticket to get started.</div>';
}
function renderV26(){
  if(!currentHospital)return;
  const minutes=graceMinutes(currentHospital.recallGraceMinutes);
  const missed=tickets.filter(x=>x.dayKey===dayKey()&&recallEligibility(x,Date.now(),minutes,dayKey()).ok);
  $('missed-list').innerHTML=missed.length?missed.map(x=>`<div class="v26-mini-item"><div><strong>${esc(x.code)} · ${esc(x.patientName)}</strong><small>Dr. ${esc(x.doctorName||'—')} · ${esc(x.queueName||'—')} · missed ${esc(fmt(x.finishedAt))} · ${minutes}-minute grace</small></div><button type="button" class="btn btn-small btn-outline" data-recall="${esc(x.id)}">${esc(t('recall'))}</button></div>`).join(''):`<div class="empty-state">${esc(t('noMissed'))}</div>`;
}
$('missed-list').addEventListener('click',async e=>{
  const b=e.target.closest('[data-recall]');if(!b||!currentHospital)return;
  const ticket=tickets.find(x=>x.id===b.dataset.recall);if(!ticket)return;
  b.disabled=true;
  try{const result=await recallMissedTicket(currentHospital.id,ticket.queueId,ticket.id);notice(`${result.code} recalled to the END of the doctor queue.`,false);}
  catch(err){notice(helpfulError(err),true);}finally{b.disabled=false;}
});
bindLanguage(()=>render());
async function action(id,doctorId,kind,button){
  const label=button.textContent;
  button.disabled=true;button.textContent='Updating…';
  try{const r=await performAction(currentHospital.id,id,kind,doctorId,selectedCounter);
    notice(`${r.code?r.code+' · ':''}${{next:'Called from '+r.counter,complete:'Marked complete',skip:'Skipped',pause:'Doctor on break',resume:'Doctor resumed','pause-department':'Department paused','resume-department':'Department resumed'}[kind]}.`);
  }catch(e){notice(helpfulError(e),true);}finally{button.textContent=label;button.disabled=false;}
}
$('counter-select').addEventListener('change',e=>{
  selectedCounter=Number(e.target.value);
  if(currentHospital)localStorage.setItem('turnahead-counter-'+currentHospital.id,String(selectedCounter));
  render();
});
async function openHospital(member){
  stopSubscriptions();currentMember=member;currentHospital=await getHospital(member.hospitalId);
  localStorage.setItem('turnahead-hospital',member.hospitalId);
  $('public-board-link').href=boardLink(member.hospitalId,location.href);
  $('admin-link').href='./admin.html?hospital='+encodeURIComponent(member.hospitalId);
  $('workspace-switch').innerHTML=memberships.filter(m=>isStaffRole(m.role)).map(m=>`<option value="${esc(m.hospitalId)}" ${m.hospitalId===member.hospitalId?'selected':''}>${esc(m.hospitalName||m.hospitalId)}</option>`).join('');
  refreshRole();
  selectedCounter=Number(localStorage.getItem('turnahead-counter-'+member.hospitalId))||1;
  if(selectedCounter<1||selectedCounter>12)selectedCounter=1;
  $('counter-select').value=String(selectedCounter);
  queues=[];tickets=[];selectedQueue=null;selectedDoctor=null;render();view('dashboard');show('v26-operations',true);
  stopMember=watchMembership(member.hospitalId,auth.currentUser.uid,updated=>{
    if(!updated?.active){toast('Your access to this hospital has been disabled.',true);stopSubscriptions();currentHospital=null;routeCurrentUser();return;}
    currentMember=updated;refreshRole();
  },e=>toast(helpfulError(e),true));
  // Subscribe first: patients and reception see updates without waiting on daily maintenance.
  stopQueues=observeQueues(member.hospitalId,data=>{queues=data;render();},e=>notice(helpfulError(e),true));
  stopTickets=observeTickets(member.hospitalId,data=>{tickets=data;render();},e=>notice(helpfulError(e),true),100);
  stopDoctors=watchDoctors(member.hospitalId,data=>{doctors=data;refreshDoctorChoices();render();},e=>notice(helpfulError(e),true));
  // Maintenance happens asynchronously and is idempotent.
  (async()=>{if(canManageDepartments(member.role))await bootstrap(member.hospitalId);await rollOverAll(member.hospitalId);})().catch(e=>notice(helpfulError(e),true));
}
async function routeCurrentUser(){
  const seq=++authEpoch;
  stopSubscriptions();show('v26-operations',false);currentHospital=null;currentMember=null;
  const user=auth?.currentUser;
  if(!user){memberships=[];view('login-view');if(pendingSignOut){toast('You have been signed out successfully.');pendingSignOut=false;}return;}
  show('logout',true);
  try{
    if(!user.emailVerified){$('verify-detail').textContent=`We sent a verification link to ${user.email}. Open the email, confirm your address, then return here.`;view('verify-view');return;}
    memberships=await myMemberships(user);if(seq!==authEpoch)return;
    // Resolve only the selected hospital before showing the dashboard; other names are not blocking login.
    if(!memberships.some(m=>isStaffRole(m.role))){
      // Account login is NOT authorization. Never expose operational data to an unregistered email.
      $('no-access-detail').textContent='You are not registered as authorized hospital staff. Ask your hospital administrator to add your work email.';
      view('no-access-view');pendingSignIn=false;return;
    }
    const preferred=localStorage.getItem('turnahead-hospital');
    const chosen=memberships.find(m=>m.hospitalId===preferred&&isStaffRole(m.role))||memberships.find(m=>isStaffRole(m.role));
    if(seq!==authEpoch)return;
    await openHospital(chosen);
  }catch(e){if(seq!==authEpoch)return;toast(helpfulError(e),true);view('no-access-view');}
  finally{if(pendingSignIn && currentHospital){toast('Logged in successfully. Welcome back!');pendingSignIn=false;}if(!currentHospital)loadingLogin(false);}
}
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();if(loginButton.disabled)return;
  loadingLogin(true);$('login-error').textContent='';pendingSignIn=true;
  try{await login($('email').value,$('password').value);$('password').value='';}
  catch(err){pendingSignIn=false;loadingLogin(false);
    const invalid=String(err?.code||'').includes('auth/invalid-credential');
    $('login-error').textContent=invalid?'You are not registered for staff access or these credentials are incorrect. Ask your hospital administrator to confirm your account.':helpfulError(err);
  }
});
$('verify-send').addEventListener('click',async()=>{try{await requestVerification();toast('Verification email sent. Check your inbox.');}catch(e){toast(helpfulError(e),true);}});
$('verify-refresh').addEventListener('click',async()=>{try{if(await refreshVerification())await routeCurrentUser();else toast('Email is not verified yet. Please open the link in your inbox.',true);}catch(e){toast(helpfulError(e),true);}});
$('access-signout').addEventListener('click',async()=>{try{await logout();}catch(e){toast(helpfulError(e),true);}});
$('workspace-switch').addEventListener('change',e=>{
  const m=memberships.find(x=>x.hospitalId===e.target.value);
  if(m&&isStaffRole(m.role))openHospital(m).catch(err=>toast(helpfulError(err),true));
});
$('logout').addEventListener('click',async()=>{
  pendingSignOut=true;try{stopSubscriptions();await logout();}catch(e){pendingSignOut=false;toast(helpfulError(e),true);}
});
function refreshDoctorChoices(){
  const selector=$('patient-doctor'),current=selector.value;
  const selectedDepartment=queues.find(q=>q.id===selectedQueue);
  const choices=doctors.filter(d=>doctorAvailable(d,selectedQueue)&&!selectedDepartment?.paused&&!selectedDepartment?.lanes?.[d.id]?.paused);
  selector.innerHTML='<option value="">Select the doctor</option>'+choices.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}${d.roomNumber?' · Room '+esc(d.roomNumber):''}</option>`).join('');
  if(choices.some(d=>d.id===current))selector.value=current;
  else if(choices.some(d=>d.id===selectedDoctor))selector.value=selectedDoctor;
  $('doctor-help').textContent=choices.length?'Select the available doctor the patient is visiting.':'No available doctor in this department. Ask reception to resume the paused queue, or an administrator to add an active doctor.';
}
$('patient-doctor').addEventListener('change',()=>{const d=doctors.find(x=>x.id===$('patient-doctor').value);if(d?.roomNumber)$('patient-room').value=d.roomNumber;});
$('issue-ticket').addEventListener('click',()=>{
  if(!queues.some(x=>x.id===selectedQueue)||!currentHospital)return;
  $('patient-name').value='';$('patient-room').value='';$('patient-gender').value='';refreshDoctorChoices();show('issue-modal',true);$('patient-name').focus();
});
$('issue-form').addEventListener('submit',async e=>{
  e.preventDefault();const q=queues.find(x=>x.id===selectedQueue);if(!q||!currentHospital)return;
  const b=e.target.querySelector('[type=submit]');b.disabled=true;b.classList.add('is-loading');
  try{
    currentTicket=await issueTicket(currentHospital.id,q.id,$('patient-name').value,{patientGender:$('patient-gender').value,doctorId:$('patient-doctor').value,roomNumber:$('patient-room').value,counterNumber:selectedCounter});
    $('receipt-facility').textContent=currentHospital.name;$('receipt-code').textContent=currentTicket.code;
    $('receipt-patient').textContent=patientDisplayName(currentTicket);
    $('receipt-visit').textContent=`Dr. ${currentTicket.doctorName} · Room ${currentTicket.roomNumber}`;
    $('receipt-queue').textContent=currentTicket.queue;
    $('receipt-counter').textContent=`Issued at Counter ${selectedCounter}`;
    $('receipt-issued').textContent=`${new Date(currentTicket.createdAt).toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Karachi'})} PKT`;
    $('receipt-qr').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(window.turnaheadQR.svg(currentTicket.trackingUrl));
    $('receipt-link').textContent=currentTicket.trackingUrl;
    show('issue-modal',false);show('ticket-modal',true);
  }catch(err){notice(helpfulError(err),true);}finally{b.disabled=false;b.classList.remove('is-loading');}
});
$('close-issue').addEventListener('click',()=>show('issue-modal',false));
$('issue-modal').addEventListener('click',e=>{if(e.target===$('issue-modal'))show('issue-modal',false);});
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'){show('ticket-modal',false);show('queue-modal',false);show('issue-modal',false);}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentHospital)rollOverAll(currentHospital.id).catch(e=>notice(helpfulError(e),true));});
let lastSeenDay=dayKey();
setInterval(()=>{const today=dayKey();if(today!==lastSeenDay){lastSeenDay=today;if(currentHospital)rollOverAll(currentHospital.id).catch(e=>notice(helpfulError(e),true));}},15000);
if(!configured){$('login-error').textContent='Firebase is not configured yet. See the repository setup guide.';view('login-view');}
else observeAuth(()=>routeCurrentUser());

$('staff-profile-file').addEventListener('change',async e=>{
 if(!currentHospital||!currentMember)return;const file=e.target.files?.[0];if(!file)return;
 e.target.disabled=true;try{const photo=await compressProfilePhoto(file);await updateOwnProfilePhoto(currentHospital.id,photo);notice('Profile photo saved.');}
 catch(err){notice(helpfulError(err),true);}finally{e.target.value='';e.target.disabled=false;}
});
$('staff-profile-remove').addEventListener('click',async()=>{
 if(!currentHospital)return;try{await updateOwnProfilePhoto(currentHospital.id,'');notice('Profile photo removed.');}
 catch(err){notice(helpfulError(err),true);}
});
