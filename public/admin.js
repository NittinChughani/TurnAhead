import {configured,auth,helpfulError} from './firebase.js';
import {observeAuth,login,logout,refreshVerification,requestVerification,myMemberships,getHospital,
  watchHospitalMembers,watchInvitations,inviteStaff,revokeInvitation,updateStaff,renameHospital,sendStaffPasswordReset} from './org-store.js';
import {observeQueues,observeTickets,createQueue,listHistoryDays,readHistory} from './store.js';
import {canChangeRole,normalizeEmail,invitationLink,boardLink,staffGreeting} from './org-model.js';
import {dayKey} from './queue-engine.js';
const $=id=>document.getElementById(id),esc=window.turnahead.esc,fmt=window.turnahead.fmt;
let hospital=null,me=null,members=[],invites=[],departments=[],tickets=[],unsubs=[],toastTimer,authEpoch=0,pendingLogin=false,pendingLogout=false;
let editingMember=null,historyDays=[],archiveCursors=new Map();
const loginButton=$('admin-login-form').querySelector('[type=submit]'),loginLabel=loginButton.textContent;
function loadingLogin(busy){loginButton.disabled=busy;loginButton.classList.toggle('is-loading',busy);loginButton.textContent=busy?'Checking access…':loginLabel;}
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
  $('patient-ticket-list').innerHTML=current.length?current.map(t=>`<div class="admin-person"><span class="activity-token">${esc(t.code)}</span><div class="person-info"><strong>${esc(t.patientName||'Older ticket')} · ${esc(t.queueName||'Department')}</strong><small>Issued ${esc(fmt(t.createdAt))} · Called ${esc(fmt(t.calledAt))} · ${t.attendance==='present'?'Attended':t.attendance==='missed'?'Missed':'Pending'}</small></div><span class="activity-state">${esc(t.status)}</span></div>`).join(''):'<div class="empty-state">No anonymous queue tickets in the recent sample today.</div>';
}
function renderMembers(){
  $('staff-list').innerHTML=members.length?members.map(m=>{
    const isOwner=m.role==='owner',self=m.uid===auth.currentUser?.uid;
    const editable=canChangeRole(me.role,m.role,m.role==='owner'?'receptionist':m.role==='admin'?'supervisor':m.role)&&!self;
    const options=['supervisor','receptionist'];
    return `<div class="admin-person"><div class="person-avatar" aria-hidden="true">${esc(m.email?.[0]||'?').toUpperCase()}</div><div class="person-info"><strong>${esc(isOwner?'Hospital administrator':staffGreeting(m))}</strong><small>${esc(m.email)} · ${isOwner?'Designated administrator':m.active?'Approved staff':'Access disabled'}</small></div><div class="person-actions">${isOwner?'<span class="role-chip">ADMINISTRATOR</span>':`<label class="visually-hidden" for="role-${esc(m.uid)}">Role for ${esc(m.email)}</label><select class="admin-role-select" id="role-${esc(m.uid)}" data-role-for="${esc(m.uid)}" ${editable?'':'disabled'}>${m.role==='admin'?'<option value="admin" disabled selected>Legacy admin</option>':''}${options.map(r=>`<option value="${r}" ${m.role===r?'selected':''}>${r==='supervisor'?'Supervisor':'Receptionist'}</option>`).join('')}</select><button class="btn btn-small btn-outline" type="button" data-edit-for="${esc(m.uid)}" ${editable?'':'disabled'}>Update details</button><button class="btn btn-small btn-outline" type="button" data-toggle-for="${esc(m.uid)}" ${editable?'':'disabled'}>${m.active?'Disable':'Enable'}</button>`}</div></div>`;
  }).join(''):'<div class="empty-state">No staff registered yet.</div>';
  $('staff-list').querySelectorAll('[data-role-for]').forEach(el=>el.addEventListener('change',async()=>{
    const m=members.find(x=>x.uid===el.dataset.roleFor);if(!m)return;el.disabled=true;
    try{await updateStaff(hospital.id,m,{role:el.value},me.role);toast(`${m.email} is now a ${el.value}.`);}catch(e){toast(helpfulError(e),true);el.value=m.role;}finally{el.disabled=false;}
  }));
  $('staff-list').querySelectorAll('[data-toggle-for]').forEach(btn=>btn.addEventListener('click',async()=>{
    const m=members.find(x=>x.uid===btn.dataset.toggleFor);if(!m)return;btn.disabled=true;
    try{await updateStaff(hospital.id,m,{active:!m.active},me.role);toast(`${m.email}: ${m.active?'access revoked':'access enabled'}.`);}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}
  }));
  $('staff-list').querySelectorAll('[data-edit-for]').forEach(btn=>btn.addEventListener('click',()=>{
    const m=members.find(x=>x.uid===btn.dataset.editFor);if(!m||m.role==='owner')return;
    editingMember=m;
    $('staff-edit-email').textContent=`${m.email} · Staff account`;
    $('staff-edit-name').value=m.displayName||m.email.split('@')[0];
    $('staff-edit-gender').value=m.gender==='male'||m.gender==='female'?m.gender:'';
    $('staff-edit-role').value=m.role==='supervisor'?'supervisor':'receptionist';
    show('staff-edit-modal',true);
  }));
}
function renderInvites(){
  $('invite-list').innerHTML=invites.length?invites.map(i=>`<div class="admin-person"><div class="person-info"><strong>${esc(i.displayName||i.email)}</strong><small>${esc(i.email)} · ${esc(i.gender==='male'?'Mr':i.gender==='female'?'Ms':'')} · ${esc(i.role)} · ${esc(i.status)}${i.status==='pending'&&i.expiresAt?.toMillis()<Date.now()?' (expired)':''}</small></div><div class="person-actions">${i.status==='pending'?`<button class="btn btn-small btn-outline" data-revoke="${esc(i.email)}" type="button">Revoke</button>`:''}</div></div>`).join(''):'<div class="empty-state">No invitations yet.</div>';
  $('invite-list').querySelectorAll('[data-revoke]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;try{await revokeInvitation(hospital.id,btn.dataset.revoke);toast('Invitation revoked.');}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}
  }));
}
function renderDepartments(){
  $('department-list').innerHTML=departments.length?departments.map(d=>`<div class="admin-person"><div class="person-avatar">${esc(d.prefix)}</div><div class="person-info"><strong>${esc(d.name)}</strong><small>${d.dayKey===dayKey()?d.waiting:0} waiting · ${d.active?`Now serving ${esc(d.active.code)}`:d.paused?'Paused':'Ready'}</small></div><span class="role-chip">~${d.avgMinutes} MIN / PATIENT</span></div>`).join(''):'<div class="empty-state">Add the first department to begin tracking queues.</div>';
}
/** Each date has a separate search box; history reads are owner-only. */
function renderHistory(){
  const host=$('history-days');
  if(!historyDays.length){host.innerHTML='<div class="empty-state">No dated patient records yet. New tickets appear here automatically.</div>';return;}
  host.innerHTML=historyDays.map(date=>`<details class="history-day" data-history-day="${esc(date)}"><summary><b>${esc(date)}</b><span>Search by department and ticket number ↗</span></summary><div class="history-tools"><label>Department<select data-history-dept="${esc(date)}">${departments.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.prefix)})</option>`).join('')}</select></label><label>Ticket number<input type="search" data-history-code="${esc(date)}" placeholder="CAR-001" maxlength="24"></label><button class="btn btn-small btn-primary" type="button" data-history-search="${esc(date)}">Search</button><button class="btn btn-small btn-outline" type="button" data-history-recent="${esc(date)}">Show recent</button></div><div class="history-results" data-history-results="${esc(date)}">Select a department to view its records.</div><button class="btn btn-small btn-outline history-more" data-history-more="${esc(date)}" type="button" hidden>Load 100 more ↗</button></details>`).join('');
}
function historyRecordHtml(t,date){
  let presence=t.attendance==='present'?'Attended':t.attendance==='missed'?'Missed':['waiting','called'].includes(t.status)&&date<dayKey()?'Unresolved after day end':'Pending';
  return `<div class="history-record"><div><strong>${esc(t.code)} · ${esc(t.patientName||'Unknown')}</strong><small>${esc(t.queueName||'Department')} · ${esc(presence)}</small></div><div class="history-record-times"><small>Issued: ${esc(fmt(t.issuedAt))}</small><small>Called: ${esc(fmt(t.calledAt))}</small><small>Finished: ${esc(fmt(t.finishedAt))}</small><span class="activity-state">${esc(t.status)}</span></div></div>`;
}
async function loadHistory(date,mode='recent'){
  const parent=[...$('history-days').querySelectorAll('[data-history-day]')].find(x=>x.dataset.historyDay===date);
  if(!parent||!hospital)return;
  const id=parent.querySelector('[data-history-dept]').value;
  if(!id){parent.querySelector('[data-history-results]').textContent='Create a department first.';return;}
  const raw=parent.querySelector('[data-history-code]').value.trim().toUpperCase();
  const key=`${date}:${id}`,code=mode==='search'?raw:'';
  if(mode==='search'&&!code){toast('Enter a ticket number like CAR-001.',true);return;}
  const result=parent.querySelector('[data-history-results]'),more=parent.querySelector('[data-history-more]');
  const cursor=mode==='more'?archiveCursors.get(key):null;
  result.setAttribute('aria-busy','true');if(mode!=='more')result.textContent='Loading patient records…';
  try{
    const page=await readHistory(hospital.id,date,id,code,cursor||null);
    archiveCursors.set(key,page.cursor);
    const html=page.records.length?page.records.map(t=>historyRecordHtml(t,date)).join(''):'<div class="empty-state">No matching ticket records for this department and date.</div>';
    if(mode==='more')result.insertAdjacentHTML('beforeend',html);else result.innerHTML=html;
    more.hidden=!page.hasMore||mode==='search';
  }catch(e){result.textContent=helpfulError(e);more.hidden=true;}
  finally{result.removeAttribute('aria-busy');}
}
async function refreshHistory(){
  if(!hospital)return;
  try{historyDays=await listHistoryDays(hospital.id);archiveCursors.clear();renderHistory();}
  catch(e){$('history-days').textContent=helpfulError(e);}
}
$('history-days').addEventListener('click',e=>{
  const action=e.target.closest('[data-history-search],[data-history-recent],[data-history-more]');if(!action)return;
  const date=action.dataset.historySearch||action.dataset.historyRecent||action.dataset.historyMore;
  loadHistory(date,action.hasAttribute('data-history-search')?'search':action.hasAttribute('data-history-more')?'more':'recent');
});
$('history-days').addEventListener('change',e=>{
  if(e.target.matches('[data-history-dept]')){const p=e.target.closest('[data-history-day]');p.querySelector('[data-history-results]').textContent='Choose Search or Show recent for this department.';p.querySelector('[data-history-more]').hidden=true;}
});
$('history-days').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.matches('[data-history-code]')){e.preventDefault();loadHistory(e.target.dataset.historyCode,'search');}
});
$('refresh-history').addEventListener('click',refreshHistory);
$('staff-edit-close').addEventListener('click',()=>show('staff-edit-modal',false));
$('staff-edit-modal').addEventListener('click',e=>{if(e.target===$('staff-edit-modal'))show('staff-edit-modal',false);});
$('staff-edit-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!editingMember||!hospital)return;
  const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
  try{
    await updateStaff(hospital.id,editingMember,{displayName:$('staff-edit-name').value,gender:$('staff-edit-gender').value,role:$('staff-edit-role').value},me.role);
    toast('Staff details updated successfully.');show('staff-edit-modal',false);
  }catch(err){toast(helpfulError(err),true);}finally{btn.disabled=false;}
});
$('staff-reset-password').addEventListener('click',async()=>{
  if(!editingMember)return;const btn=$('staff-reset-password');btn.disabled=true;
  try{await sendStaffPasswordReset(editingMember.email);toast(`A secure reset email was requested for ${editingMember.email}.`);}
  catch(err){toast(helpfulError(err),true);}finally{btn.disabled=false;}
});
async function initialize(){
  const seq=++authEpoch;stop();show('admin-guard',true);show('admin-content',false);show('admin-sign-out',false);
  if(!configured){$('guard-message').textContent='Firebase is not configured yet.';return;}
  const user=auth.currentUser;
  show('admin-login-form',true);show('admin-verify',Boolean(user&&!user.emailVerified));show('admin-switch-account',Boolean(user));
  if(!user){$('guard-message').textContent='Sign in with your designated hospital administrator account.';loadingLogin(false);if(pendingLogout){toast('You have been signed out successfully.');pendingLogout=false;}return;}
  if(!user.emailVerified){$('guard-message').textContent='Please verify your administrator email before proceeding.';loadingLogin(false);return;}
  try{
    const accounts=await myMemberships(user);if(seq!==authEpoch)return;
    const preferred=new URLSearchParams(location.search).get('hospital')||localStorage.getItem('turnahead-hospital');
    me=accounts.find(m=>m.hospitalId===preferred&&m.role==='owner')||accounts.find(m=>m.role==='owner');
    if(!me){$('guard-message').textContent='Access denied. This email is not registered as the designated hospital administrator. Contact your organization owner.';pendingLogin=false;loadingLogin(false);return;}
    hospital=await getHospital(me.hospitalId);if(seq!==authEpoch)return;
    localStorage.setItem('turnahead-hospital',hospital.id);
    show('admin-guard',false);show('admin-content',true);show('admin-sign-out',true);loadingLogin(false);
    $('admin-hospital-name').textContent=`${hospital.name} · Live hospital operations`;
    $('admin-role').textContent='ADMINISTRATOR';$('settings-name').value=hospital.name;
    $('open-reception').href=boardLink(hospital.id,location.href);
    if(pendingLogin){toast('Administrator logged in successfully.');pendingLogin=false;}
    // Start all four streams at once for a responsive admin dashboard.
    unsubs.push(watchHospitalMembers(hospital.id,data=>{members=data;renderMembers();displayMetrics();},e=>toast(helpfulError(e),true)));
    unsubs.push(watchInvitations(hospital.id,data=>{invites=data;renderInvites();displayMetrics();},e=>toast(helpfulError(e),true)));
    unsubs.push(observeQueues(hospital.id,data=>{departments=data;renderDepartments();displayMetrics();if(historyDays.length&&!$('history-days').querySelector('[data-history-dept]'))renderHistory();},e=>toast(helpfulError(e),true)));
    unsubs.push(observeTickets(hospital.id,data=>{tickets=data;renderTickets();},e=>toast(helpfulError(e),true),100));
    refreshHistory();
  }catch(e){if(seq===authEpoch){$('guard-message').textContent=helpfulError(e);pendingLogin=false;loadingLogin(false);}}
}
$('admin-login-form').addEventListener('submit',async e=>{
  e.preventDefault();if(loginButton.disabled)return;
  loadingLogin(true);$('admin-login-error').textContent='';pendingLogin=true;
  try{await login($('admin-email').value,$('admin-password').value);$('admin-password').value='';}
  catch(err){pendingLogin=false;loadingLogin(false);$('admin-login-error').textContent=helpfulError(err);}
});
$('admin-verify').addEventListener('click',async()=>{try{await requestVerification();if(await refreshVerification())await initialize();else toast('Verification email sent. Please open it and return here.');}catch(e){toast(helpfulError(e),true);}});
$('admin-switch-account').addEventListener('click',async()=>{try{await logout();}catch(e){toast(helpfulError(e),true);}});
$('invite-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
try{const email=normalizeEmail($('invite-email').value),role=$('invite-role').value;
  if(members.some(m=>m.email===email))throw Error('This staff email is already a member. Update their role in Team members.');
  await inviteStaff(hospital.id,email,role,me.role,$('invite-name').value,$('invite-gender').value);
  $('invitation-url').value=invitationLink(hospital.id,location.href);show('invitation-link',true);
  $('invite-email').value='';$('invite-name').value='';toast('Email approved. Share the private activation link with the employee.');
}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}});
$('copy-invite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('invitation-url').value);toast('Activation link copied.');}catch{toast('Select the link to copy it manually.',true);}});
$('copy-board').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(boardLink(hospital.id,location.href));toast('Public board link copied.');}catch{toast('Clipboard unavailable. Please try again.',true);}});
$('department-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
try{const queue=await createQueue(hospital.id,$('admin-department-name').value);$('admin-department-name').value='';toast(`${queue.name} department added.`);}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}});
$('settings-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
try{await renameHospital(hospital.id,$('settings-name').value);hospital=await getHospital(hospital.id);$('admin-hospital-name').textContent=`${hospital.name} · Live hospital operations`;toast('Hospital name saved.');}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}});
$('admin-sign-out').addEventListener('click',async()=>{pendingLogout=true;try{await logout();}catch(e){pendingLogout=false;toast(helpfulError(e),true);}});
if(configured)observeAuth(()=>initialize());else initialize();
