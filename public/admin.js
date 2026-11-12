import {configured,auth,helpfulError} from './firebase.js';
import {observeAuth,login,logout,refreshVerification,requestVerification,myMemberships,getHospital,
  watchHospitalMembers,watchInvitations,inviteStaff,revokeInvitation,updateStaff,renameHospital} from './org-store.js';
import {observeQueues,observeTickets,createQueue} from './store.js';
import {canChangeRole,normalizeEmail,invitationLink,boardLink} from './org-model.js';
import {dayKey} from './queue-engine.js';
const $=id=>document.getElementById(id),esc=window.turnahead.esc,fmt=window.turnahead.fmt;
let hospital=null,me=null,members=[],invites=[],departments=[],tickets=[],unsubs=[],toastTimer,authEpoch=0,pendingLogin=false,pendingLogout=false;
const show=(id,value)=>$(id).hidden=!value;
function toast(message,error=false){const el=$('admin-toast');el.textContent=message;el.classList.toggle('error',error);show('admin-toast',true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('admin-toast',false),4800);}
function stop(){unsubs.forEach(fn=>fn());unsubs=[];hospital=null;me=null;}
function displayMetrics(){
  const active=departments.filter(q=>q.dayKey===dayKey());
  const waiting=active.reduce((n,q)=>n+q.waiting,0),inService=active.filter(q=>q.active).length;
  const completed=active.reduce((n,q)=>n+q.served,0);
  const avg=active.length?Math.round(active.reduce((n,q)=>n+q.avgMinutes,0)/active.length):0;
  $('admin-waiting').textContent=waiting;
  $('admin-serving').textContent=inService;
  $('admin-completed').textContent=completed;
  $('admin-average').textContent=active.length?String(avg):'—';
  $('staff-count').textContent=members.filter(x=>x.active).length;
  $('department-count').textContent=departments.length;
  $('invite-count').textContent=invites.filter(x=>x.status==='pending'&&x.expiresAt?.toMillis()>Date.now()).length;
}
function renderTickets(){
  const current=tickets.filter(t=>t.dayKey===dayKey());
  $('patient-ticket-count').textContent=`Latest ${current.length} today · live`;
  $('patient-ticket-list').innerHTML=current.length?current.map(t=>`<div class="admin-person"><span class="activity-token">${esc(t.code)}</span><div class="person-info"><strong>${esc(t.queueName||'Department')}</strong><small>Issued ${esc(fmt(t.createdAt))}</small></div><span class="activity-state">${esc(t.status)}</span></div>`).join(''):'<div class="empty-state">No anonymous queue tickets in the recent sample today.</div>';
}
function renderMembers(){
  $('staff-list').innerHTML=members.length?members.map(m=>{
    const isOwner=m.role==='owner',self=m.uid===auth.currentUser?.uid;
    const editable=canChangeRole(me.role,m.role,m.role==='owner'?'receptionist':m.role==='admin'?'supervisor':m.role)&&!self;
    const options=['supervisor','receptionist'];
    return `<div class="admin-person"><div class="person-avatar" aria-hidden="true">${esc(m.email?.[0]||'?').toUpperCase()}</div><div class="person-info"><strong>${esc(m.email)}</strong><small>${isOwner?'Designated hospital administrator':m.active?'Approved staff':'Access disabled'}</small></div><div class="person-actions">${isOwner?'<span class="role-chip">ADMINISTRATOR</span>':`<label class="visually-hidden" for="role-${esc(m.uid)}">Role for ${esc(m.email)}</label><select class="admin-role-select" id="role-${esc(m.uid)}" data-role-for="${esc(m.uid)}" ${editable?'':'disabled'}>${m.role==='admin'?'<option value="admin" disabled selected>Legacy admin</option>':''}${options.map(r=>`<option value="${r}" ${m.role===r?'selected':''}>${r==='supervisor'?'Supervisor':'Receptionist'}</option>`).join('')}</select><button class="btn btn-small btn-outline" type="button" data-toggle-for="${esc(m.uid)}" ${editable?'':'disabled'}>${m.active?'Disable':'Enable'}</button>`}</div></div>`;
  }).join(''):'<div class="empty-state">No staff registered yet.</div>';
  $('staff-list').querySelectorAll('[data-role-for]').forEach(el=>el.addEventListener('change',async()=>{
    const m=members.find(x=>x.uid===el.dataset.roleFor);if(!m)return;el.disabled=true;
    try{await updateStaff(hospital.id,m,{role:el.value},me.role);toast(`${m.email} is now a ${el.value}.`);}catch(e){toast(helpfulError(e),true);el.value=m.role;}finally{el.disabled=false;}
  }));
  $('staff-list').querySelectorAll('[data-toggle-for]').forEach(btn=>btn.addEventListener('click',async()=>{
    const m=members.find(x=>x.uid===btn.dataset.toggleFor);if(!m)return;btn.disabled=true;
    try{await updateStaff(hospital.id,m,{active:!m.active},me.role);toast(`${m.email}: ${m.active?'access revoked':'access enabled'}.`);}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}
  }));
}
function renderInvites(){
  $('invite-list').innerHTML=invites.length?invites.map(i=>`<div class="admin-person"><div class="person-info"><strong>${esc(i.email)}</strong><small>${esc(i.role)} · ${esc(i.status)}${i.status==='pending'&&i.expiresAt?.toMillis()<Date.now()?' (expired)':''}</small></div><div class="person-actions">${i.status==='pending'?`<button class="btn btn-small btn-outline" data-revoke="${esc(i.email)}" type="button">Revoke</button>`:''}</div></div>`).join(''):'<div class="empty-state">No invitations yet.</div>';
  $('invite-list').querySelectorAll('[data-revoke]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;try{await revokeInvitation(hospital.id,btn.dataset.revoke);toast('Invitation revoked.');}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}
  }));
}
function renderDepartments(){
  $('department-list').innerHTML=departments.length?departments.map(d=>`<div class="admin-person"><div class="person-avatar">${esc(d.prefix)}</div><div class="person-info"><strong>${esc(d.name)}</strong><small>${d.dayKey===dayKey()?d.waiting:0} waiting · ${d.active?`Now serving ${esc(d.active.code)}`:d.paused?'Paused':'Ready'}</small></div><span class="role-chip">~${d.avgMinutes} MIN / PATIENT</span></div>`).join(''):'<div class="empty-state">Add the first department to begin tracking queues.</div>';
}
async function initialize(){
  const seq=++authEpoch;stop();show('admin-guard',true);show('admin-content',false);show('admin-sign-out',false);
  if(!configured){$('guard-message').textContent='Firebase is not configured yet.';return;}
  const user=auth.currentUser;
  show('admin-login-form',true);show('admin-verify',Boolean(user&&!user.emailVerified));show('admin-switch-account',Boolean(user));
  if(!user){$('guard-message').textContent='Sign in with your designated hospital administrator account.';if(pendingLogout){toast('You have been signed out successfully.');pendingLogout=false;}return;}
  if(!user.emailVerified){$('guard-message').textContent='Please verify your administrator email before proceeding.';return;}
  try{
    const accounts=await myMemberships(user);if(seq!==authEpoch)return;
    const preferred=new URLSearchParams(location.search).get('hospital')||localStorage.getItem('turnahead-hospital');
    me=accounts.find(m=>m.hospitalId===preferred&&m.role==='owner')||accounts.find(m=>m.role==='owner');
    if(!me){$('guard-message').textContent='Access denied. This email is not registered as the designated hospital administrator. Contact your organization owner.';pendingLogin=false;return;}
    hospital=await getHospital(me.hospitalId);if(seq!==authEpoch)return;
    localStorage.setItem('turnahead-hospital',hospital.id);
    show('admin-guard',false);show('admin-content',true);show('admin-sign-out',true);
    $('admin-hospital-name').textContent=`${hospital.name} · Live hospital operations`;
    $('admin-role').textContent='ADMINISTRATOR';$('settings-name').value=hospital.name;
    $('open-reception').href=boardLink(hospital.id,location.href);
    if(pendingLogin){toast('Administrator logged in successfully.');pendingLogin=false;}
    // Start all four streams at once for a responsive admin dashboard.
    unsubs.push(watchHospitalMembers(hospital.id,data=>{members=data;renderMembers();displayMetrics();},e=>toast(helpfulError(e),true)));
    unsubs.push(watchInvitations(hospital.id,data=>{invites=data;renderInvites();displayMetrics();},e=>toast(helpfulError(e),true)));
    unsubs.push(observeQueues(hospital.id,data=>{departments=data;renderDepartments();displayMetrics();},e=>toast(helpfulError(e),true)));
    unsubs.push(observeTickets(hospital.id,data=>{tickets=data;renderTickets();},e=>toast(helpfulError(e),true),100));
  }catch(e){if(seq===authEpoch){$('guard-message').textContent=helpfulError(e);pendingLogin=false;}}
}
$('admin-login-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;$('admin-login-error').textContent='';pendingLogin=true;
try{await login($('admin-email').value,$('admin-password').value);$('admin-password').value='';}
catch(e){pendingLogin=false;$('admin-login-error').textContent=helpfulError(e);}finally{btn.disabled=false;}});
$('admin-verify').addEventListener('click',async()=>{try{await requestVerification();if(await refreshVerification())await initialize();else toast('Verification email sent. Please open it and return here.');}catch(e){toast(helpfulError(e),true);}});
$('admin-switch-account').addEventListener('click',async()=>{try{await logout();}catch(e){toast(helpfulError(e),true);}});
$('invite-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
try{const email=normalizeEmail($('invite-email').value),role=$('invite-role').value;
  if(members.some(m=>m.email===email))throw Error('This staff email is already a member. Update their role in Team members.');
  await inviteStaff(hospital.id,email,role,me.role);
  $('invitation-url').value=invitationLink(hospital.id,location.href);show('invitation-link',true);
  $('invite-email').value='';toast('Email approved. Share the private activation link with the employee.');
}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}});
$('copy-invite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('invitation-url').value);toast('Activation link copied.');}catch{toast('Select the link to copy it manually.',true);}});
$('copy-board').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(boardLink(hospital.id,location.href));toast('Public board link copied.');}catch{toast('Clipboard unavailable. Please try again.',true);}});
$('department-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
try{const queue=await createQueue(hospital.id,$('admin-department-name').value);$('admin-department-name').value='';toast(`${queue.name} department added.`);}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}});
$('settings-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
try{await renameHospital(hospital.id,$('settings-name').value);hospital=await getHospital(hospital.id);$('admin-hospital-name').textContent=`${hospital.name} · Live hospital operations`;toast('Hospital name saved.');}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}});
$('admin-sign-out').addEventListener('click',async()=>{pendingLogout=true;try{await logout();}catch(e){pendingLogout=false;toast(helpfulError(e),true);}});
if(configured)observeAuth(()=>initialize());else initialize();
