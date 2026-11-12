import {configured,auth,helpfulError} from './firebase.js';
import {observeAuth,logout,myMemberships,getHospital,watchHospitalMembers,watchInvitations,
  inviteStaff,revokeInvitation,updateStaff,renameHospital} from './org-store.js';
import {observeQueues,createQueue} from './store.js';
import {canManageStaff,canChangeRole,canInviteRole,normalizeEmail,invitationLink,boardLink} from './org-model.js';

const $=id=>document.getElementById(id),esc=window.turnahead.esc;
let hospital=null,me=null,members=[],invites=[],departments=[],unsubs=[],toastTimer;
const show=(id,value)=>$(id).hidden=!value;
function toast(message,error=false){const box=$('admin-toast');box.textContent=message;box.classList.toggle('error',error);show('admin-toast',true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('admin-toast',false),5000);}
function stop(){unsubs.forEach(fn=>fn());unsubs=[];}
function renderMembers(){
  $('staff-count').textContent=members.filter(m=>m.active).length;
  $('staff-list').innerHTML=members.map(m=>{
    const isOwner=m.role==='owner',self=m.uid===auth.currentUser?.uid;
    const editable=canChangeRole(me.role,m.role,m.role)&&!self;
    const options=['admin','supervisor','receptionist'];
    return `<div class="admin-person"><div class="person-avatar" aria-hidden="true">${esc(m.email[0]||'?').toUpperCase()}</div><div class="person-info"><strong>${esc(m.email)}</strong><small>${isOwner?'Hospital owner':m.active?'Active account':'Access disabled'}</small></div><div class="person-actions">${isOwner?'<span class="role-chip">OWNER</span>':`<label class="visually-hidden" for="role-${esc(m.uid)}">Role for ${esc(m.email)}</label><select class="admin-role-select" id="role-${esc(m.uid)}" data-role-for="${esc(m.uid)}" ${editable?'':'disabled'}>${options.map(r=>`<option value="${r}" ${m.role===r?'selected':''} ${!canChangeRole(me.role,m.role,r)?'disabled':''}>${r[0].toUpperCase()+r.slice(1)}</option>`).join('')}</select><button type="button" class="btn btn-small btn-outline" data-toggle-for="${esc(m.uid)}" ${editable?'':'disabled'}>${m.active?'Disable':'Enable'}</button>`}</div></div>`;
  }).join('')||'<div class="empty-state">Your staff members will appear here.</div>';
  $('staff-list').querySelectorAll('[data-role-for]').forEach(select=>select.addEventListener('change',async()=>{
    const m=members.find(x=>x.uid===select.dataset.roleFor);if(!m)return;
    select.disabled=true;try{await updateStaff(hospital.id,m,{role:select.value},me.role);toast(`${m.email} is now a ${select.value}.`);}catch(e){toast(helpfulError(e),true);select.value=m.role;}finally{select.disabled=false;}
  }));
  $('staff-list').querySelectorAll('[data-toggle-for]').forEach(b=>b.addEventListener('click',async()=>{
    const m=members.find(x=>x.uid===b.dataset.toggleFor);if(!m)return;
    b.disabled=true;try{await updateStaff(hospital.id,m,{active:!m.active},me.role);toast(`${m.email}: ${m.active?'access disabled':'access enabled'}.`);}catch(e){toast(helpfulError(e),true);}finally{b.disabled=false;}
  }));
}
function renderInvites(){
  const pending=invites.filter(i=>i.status==='pending'&&i.expiresAt?.toMillis()>Date.now());
  $('invite-count').textContent=pending.length;
  $('invite-list').innerHTML=invites.length?invites.map(i=>`<div class="admin-person"><div class="person-info"><strong>${esc(i.email)}</strong><small>${esc(i.role)} · ${esc(i.status)}${i.status==='pending'&&i.expiresAt?.toMillis()<Date.now()?' (expired)':''}</small></div><div class="person-actions">${i.status==='pending'?`<button class="btn btn-small btn-outline" type="button" data-revoke="${esc(i.email)}">Revoke</button>`:''}</div></div>`).join(''):'<div class="empty-state">No invitations sent yet.</div>';
  $('invite-list').querySelectorAll('[data-revoke]').forEach(b=>b.addEventListener('click',async()=>{
    b.disabled=true;try{await revokeInvitation(hospital.id,b.dataset.revoke);toast('Invitation revoked.');}catch(e){toast(helpfulError(e),true);}finally{b.disabled=false;}
  }));
}
function renderDepartments(){
  $('department-count').textContent=departments.length;
  $('department-list').innerHTML=departments.map(d=>`<div class="admin-person"><div class="person-avatar">${esc(d.prefix)}</div><div class="person-info"><strong>${esc(d.name)}</strong><small>${d.waiting} waiting · ${d.paused?'Paused':'Accepting tickets'}</small></div><span class="role-chip">${esc(d.prefix)} SERIES</span></div>`).join('')||'<div class="empty-state">No service departments yet.</div>';
}
async function init(){
  if(!configured){$('guard-message').textContent='Firebase has not been configured for TurnAhead.';return;}
  if(!auth.currentUser?.emailVerified){$('guard-message').textContent='Sign in and verify your email on the reception page first.';return;}
  const all=await myMemberships();
  const id=new URLSearchParams(location.search).get('hospital')||localStorage.getItem('turnahead-hospital');
  me=all.find(m=>m.hospitalId===id)||all.find(m=>canManageStaff(m.role));
  if(!me||!canManageStaff(me.role)){$('guard-message').textContent='You do not have permission to manage hospital staff. Ask your hospital owner for administrator access.';return;}
  hospital=await getHospital(me.hospitalId);
  show('admin-guard',false);show('admin-content',true);show('admin-sign-out',true);
  $('admin-hospital-name').textContent=hospital.name+' · People, departments and workspace settings';
  $('admin-role').textContent=me.role.toUpperCase();$('settings-name').value=hospital.name;
  $('back-desk').href='./desk.html';$('open-reception').href='./desk.html';
  if(me.role!=='owner')$('invite-role').querySelector('[value=admin]').disabled=true;
  unsubs.push(watchHospitalMembers(hospital.id,data=>{members=data;renderMembers();},e=>toast(helpfulError(e),true)));
  unsubs.push(watchInvitations(hospital.id,data=>{invites=data;renderInvites();},e=>toast(helpfulError(e),true)));
  unsubs.push(observeQueues(hospital.id,data=>{departments=data;renderDepartments();},e=>toast(helpfulError(e),true)));
}
$('invite-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;
  try{
    const email=normalizeEmail($('invite-email').value),role=$('invite-role').value;
    if(!canInviteRole(me.role,role))throw Error('You cannot invite staff at that access level.');
    if(members.some(m=>m.email===email))throw Error('This person already has a hospital membership. Change their access in Team members instead.');
    await inviteStaff(hospital.id,email,role,me.role);
    $('invitation-url').value=invitationLink(hospital.id,location.href);show('invitation-link',true);
    $('invite-email').value='';toast('Invitation created. Copy and share the link with your staff member.');
  }catch(err){toast(helpfulError(err),true);}finally{button.disabled=false;}
});
$('copy-invite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('invitation-url').value);toast('Staff invitation link copied.');}catch{toast('Copy failed. Select the link to copy it manually.',true);}});
$('copy-board').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(boardLink(hospital.id,location.href));toast('Public board link copied.');}catch{toast('Copy failed. Please try again.',true);}});
$('department-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;
  try{const newQueue=await createQueue(hospital.id,$('admin-department-name').value);$('admin-department-name').value='';toast(`${newQueue.name} has been created.`);}catch(err){toast(helpfulError(err),true);}finally{button.disabled=false;}
});
$('settings-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;
  try{await renameHospital(hospital.id,$('settings-name').value);hospital=await getHospital(hospital.id);$('admin-hospital-name').textContent=hospital.name+' · People, departments and workspace settings';toast('Hospital name saved.');}catch(err){toast(helpfulError(err),true);}finally{button.disabled=false;}
});
$('admin-sign-out').addEventListener('click',async()=>{try{await logout();toast('You have been signed out successfully.');}catch(e){toast(helpfulError(e),true);}});
observeAuth(()=>{stop();show('admin-guard',true);show('admin-content',false);show('admin-sign-out',false);init().catch(e=>{$('guard-message').textContent=helpfulError(e);});});
