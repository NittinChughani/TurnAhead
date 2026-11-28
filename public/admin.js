import {startStagingGoogle,finishStagingGoogle} from './staging-google.js';
import {bindFeedbackArchive} from './feedback-archive.js?v=4.0.3';
import {archiveMonth,monthDates} from './archive-month.js';
import {bindSignInLoader} from './signin-loader.js?v=4.0.3';
import {bindSubscription} from './admin-subscription.js?v=4.0.0-ui.1';
import {readActivity} from './activity-store.js?v=3.3.0';
import {configured,auth,helpfulError} from './firebase.js';
import {observeAuth,login,logout,refreshVerification,requestVerification,resolveWorkspace,getHospital,
  watchMembership,watchHospitalMembers,watchInvitations,inviteStaff,revokeInvitation,updateStaff,renameHospital,updateRecallGrace,sendStaffPasswordReset,updateOwnProfilePhoto} from './org-store.js?v=4.0.1';
import {observeQueues,observeTickets,createQueue,listHistoryDays,readHistory,readTicketChanges,searchHistoryDate} from './store.js?v=4.0.1';
import {canChangeRole,normalizeEmail,invitationLink,boardLink,staffGreeting} from './org-model.js';
import {dayKey,patientDisplayName,ticketStatusLabel} from './queue-engine.js?v=2.6.2';
import {watchDoctors,addDoctor,changeDoctor} from './doctors.js?v=3.3.1';
import {avatarHTML,avatarContents,compressProfilePhoto} from './profile-photo.js';
import {bindAccountMenu} from './account-menu.js?v=3.3.2';
import {patientReportRows,downloadPatientReport} from './patient-report.js?v=3.3.1';
import {bindLanguage,t} from './locale.js?v=2.6.1';
import {persistent} from './reliability.js?v=3.2.0';
import {bindV3,resetV3,resetAnalytics,renderCustomization,renderOnboarding} from './admin-v3.js?v=4.0.0-ui.1';
const $=id=>document.getElementById(id),esc=window.turnahead.esc,fmt=window.turnahead.fmt;
let hospital=null,me=null,members=[],invites=[],departments=[],tickets=[],unsubs=[],toastTimer,authEpoch=0,pendingLogin=false,pendingLogout=false;
let fullHistoryGeneration=0,historyLoaded=false,historyLoading=false,historyMonth='',customHistoryDate=null,historyRequest=0;
let currentHistoryTicket=null,editingMember=null,editingDoctor=null,doctors=[],historyDays=[],archiveCursors=new Map(),historyRecords=new Map();
const loginButton=$('admin-login-form').querySelector('[type=submit]');
const loadingLogin=bindSignInLoader(loginButton);
const show=(id,value)=>$(id).hidden=!value;
function toast(message,error=false){const el=$('admin-toast');el.textContent=message;el.classList.toggle('error',error);show('admin-toast',true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('admin-toast',false),4800);}
const accountMenu=bindAccountMenu('admin');
const subscription=bindSubscription(()=>({hospital,departments,doctors,members}),toast,()=>showAdminSection('subscription',true),()=>resetAnalytics());
const feedbackArchive=bindFeedbackArchive();
function stop(){feedbackArchive.stop();subscription.stop();accountMenu.show(false);fullHistoryGeneration++;resetV3();unsubs.forEach(fn=>fn());unsubs=[];hospital=null;me=null;currentHistoryTicket=null;editingMember=null;editingDoctor=null;doctors=[];members=[];invites=[];departments=[];tickets=[];historyDays=[];historyLoaded=false;historyLoading=false;historyMonth='';customHistoryDate=null;historyRequest++;archiveCursors.clear();historyRecords.clear();
  ['history-detail-modal','doctor-edit-modal','staff-edit-modal'].forEach(id=>show(id,false));
  for(const id of ['patient-ticket-list','history-days','doctor-list','staff-list','invite-list','department-list','feedback-list','history-detail-body','history-detail-title','onboarding-list','admin-profile-avatar','activity-list'])$(id)?.replaceChildren();
  for(const id of ['invitation-url','invite-email','invite-name','staff-edit-name','staff-edit-email','doctor-edit-name']){const el=$(id);if(el){if('value' in el)el.value='';else el.textContent='';}}
  show('invitation-link',false);}
/** Keep the signed-in landing view focused: only overview cards and the profile. */
const adminNavigation=document.querySelector('.admin-section-nav');
function showAdminSection(section,scroll=false){
  const available=new Set(['overview','team','invites','departments','doctors','patients','history','feedback','settings','analytics','customization','onboarding','activity','subscription']);
  const selected=available.has(section)?section:'overview';
  $('admin-overview').hidden=selected!=='overview';
  document.querySelectorAll('[data-admin-section]').forEach(panel=>{panel.hidden=panel.dataset.adminSection!==selected;});
  document.querySelectorAll('[data-admin-tab]').forEach(button=>{
    const active=button.dataset.adminTab===selected;
    button.classList.toggle('is-active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  if(selected==='activity')loadActivity();
  if(selected==='feedback'&&hospital)feedbackArchive.open(hospital.id);else feedbackArchive.pause();
  if(selected==='history'&&(!historyLoaded||historyMonth!==archiveMonth().first)&&!historyLoading)refreshHistory();
  if(selected==='subscription')subscription.open();
  if(selected==='onboarding')renderOnboarding({hospital,departments,doctors,members});
  if(scroll)adminNavigation.scrollIntoView({behavior:'smooth',block:'start'});
}
adminNavigation.addEventListener('click',event=>{
  const button=event.target.closest('[data-admin-tab]');
  if(button)showAdminSection(button.dataset.adminTab,true);
});
function toggleCustomGrace(){
  const custom=$('recall-grace').value==='custom',input=$('recall-grace-custom');
  $('recall-grace-custom-wrap').hidden=!custom;
  input.disabled=!custom;
  input.required=custom;
}
function showGraceValue(minutes){
  const value=String(minutes||10);
  $('recall-grace').value=['5','10','15','20','30'].includes(value)?value:'custom';
  $('recall-grace-custom').value=value;
  toggleCustomGrace();
}
$('recall-grace').addEventListener('change',toggleCustomGrace);
function displayMetrics(){
  subscription.usage();
  const active=departments.filter(q=>q.dayKey===dayKey());
  const waiting=active.reduce((n,q)=>n+q.waiting,0),inService=active.reduce((n,q)=>n+(q.activeCount||0),0);
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
function issuingReceptionist(t){
  if(!t.issuedBy)return 'Not recorded on older tickets';
  const member=members.find(m=>m.uid===t.issuedBy);
  return member?staffGreeting(member):`Former staff account (${t.issuedBy})`;
}
function issuingCounter(t){return t.issuedCounter||'Not recorded on older tickets';}
function renderTickets(){
  const current=tickets.filter(t=>t.dayKey===dayKey());
  $('patient-ticket-count').textContent=`Latest ${current.length} today · live`;
  $('patient-ticket-list').innerHTML=current.length?current.map(t=>`<div class="admin-person"><span class="activity-token">${esc(t.code)}</span><div class="person-info"><strong>${esc(patientDisplayName(t))} · ${esc(t.queueName||'Department')}</strong><small>${esc(t.doctorName?'Dr. '+t.doctorName:'Doctor not recorded')} · ${esc(t.roomNumber?'Room '+t.roomNumber:'Room not recorded')} · Issued ${esc(fmt(t.createdAt))} by ${esc(issuingReceptionist(t))} · ${esc(issuingCounter(t))} · Called ${esc(fmt(t.calledAt))} · ${t.attendance==='present'?(t.recallCount?'Recalled & completed':'Attended'):t.attendance==='missed'?'Missed':'Pending'}</small></div><span class="activity-state">${esc(ticketStatusLabel(t))}</span></div>`).join(''):'<div class="empty-state">No anonymous queue tickets in the recent sample today.</div>';
}
function renderOwnAvatar(){if(!me)return;const photo=avatarContents(me,esc);$('admin-profile-avatar').innerHTML=photo;$('admin-nav-avatar').innerHTML=photo;$('admin-greeting-name').textContent=me.displayName||'Administrator';}
function renderMembers(){
  $('staff-list').innerHTML=members.length?members.map(m=>{
    const isOwner=m.role==='owner',self=m.uid===auth.currentUser?.uid;
    const editable=canChangeRole(me.role,m.role,m.role==='owner'?'receptionist':m.role==='admin'?'supervisor':m.role)&&!self;
    const options=['supervisor','receptionist'];
    return `<div class="admin-person">${avatarHTML(m,esc)}<div class="person-info"><strong>${esc(isOwner?'Hospital administrator':staffGreeting(m))}</strong><small>${esc(m.email)} · ${isOwner?'Designated administrator':m.active?'Approved staff':'Access disabled'}</small></div><div class="person-actions">${isOwner?'<span class="role-chip">ADMINISTRATOR</span>':`<label class="visually-hidden" for="role-${esc(m.uid)}">Role for ${esc(m.email)}</label><select class="admin-role-select" id="role-${esc(m.uid)}" data-role-for="${esc(m.uid)}" ${editable?'':'disabled'}>${m.role==='admin'?'<option value="admin" disabled selected>Legacy admin</option>':''}${options.map(r=>`<option value="${r}" ${m.role===r?'selected':''}>${r==='supervisor'?'Supervisor':'Receptionist'}</option>`).join('')}</select><button class="btn btn-small btn-outline" type="button" data-edit-for="${esc(m.uid)}" ${editable?'':'disabled'}>Update details</button><button class="btn btn-small btn-outline" type="button" data-toggle-for="${esc(m.uid)}" ${editable?'':'disabled'}>${m.active?'Disable':'Enable'}</button>`}</div></div>`;
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
  $('department-list').innerHTML=departments.length?departments.map(d=>`<div class="admin-person"><div class="person-avatar">${esc(d.prefix)}</div><div class="person-info"><strong>${esc(d.name)}</strong><small>${d.dayKey===dayKey()?d.waiting:0} waiting · ${d.activeCount?`${d.activeCount} doctor queue(s) serving`:d.paused?'Paused':'Ready'}</small></div><span class="role-chip">~${d.avgMinutes} MIN / PATIENT</span></div>`).join(''):'<div class="empty-state">Add the first department to begin tracking queues.</div>';
}
function departmentOptions(selected=''){
  return '<option value="">Choose department</option>'+departments.map(d=>`<option value="${esc(d.id)}" ${selected===d.id?'selected':''}>${esc(d.name)}</option>`).join('');
}
function renderDoctors(){
  const chosen=$('doctor-department').value;
  $('doctor-department').innerHTML=departmentOptions(chosen);
  $('doctor-list').innerHTML=doctors.length?doctors.map(d=>`<div class="doctor-card ${d.active?'':'doctor-card-inactive'}"><div><strong>Dr. ${esc(d.name)}</strong><small>${esc(d.departmentName)} · ${d.roomNumber?'Room '+esc(d.roomNumber):'Room assigned at reception'} · ${d.active?'Accepting tickets':'Inactive'}</small></div><div class="person-actions"><button class="btn btn-small btn-outline" type="button" data-doctor-edit="${esc(d.id)}">Update</button><button class="btn btn-small btn-outline" type="button" data-doctor-toggle="${esc(d.id)}">${d.active?'Remove / deactivate':'Reactivate'}</button></div></div>`).join(''):'<div class="empty-state">No doctors added yet. Register a doctor in a department to issue tickets.</div>';
}
$('doctor-list').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-doctor-edit]'),toggle=e.target.closest('[data-doctor-toggle]');
  const id=edit?.dataset.doctorEdit||toggle?.dataset.doctorToggle;
  if(!id||!hospital)return;
  const doctor=doctors.find(x=>x.id===id);if(!doctor)return;
  if(edit){
    editingDoctor=doctor;$('doctor-edit-name').value=doctor.name;$('doctor-edit-department').innerHTML=departmentOptions(doctor.departmentId);
    $('doctor-edit-room').value=doctor.roomNumber||'';$('doctor-edit-active').value=doctor.active?'yes':'no';show('doctor-edit-modal',true);return;
  }
  if(!confirm(doctor.active?`Deactivate Dr. ${doctor.name}? New tickets cannot be issued for this doctor.`:`Reactivate Dr. ${doctor.name}?`))return;
  toggle.disabled=true;
  try{await changeDoctor(hospital.id,id,{...doctor,active:!doctor.active});toast(doctor.active?'Doctor deactivated.':'Doctor reactivated.');}
  catch(err){toast(helpfulError(err),true);}finally{toggle.disabled=false;}
});
$('doctor-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!hospital)return;const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
 try{const dept=departments.find(x=>x.id===$('doctor-department').value);if(!dept)throw Error('Select a department.');
   await addDoctor(hospital.id,{name:$('doctor-name').value,departmentId:dept.id,departmentName:dept.name,roomNumber:$('doctor-room').value});
   $('doctor-name').value='';$('doctor-room').value='';toast('Doctor added to this department.');}
 catch(err){toast(helpfulError(err),true);}finally{btn.disabled=false;}
});
function closeDoctorEdit(){show('doctor-edit-modal',false);editingDoctor=null;}
$('doctor-edit-close').addEventListener('click',closeDoctorEdit);
$('doctor-edit-modal').addEventListener('click',e=>{if(e.target===$('doctor-edit-modal'))closeDoctorEdit();});
$('doctor-edit-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!hospital||!editingDoctor)return;const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
 try{const dept=departments.find(x=>x.id===$('doctor-edit-department').value);if(!dept)throw Error('Select a department.');
  await changeDoctor(hospital.id,editingDoctor.id,{name:$('doctor-edit-name').value,departmentId:dept.id,departmentName:dept.name,roomNumber:$('doctor-edit-room').value,active:$('doctor-edit-active').value==='yes'});
  closeDoctorEdit();toast('Doctor updated successfully.');}
 catch(err){toast(helpfulError(err),true);}finally{btn.disabled=false;}
});
/** Each date has a separate search box; history reads are owner-only. */
function renderHistory(){
  const host=$('history-days');
  const dates=customHistoryDate&&!historyDays.includes(customHistoryDate)?[customHistoryDate,...historyDays]:historyDays;
  if(!dates.length){host.innerHTML='<div class="empty-state">No dated patient records for this month. Use the date finder for earlier records.</div>';return;}
  host.innerHTML=dates.map(date=>`<details class="history-day" data-history-day="${esc(date)}" ${date===(customHistoryDate||historyDays[0])?'open':''}><summary><div><b>${esc(date)}</b><span class="history-date-tag">${date===customHistoryDate?'Date search':date===historyDays[0]?'Latest':''}</span></div><span class="history-expand-label"><span class="history-closed-label">Expand archive</span><span class="history-open-label">Minimize archive</span><i class="history-chevron" aria-hidden="true"></i></span></summary><div class="history-body"><div class="history-tools"><label>Department<select data-history-dept="${esc(date)}">${departments.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.prefix)})</option>`).join('')}</select></label><label>Ticket number<input type="search" data-history-code="${esc(date)}" placeholder="CAR-001" maxlength="24"></label><button class="btn btn-small btn-primary" type="button" data-history-search="${esc(date)}">Search</button><button class="btn btn-small btn-outline" type="button" data-history-recent="${esc(date)}">Show recent</button></div><details class="history-advanced"><summary>Advanced filters &amp; full-date search</summary><div class="history-filter-tools"><label>Doctor<select data-filter="doctor"><option value="">All</option>${doctors.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join('')}</select></label><label>Issuing counter<select data-filter="counter"><option value="">All</option>${Array.from({length:12},(_,i)=>'<option>Counter '+(i+1)+'</option>').join('')}</select></label><label>Issuer<select data-filter="staff"><option value="">All</option>${members.map(m=>'<option value="'+esc(m.uid)+'">'+esc(staffGreeting(m))+'</option>').join('')}</select></label><label>Status<select data-filter="status"><option value="">All</option><option value="waiting">Waiting</option><option value="called">Called</option><option value="completed">Completed</option><option value="skipped">Missed</option></select></label><label>Full-date scope<select data-full-scope><option value="selected">Selected service department</option><option value="all">All departments</option></select></label><small>Recent mode filters loaded pages. Full-date search includes transferred patients and both original/current codes.</small><button type="button" class="btn btn-small btn-outline" data-history-full="${esc(date)}">Search entire date</button><button type="button" class="btn btn-small btn-outline" data-history-cancel hidden>Cancel search</button><p data-filter-count role="status"></p></div></details><div class="history-results" data-history-results="${esc(date)}">Select a department to view its records.</div><button class="btn btn-small btn-outline history-more" data-history-more="${esc(date)}" type="button" hidden>Load 100 more ↗</button></div></details>`).join('');
  const opened=host.querySelector('[data-history-day][open]');if(opened&&departments.length)loadHistory(opened.dataset.historyDay,'recent');
}
function historyRecordHtml(t,date,departmentId){
  t={...t,originalCode:t.code,originalQueueName:t.queueName,code:t.serviceCode||t.code,queueName:t.serviceQueueName||t.queueName};
  const presence=t.attendance==='present'?(t.recallCount?'Recalled & completed':'Attended'):t.attendance==='missed'?'Missed':['waiting','called'].includes(t.status)&&date<dayKey()?'Unresolved after day end':'Pending';
  const key=[date,departmentId,t.id].join(':');
  historyRecords.set(key,t);
  return `<div class="history-record" data-filter-doctor="${esc(t.doctorId||'')}" data-filter-counter="${esc(t.issuedCounter||'')}" data-filter-staff="${esc(t.issuedBy||'')}" data-filter-status="${esc(t.status||'')}"><div><strong>${esc(t.code)} · ${esc(patientDisplayName(t))}</strong><small>${esc(t.queueName||'Department')} · ${esc(presence)}</small></div><div class="history-record-actions"><span class="activity-state">${esc(ticketStatusLabel(t))}</span><button type="button" class="btn btn-small btn-outline" data-record-key="${esc(key)}">Details</button></div></div>`;
}
function closeHistoryDetail(){show('history-detail-modal',false);currentHistoryTicket=null;}
$('history-download-pdf').addEventListener('click',async()=>{
 if(!me||!hospital||!currentHistoryTicket)return;
 const btn=$('history-download-pdf');btn.disabled=true;btn.textContent='Preparing PDF…';
 try{const t=currentHistoryTicket,epoch=authEpoch,hid=hospital.id;const person=uid=>uid?issuingReceptionist({issuedBy:uid}):'Not recorded';
   const rows=patientReportRows(t,{issuedBy:person(t.issuedBy),calledBy:person(t.calledBy),finishedBy:person(t.finishedBy)});
   await downloadPatientReport(t,rows,hospital.name,()=>epoch===authEpoch&&hospital?.id===hid&&me?.role==='owner');toast('Private PDF downloaded. Store it securely.');
 }catch(err){toast('PDF download unavailable: '+helpfulError(err),true);}finally{btn.disabled=false;btn.textContent='↓ Download PDF';}
});
$('history-detail-close').addEventListener('click',closeHistoryDetail);
$('history-detail-done').addEventListener('click',closeHistoryDetail);
$('history-detail-modal').addEventListener('click',e=>{if(e.target===$('history-detail-modal'))closeHistoryDetail();});
$('history-days').addEventListener('click',e=>{
 const b=e.target.closest('[data-record-key]');if(!b)return;
 const t=historyRecords.get(b.dataset.recordKey);if(!t)return;currentHistoryTicket=t;
 $('history-detail-title').textContent=`Details of ${patientDisplayName(t)}`;
 const rows=[['Ticket number',t.code],['Patient',patientDisplayName(t)],['Doctor',t.doctorName?'Dr. '+t.doctorName:'Not recorded'],['Room',t.roomNumber||'Not recorded'],['Department',t.queueName||'—'],['Originally issued',t.originalCode+' · '+t.originalQueueName],['Date',t.dayKey],['Issued',fmt(t.issuedAt)],['Issued by receptionist',issuingReceptionist(t)],['Issuing counter',issuingCounter(t)],['Called',fmt(t.calledAt)],['Called from counter',t.calledCounter||'Not recorded'],['Called by staff',t.calledBy?issuingReceptionist({issuedBy:t.calledBy}):'Not recorded'],['Finished',fmt(t.finishedAt)],['Finished by staff',t.finishedBy?issuingReceptionist({issuedBy:t.finishedBy}):'Not recorded'],['Attendance',t.attendance==='present'?'Attended':t.attendance==='missed'?'Missed':'Not confirmed'],['Status',ticketStatusLabel(t)]];
 $('history-detail-body').innerHTML=rows.map(([k,v])=>`<div class="history-detail-row"><span>${esc(k)}</span><strong>${esc(v||'—')}</strong></div>`).join('');
 show('history-detail-modal',true);
});
$('history-open-date').addEventListener('click',()=>{
 const date=$('history-date').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Choose a valid calendar date first.',true);return;}
 if(historyLoading){toast('Wait for the current month to finish loading.',true);return;}fullHistoryGeneration++;customHistoryDate=date;renderHistory();
 const day=[...$('history-days').querySelectorAll('[data-history-day]')].find(x=>x.dataset.historyDay===date);
 if(day){day.open=true;day.scrollIntoView({behavior:'smooth',block:'center'});}
});
async function loadHistory(date,mode='recent'){
  fullHistoryGeneration++;
  const parent=[...$('history-days').querySelectorAll('[data-history-day]')].find(x=>x.dataset.historyDay===date);
  if(!parent||!hospital)return;
  const id=parent.querySelector('[data-history-dept]').value;
  if(!id){parent.querySelector('[data-history-results]').textContent='Create a department first.';return;}
  const raw=parent.querySelector('[data-history-code]').value.trim().toUpperCase();
  const key=`${date}:${id}`,code=mode==='search'?raw:'';
  if(mode==='search'&&!code){toast('Enter a ticket number like CAR-001.',true);return;}
  const result=parent.querySelector('[data-history-results]'),more=parent.querySelector('[data-history-more]');
  const cursor=mode==='more'?archiveCursors.get(key):null,epoch=authEpoch,hid=hospital.id,request=String(++historyRequest);parent.dataset.request=request;parent.dataset.loaded='true';
  result.setAttribute('aria-busy','true');if(mode!=='more')result.textContent='Loading patient records…';
  try{
    const page=await readHistory(hid,date,id,code,cursor||null);
    if(epoch!==authEpoch||hospital?.id!==hid||!result.isConnected||parent.dataset.request!==request||parent.querySelector('[data-history-dept]').value!==id)return;
    archiveCursors.set(key,page.cursor);
    const html=page.records.length?page.records.map(t=>historyRecordHtml(t,date,id)).join(''):'<div class="empty-state">No matching ticket records for this department and date.</div>';
    if(mode==='more')result.insertAdjacentHTML('beforeend',html);else result.innerHTML=html;
    more.hidden=!page.hasMore||mode==='search';applyHistoryFilters(parent);
  }catch(e){if(epoch===authEpoch&&result.isConnected&&parent.dataset.request===request){result.textContent=helpfulError(e);more.hidden=true;}}
  finally{if(parent.dataset.request===request)result.removeAttribute('aria-busy');}
}
async function refreshHistory(){
  if(!hospital||historyLoading)return;
  const epoch=authEpoch,hid=hospital.id,month=archiveMonth();historyLoading=true;historyLoaded=false;customHistoryDate=null;$('history-month-label').textContent=month.label;$('history-days').textContent='Loading this month’s dates…';
  try{const dates=await listHistoryDays(hid);if(epoch!==authEpoch||hospital?.id!==hid)return;historyDays=monthDates(dates);historyMonth=month.first;historyLoaded=true;archiveCursors.clear();historyRecords.clear();renderHistory();}
  catch(e){if(epoch===authEpoch)$('history-days').textContent=helpfulError(e);}
  finally{if(epoch===authEpoch)historyLoading=false;}
}
$('history-days').addEventListener('click',e=>{
  const action=e.target.closest('[data-history-search],[data-history-recent],[data-history-more]');if(!action)return;
  const date=action.dataset.historySearch||action.dataset.historyRecent||action.dataset.historyMore;
  loadHistory(date,action.hasAttribute('data-history-search')?'search':action.hasAttribute('data-history-more')?'more':'recent');
});
$('history-days').addEventListener('toggle',e=>{const day=e.target;if(!day.matches?.('[data-history-day]')||!day.open)return;for(const other of $('history-days').querySelectorAll('[data-history-day][open]'))if(other!==day)other.open=false;if(!day.dataset.loaded&&departments.length)loadHistory(day.dataset.historyDay,'recent');},true);
$('history-days').addEventListener('change',e=>{
  if(e.target.matches('[data-filter]')){fullHistoryGeneration++;applyHistoryFilters(e.target.closest('[data-history-day]'));}
  if(e.target.matches('[data-history-dept]')){fullHistoryGeneration++;const p=e.target.closest('[data-history-day]');p.dataset.request=String(++historyRequest);p.querySelector('[data-history-results]').textContent='Choose Search or Show recent for this department.';p.querySelector('[data-history-more]').hidden=true;}
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
bindLanguage(()=>{});
async function initialize(){
  const seq=++authEpoch;stop();show('admin-guard',true);show('admin-content',false);show('admin-sign-out',false);
  if(!configured){$('guard-message').textContent='Firebase is not configured yet.';loadingLogin(false);return;}
  const user=auth.currentUser;
  show('admin-login-form',true);show('admin-verify',Boolean(user&&!user.emailVerified));show('admin-switch-account',Boolean(user));show('admin-check-access',Boolean(user?.emailVerified));
  if(!user){$('guard-message').textContent='Sign in with your designated hospital administrator account.';loadingLogin(false);if(pendingLogout){toast('You have been signed out successfully.');pendingLogout=false;}return;}
  if(!user.emailVerified){$('guard-message').textContent='Please verify your administrator email before proceeding.';loadingLogin(false);return;}
  try{
    loadingLogin(true,'Checking access');
    const preferred=new URLSearchParams(location.search).get('hospital')||persistent.getItem('turnahead-hospital');
    const session=await resolveWorkspace(user,preferred,m=>m.role==='owner');if(seq!==authEpoch)return;
    me=session.member;
    if(!me){$('guard-message').textContent='Google/email authentication succeeded, but no active administrator workspace was found for this account. In TCC, finish Provision staging hospital for the approved registration, then check access again.';pendingLogin=false;loadingLogin(false);return;}
    const resolved=session.hospital;if(seq!==authEpoch)return;
    if(resolved.ownerUid!==user.uid)throw Error('Access denied. Only the designated owner may use administration.');
    hospital=resolved;
    persistent.setItem('turnahead-hospital',hospital.id);
    show('admin-guard',false);show('admin-content',true);show('admin-sign-out',true);accountMenu.show(true);loadingLogin(false);
    $('admin-hospital-name').textContent=`${hospital.name} · Live hospital operations`;
    $('admin-role').textContent='ADMINISTRATOR';$('settings-name').value=hospital.name;showGraceValue(hospital.recallGraceMinutes||10);renderOwnAvatar();renderCustomization(hospital);subscription.start(hospital.id);showAdminSection('overview');
    $('open-reception').href=boardLink(hospital.id,location.href);
    if(pendingLogin){toast('Administrator logged in successfully.');pendingLogin=false;}
    const revoke=()=>{if(seq!==authEpoch)return;authEpoch++;stop();show('admin-content',false);show('admin-guard',true);$('guard-message').textContent='Administrator access changed. Sign in again or contact the hospital operator.';};
    unsubs.push(watchMembership(hospital.id,user.uid,m=>{if(seq!==authEpoch)return;if(!m?.active||m.role!=='owner')revoke();},revoke));
    // Start all four streams at once for a responsive admin dashboard.
    unsubs.push(watchHospitalMembers(hospital.id,data=>{if(seq!==authEpoch)return;members=data;me=data.find(m=>m.uid===auth.currentUser?.uid)||me;renderOwnAvatar();renderMembers();renderTickets();displayMetrics();},e=>toast(helpfulError(e),true)));
    unsubs.push(watchInvitations(hospital.id,data=>{if(seq!==authEpoch)return;invites=data;renderInvites();displayMetrics();},e=>toast(helpfulError(e),true)));
    unsubs.push(watchDoctors(hospital.id,data=>{if(seq!==authEpoch)return;doctors=data;renderDoctors();subscription.usage();},e=>toast(helpfulError(e),true)));
    unsubs.push(observeQueues(hospital.id,data=>{if(seq!==authEpoch)return;departments=data;renderDepartments();renderDoctors();displayMetrics();if(historyLoaded){const open=$('history-days').querySelector('[data-history-day][open]');if(open&&!open.querySelector('[data-history-dept] option')&&departments.length)renderHistory();}},e=>toast(helpfulError(e),true)));
    unsubs.push(observeTickets(hospital.id,data=>{if(seq!==authEpoch)return;tickets=data;renderTickets();},e=>toast(helpfulError(e),true),100));
  }catch(e){if(seq===authEpoch){$('guard-message').textContent=helpfulError(e);pendingLogin=false;loadingLogin(false);}}
}
$('admin-login-form').addEventListener('submit',async e=>{
  e.preventDefault();if(loginButton.disabled)return;
  loadingLogin(true);$('admin-login-error').textContent='';pendingLogin=true;
  try{await login($('admin-email').value,$('admin-password').value);$('admin-password').value='';}
  catch(err){pendingLogin=false;loadingLogin(false);$('admin-login-error').textContent=helpfulError(err);}
});
$('admin-google-login')?.addEventListener('click',async()=>{
 const button=$('admin-google-login');if(button.disabled||loginButton.disabled)return;button.disabled=true;loadingLogin(true,'Opening Google sign-in');pendingLogin=true;$('admin-login-error').textContent='';
 try{await startStagingGoogle(auth);}
 catch(e){pendingLogin=false;loadingLogin(false);$('admin-login-error').textContent=helpfulError(e);}
 finally{button.disabled=false;}
});
$('admin-verify').addEventListener('click',async()=>{try{await requestVerification();if(await refreshVerification())await initialize();else toast('Verification email sent. Please open it and return here.');}catch(e){toast(helpfulError(e),true);}});
$('admin-check-access')?.addEventListener('click',()=>initialize());
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
$('grace-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{const minutes=$('recall-grace').value==='custom'?Number($('recall-grace-custom').value):Number($('recall-grace').value);await updateRecallGrace(hospital.id,minutes);hospital=await getHospital(hospital.id);showGraceValue(hospital.recallGraceMinutes);toast('Recall grace period saved.');}catch(err){toast(helpfulError(err),true);}finally{b.disabled=false;}});
$('settings-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
try{await renameHospital(hospital.id,$('settings-name').value);hospital=await getHospital(hospital.id);$('admin-hospital-name').textContent=`${hospital.name} · Live hospital operations`;toast('Hospital name saved.');}catch(e){toast(helpfulError(e),true);}finally{btn.disabled=false;}});
$('admin-sign-out').addEventListener('click',async()=>{pendingLogout=true;authEpoch++;stop();show('admin-content',false);show('admin-guard',true);try{await logout();}catch(e){pendingLogout=false;toast(helpfulError(e),true);}});
bindV3(()=>({hospital,departments,doctors,members,analyticsAccess:subscription.analyticsAccess()}),toast);
if(configured)observeAuth(()=>initialize());else initialize();
if(configured)finishStagingGoogle(auth).then(result=>{if(result?.user&&auth.currentUser?.uid===result.user.uid)return initialize();}).catch(e=>{if(auth.currentUser)return;pendingLogin=false;loadingLogin(false);$('admin-login-error').textContent=helpfulError(e);});

$('admin-profile-file').addEventListener('change',async e=>{
 if(!hospital||!me)return;const file=e.target.files?.[0];if(!file)return;
 const epoch=authEpoch,hid=hospital.id,input=e.target;input.disabled=true;accountMenu.busy(true);
 try{const photo=await compressProfilePhoto(file);if(epoch!==authEpoch||hospital?.id!==hid)return;await updateOwnProfilePhoto(hid,photo);if(epoch===authEpoch&&!(hospital?.id!==hid))toast('Profile photo saved.');}
 catch(err){if(epoch===authEpoch)toast(helpfulError(err),true);}finally{input.value='';input.disabled=false;accountMenu.busy(false);}
});
$('admin-profile-remove').addEventListener('click',async()=>{
 if(!hospital||!me)return;const epoch=authEpoch,hid=hospital.id;accountMenu.busy(true);
 try{await updateOwnProfilePhoto(hid,'');if(epoch===authEpoch&&!(hospital?.id!==hid))toast('Profile photo removed.');}
 catch(err){if(epoch===authEpoch)toast(helpfulError(err),true);}finally{accountMenu.busy(false);}
});

function applyHistoryFilters(parent){
 if(!parent)return;const filters=[...parent.querySelectorAll('[data-filter]')].map(x=>[x.dataset.filter,x.value]);let shown=0;
 for(const row of parent.querySelectorAll('.history-record')){row.hidden=!filters.every(([key,value])=>!value||row.getAttribute('data-filter-'+key)===value);if(!row.hidden)shown++;}
 parent.querySelector('[data-filter-count]').textContent=shown+' matching loaded records';
}
async function loadActivity(){
 if(!hospital)return;const hid=hospital.id,epoch=authEpoch,el=$('activity-list');el.textContent='Loading recent operations…';
 try{const [changes,events]=await Promise.all([readTicketChanges(hid),readActivity(hid)]);const rows=[...changes,...events].sort((a,b)=>(b.createdAt?.toMillis()||0)-(a.createdAt?.toMillis()||0)).slice(0,100);if(epoch!==authEpoch||hospital?.id!==hid)return;
 el.innerHTML=rows.length?rows.map(r=>'<div class="admin-person"><div class="person-info"><strong>'+esc(r.kind==='department-transfer'?'Department transfer':r.kind==='transfer'?'Doctor transfer':r.kind==='correction'?'Patient details corrected':r.kind.replace(/-/g,' ').replace(/^./,x=>x.toUpperCase()))+'</strong><small>'+esc(issuingReceptionist({issuedBy:r.actorUid}))+' · '+esc(r.createdAt?.toDate()?.toLocaleString('en-PK',{timeZone:'Asia/Karachi'})||'—')+'</small></div><span class="role-chip">'+esc(r.kind)+'</span></div>').join(''):'<div class="empty-state">No operations recorded yet.</div>';
 }catch(e){if(epoch===authEpoch)el.textContent=helpfulError(e);}
}
$('activity-refresh').addEventListener('click',loadActivity);
$('onboarding-list').addEventListener('click',e=>{const b=e.target.closest('[data-setup-section]');if(b)showAdminSection(b.dataset.setupSection,true);});

$('history-days').addEventListener('click',async e=>{
 const cancel=e.target.closest('[data-history-cancel]');if(cancel){fullHistoryGeneration++;return;}
 const b=e.target.closest('[data-history-full]');if(!b||!hospital)return;
 const parent=b.closest('[data-history-day]'),result=parent.querySelector('[data-history-results]'),more=parent.querySelector('[data-history-more]'),stopButton=parent.querySelector('[data-history-cancel]');
 const date=b.dataset.historyFull,epoch=authEpoch,hid=hospital.id,token=++fullHistoryGeneration,request=String(++historyRequest);parent.dataset.request=request;
 const filters=Object.fromEntries([...parent.querySelectorAll('[data-filter]')].map(x=>[x.dataset.filter,x.value]));
 filters.department=parent.querySelector('[data-full-scope]').value==='all'?'':parent.querySelector('[data-history-dept]').value;filters.code=parent.querySelector('[data-history-code]').value.trim().toUpperCase();
 const cancelled=()=>epoch!==authEpoch||hospital?.id!==hid||token!==fullHistoryGeneration||!parent.isConnected||parent.dataset.request!==request;
 b.disabled=true;stopButton.hidden=false;more.hidden=true;result.setAttribute('aria-busy','true');result.textContent='Searching all archive pages…';
 try{
  const data=await searchHistoryDate(hid,date,departments.map(x=>x.id),filters,cancelled,n=>{if(!cancelled())result.textContent='Scanned '+n+' records…';});
  if(cancelled())return;
  const renderPage=(offset=0)=>{
   if(cancelled())return;
   const end=Math.min(offset+100,data.records.length);
   result.innerHTML='<p>'+data.records.length+' matching records across '+data.scanned+' scanned. Showing '+(end?offset+1:0)+'–'+end+'.</p>'+data.records.slice(offset,end).map(t=>historyRecordHtml(t,date,t.queueId)).join('');
   const nav=document.createElement('div');nav.className='demo-controls';
   for(const [label,next] of [['Previous',offset-100],['Next',end]])if(next>=0&&next<data.records.length&&next!==offset){const button=document.createElement('button');button.type='button';button.className='btn btn-small btn-outline';button.textContent=label;button.onclick=()=>renderPage(next);nav.append(button);}
   result.append(nav);parent.querySelector('[data-filter-count]').textContent=data.records.length+' matching full-date records';
  };renderPage();
 }catch(err){if(epoch===authEpoch&&hospital?.id===hid&&parent.isConnected&&parent.dataset.request===request)result.textContent=token!==fullHistoryGeneration?'Search cancelled.':helpfulError(err);}
 finally{if(parent.isConnected){b.disabled=false;stopButton.hidden=true;if(parent.dataset.request===request)result.removeAttribute('aria-busy');}}
});
