/** Hospital-scoped Firestore queues, atomic ticket transitions and private dated history. */
import {
  collection,doc,getDocs,getDocsFromServer,getDocFromServer,onSnapshot,runTransaction,query,orderBy,limit,where,startAfter,deleteField,setDoc,serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {appendActivity} from './activity-store.js?v=3.3.0';
import {planTicketChange,planDepartmentTransfer} from './ticket-change.js?v=3.3.0';
import {mapLimited} from './reliability.js?v=3.2.0';
import {hospitalCustomization} from './hospital-custom.js?v=3.1.0';
import {db,auth} from './firebase.js';
import {dayKey,departmentPrefix,initialQueue,initialControl,normalizedQueue,
  nextTicket,nextInLine,publicQueue,getDoctorLane,getDoctorControl,counterLabel,planDoctorCall,planDoctorFinish} from './queue-engine.js?v=2.6.2';
import {ticketLink} from './org-model.js';
import {cleanRoomNumber,doctorAvailable} from './doctor-model.js';
import {planRecall,safeFeedback,graceMinutes} from './v26-engine.js?v=2.6.2';

const ref=(hid,group,id)=>doc(db,'hospitals',hid,group,id);
const qDoc=(hid,id)=>ref(hid,'queues',id);
const controlDoc=(hid,id)=>ref(hid,'controls',id);
const ticketDoc=(hid,id)=>ref(hid,'tickets',id);
const metaDoc=hid=>ref(hid,'meta','sequence');
const prefixDoc=(hid,prefix)=>ref(hid,'prefixes',prefix);
const dayDoc=(hid,day)=>ref(hid,'history',day);
const feedbackDoc=(hid,ticketId)=>ref(hid,'feedback',ticketId);
const doctorDoc=(hid,id)=>ref(hid,'doctors',id);
const historyCollection=(hid,day,qid)=>collection(db,'hospitals',hid,'history',day,'departments',qid,'records');
const historyDoc=(hid,day,qid,ticketId)=>doc(historyCollection(hid,day,qid),ticketId);
const archiveTicket=(ticketId,t,now)=>({ticketId,queueId:t.queueId,queueName:t.queueName,
  code:t.code,number:t.number,dayKey:t.dayKey,patientName:t.patientName,
  patientGender:t.patientGender,doctorId:t.doctorId,doctorName:t.doctorName,roomNumber:t.roomNumber,
  status:t.status,attendance:t.attendance,issuedBy:t.issuedBy||'',issuedCounter:t.issuedCounter||'',
  calledCounter:t.calledCounter||'',calledBy:'',finishedBy:'',issuedAt:t.createdAt,calledAt:t.calledAt,
  finishedAt:t.finishedAt,updatedAt:now});

export async function bootstrap(hid){
  await runTransaction(db,async tx=>{
    const mr=metaDoc(hid),meta=await tx.get(mr);
    if(meta.exists())return;
    const now=Date.now();
    tx.set(mr,{nextPrefix:1});
    tx.set(qDoc(hid,'general-opd'),initialQueue('General OPD','GEN',dayKey(),now));
    tx.set(controlDoc(hid,'general-opd'),initialControl());
    tx.set(prefixDoc(hid,'GEN'),{queueId:'general-opd'});
  });
}
export async function rollOverQueue(hid,id){
  await runTransaction(db,async tx=>{
    const qr=qDoc(hid,id),cr=controlDoc(hid,id);
    const [qs,cs]=await Promise.all([tx.get(qr),tx.get(cr)]);
    if(!qs.exists()||!cs.exists())return;
    const q=qs.data(),today=dayKey();
    if(q.dayKey===today){
      // An untouched legacy v2.2 queue can adopt its 3-letter code immediately.
      if(q.lastNumber===0&&!q.waitingNumbers?.length&&!q.active&&!q.served &&
        q.prefix!==departmentPrefix(q.name))
        tx.update(qr,{prefix:departmentPrefix(q.name),lastNumber:0,updatedAt:Date.now()});
      return;
    }
    tx.set(qr,normalizedQueue(q,today,Date.now()));
    tx.set(cr,initialControl());
  });
}
export async function rollOverAll(hid){
  const list=await getDocs(collection(db,'hospitals',hid,'queues'));
  await mapLimited(list.docs,4,q=>rollOverQueue(hid,q.id));
}
export function observeQueues(hid,next,error){
  return onSnapshot(collection(db,'hospitals',hid,'queues'),{includeMetadataChanges:true},snap=>next(snap.docs.map(d=>publicQueue(d.id,d.data())).sort((a,b)=>a.name.localeCompare(b.name)),{confirmed:!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites}),error);
}
export function observeTickets(hid,next,error,maxItems=25){
  return onSnapshot(query(collection(db,'hospitals',hid,'tickets'),orderBy('createdAt','desc'),limit(Math.max(1,Math.min(100,maxItems)))),
    snap=>next(snap.docs.map(d=>({id:d.id,...d.data()}))),error);
}
export function observeTicket(hid,id,next,error){
  return onSnapshot(hid?ticketDoc(hid,id):doc(db,'tickets',id),{includeMetadataChanges:true},
    snap=>next(snap.exists()?{id:snap.id,...snap.data(),_fromCache:snap.metadata.fromCache}:null,{fromCache:snap.metadata.fromCache}),error);
}
/** Force a network read on Safari resume/foreground; never mistake stale cache for live status. */
export async function fetchTicketFromServer(hid,id){
  const snap=await getDocFromServer(hid?ticketDoc(hid,id):doc(db,'tickets',id));
  return snap.exists()?{id:snap.id,...snap.data(),_fromCache:false}:null;
}

export function observeQueue(hid,id,next,error){
  return onSnapshot(hid?qDoc(hid,id):doc(db,'queues',id),snap=>next(snap.exists()?publicQueue(id,snap.data()):null),error);
}
export async function createQueue(hid,name){
  name=name.trim();if(name.length<3||name.length>45)throw Error('Department name must be 3–45 characters.');
  const prefix=departmentPrefix(name),id=doc(collection(db,'hospitals',hid,'queues')).id;
  // Older installations may have departments without a prefix reservation yet.
  const existing=await getDocs(collection(db,'hospitals',hid,'queues'));
  if(existing.docs.some(d=>departmentPrefix(d.data().name)===prefix))
    throw Error(`The prefix ${prefix} is already used. Choose a department name with different first three letters.`);
  await runTransaction(db,async tx=>{
    const mr=metaDoc(hid),pr=prefixDoc(hid,prefix);
    const [meta,reserved]=await Promise.all([tx.get(mr),tx.get(pr)]);
    if(!meta.exists())throw Error('Organization setup is incomplete. Contact an administrator.');
    if(reserved.exists())throw Error(`Department prefix ${prefix} is already registered.`);
    tx.update(mr,{nextPrefix:(meta.data().nextPrefix||1)+1});
    tx.set(pr,{queueId:id});
    const now=Date.now();tx.set(qDoc(hid,id),initialQueue(name,prefix,dayKey(),now));
    tx.set(controlDoc(hid,id),initialControl());appendActivity(tx,hid,'department-created');
  });
  return {id,name,prefix};
}
export async function issueTicket(hid,id,patientName,details={}){
  // The issuer's Firebase UID is stored only in the owner-readable archive, never in the public QR ticket.
  const issuedBy=auth.currentUser?.uid;
  if(!issuedBy)throw Error('Sign in as authorized reception staff to issue a ticket.');
  const issuedCounter=counterLabel(details.counterNumber);
  const tr=doc(collection(db,'hospitals',hid,'tickets'));
  const now=Date.now(),today=dayKey();
  const ticket=await runTransaction(db,async tx=>{
    const qr=qDoc(hid,id),cr=controlDoc(hid,id),dr=dayDoc(hid,today);
    if(!/^[A-Za-z0-9]{20}$/.test(details.doctorId||''))throw Error('Select a registered doctor.');
    const [qs,cs,ds,doctorSnap,hs]=await Promise.all([tx.get(qr),tx.get(cr),tx.get(dr),tx.get(doctorDoc(hid,details.doctorId)),tx.get(doc(db,'hospitals',hid))]);
    if(!hs.exists()||hs.data().status!=='active'||Number(details.counterNumber||1)>hospitalCustomization(hs.data()).counters)throw Error('Select a configured reception counter.');
    if(!doctorSnap.exists()||!doctorAvailable(doctorSnap.data(),id))throw Error('Doctor is not available in the selected department. Refresh the doctor list.');
    const doctor=doctorSnap.data();
    const finalDetails={patientGender:details.patientGender,roomNumber:cleanRoomNumber(details.roomNumber,{required:true}),doctorId:details.doctorId,doctorName:doctor.name};
    if(!qs.exists()||!cs.exists())throw Error('Unknown department. Refresh reception.');
    const changed=qs.data().dayKey!==today;
    const {queue,ticket}=nextTicket(qs.data(),tr.id,today,now,patientName,finalDetails);
    ticket.queueId=id;
    const c=changed?initialControl():cs.data();
    const previous=getDoctorControl(c,details.doctorId);
    const lanes={...c.lanes,[details.doctorId]:{...previous,pending:[...previous.pending,{id:tr.id,number:ticket.number}]}};
    tx.set(qr,queue);tx.set(cr,{...c,lanes});
    tx.set(tr,ticket);
    if(!ds.exists())tx.set(dr,{dayKey:today,createdAt:now});
    // Retain who issued the ticket and the issuing counter in private history only.
    tx.set(historyDoc(hid,today,id,tr.id),{...archiveTicket(tr.id,ticket,now),issuedBy,issuedCounter});
    appendActivity(tx,hid,'ticket-issued');return ticket;
  });
  return {...ticket,id:tr.id,queue:ticket.queueName,trackingUrl:ticketLink(hid,tr.id,window.location.href)};
}
/** All doctor actions operate on one lane, atomically, within the department documents.
 * Every counter uses the same transaction. The control document is member-only.
 * A counter which called a patient must complete/skip at that counter; another
 * receptionist can take over by selecting that same counter if needed.
 */
export async function performAction(hid,id,action,doctorId,counterNumber=1){
  if(!/^[A-Za-z0-9]{20}$/.test(doctorId||''))throw Error('Select a registered doctor queue.');
  const counter=counterLabel(counterNumber),uid=auth.currentUser?.uid;
  if(!uid)throw Error('Sign in to manage this queue.');
  const now=Date.now();
  return runTransaction(db,async tx=>{
    const qr=qDoc(hid,id),cr=controlDoc(hid,id);
    const [qs,cs,doctorSnap,hs]=await Promise.all([tx.get(qr),tx.get(cr),tx.get(doctorDoc(hid,doctorId)),tx.get(doc(db,'hospitals',hid))]);
    if(!hs.exists()||hs.data().status!=='active')throw Error('Hospital workspace unavailable.');
    if(action==='next'&&Number(counterNumber)>hospitalCustomization(hs.data()).counters)throw Error('Select a configured reception counter.');
    if(!qs.exists()||!cs.exists()||!doctorSnap.exists()||doctorSnap.data().departmentId!==id)
      throw Error('The selected doctor queue is unavailable.');
    const q=qs.data(),c=cs.data();
    if(q.dayKey!==dayKey())throw Error('A new day has begun. Refresh reception to reset queues.');
    const lane=getDoctorLane(q,doctorId),control=getDoctorControl(c,doctorId);
    if(action==='pause-department'||action==='resume-department'){
      const paused=action==='pause-department';
      tx.update(qr,{paused,updatedAt:now});
      appendActivity(tx,hid,paused?'department-paused':'department-resumed');return {status:paused?'paused':'resumed'};
    }
    if(action==='pause'||action==='resume'){
      const paused=action==='pause';
      tx.update(qr,{lanes:{...q.lanes,[doctorId]:{...lane,paused,updatedAt:now}},updatedAt:now});
      appendActivity(tx,hid,paused?'doctor-paused':'doctor-resumed');return {doctorName:doctorSnap.data().name,status:paused?'paused':'resumed'};
    }
    // Finishing a patient must remain possible during an unexpected doctor break.
    if(action==='next'){
      if(q.paused||lane.paused)throw Error('This doctor queue is paused. Resume it first.');
      const first=nextInLine(lane,control),tr=ticketDoc(hid,first.id),ts=await tx.get(tr);
      if(!ts.exists())throw Error('Ticket changed. Refresh reception.');
      const original=ts.data();
      const plan=planDoctorCall(q,c,doctorId,original,first.id,counter,uid,now);
      tx.update(qr,plan.queuePatch);tx.update(cr,plan.controlPatch);tx.update(tr,plan.ticketPatch);
      if(original.patientName)tx.update(historyDoc(hid,original.dayKey,original.originQueueId||id,first.id),plan.historyPatch);
      appendActivity(tx,hid,'ticket-called');return {code:original.code,counter};
    }
    if(!['complete','skip'].includes(action))throw Error('Unknown queue action');
    if(!control.activeId||!lane.active)throw Error('There is no active ticket for this doctor.');
    const tr=ticketDoc(hid,control.activeId),ts=await tx.get(tr);
    if(!ts.exists())throw Error('Active ticket changed. Refresh reception.');
    const old=ts.data(),plan=planDoctorFinish(q,c,doctorId,old,counter,uid,action,now);
    tx.update(qr,plan.queuePatch);tx.update(cr,plan.controlPatch);tx.update(tr,plan.ticketPatch);
    if(old.patientName)tx.update(historyDoc(hid,old.dayKey,old.originQueueId||id,control.activeId),plan.historyPatch);
    appendActivity(tx,hid,action==='complete'?'ticket-completed':'ticket-skipped');return {code:old.code,status:plan.ticketPatch.status,counter};
  });
}
/** Day documents are created transactionally with the first ticket each day. */
export async function listHistoryDays(hid){
  const snap=await getDocs(query(collection(db,'hospitals',hid,'history'),orderBy('dayKey','desc')));
  return snap.docs.map(d=>d.id);
}
/** Day/department-specific records. Exact ticket code search queries the full archive. */
export async function readHistory(hid,date,departmentId,code='',cursor=null){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid archive date.');
  const coll=historyCollection(hid,date,departmentId);
  const number=String(code||'').trim().toUpperCase();
  const search=number?query(coll,where('code','==',number),limit(50)):
    cursor?query(coll,orderBy('issuedAt','desc'),startAfter(cursor),limit(100)):
      query(coll,orderBy('issuedAt','desc'),limit(100));
  const snap=await getDocs(search);
  return {records:snap.docs.map(d=>({id:d.id,...d.data()})),cursor:number?null:(snap.docs.at(-1)||null),hasMore:!number&&snap.docs.length===100};
}

/** Single-shot feedback: a completed ticket can create one private owner-readable record. */
export async function submitFeedback(hid,ticketId,rating,note){
  const safe=safeFeedback(rating,note);
  await setDoc(feedbackDoc(hid,ticketId),{ticketId,...safe,createdAt:serverTimestamp()});
}
export function observeFeedback(hid,next,error){
  return onSnapshot(query(collection(db,'hospitals',hid,'feedback'),orderBy('createdAt','desc'),limit(40)),
    snap=>next(snap.docs.map(d=>({id:d.id,...d.data()}))),error);
}
/** Atomically return one missed patient to the END of their doctor lane within owner-defined grace. */
export async function recallMissedTicket(hid,queueId,ticketId){
  const uid=auth.currentUser?.uid;
  if(!uid)throw Error('Staff authorization is required.');
  const now=Date.now(),today=dayKey();
  return runTransaction(db,async tx=>{
    const qr=qDoc(hid,queueId),cr=controlDoc(hid,queueId),tr=ticketDoc(hid,ticketId);
    const hospitalRef=doc(db,'hospitals',hid);
    const [qs,cs,ts,hs]=await Promise.all([tx.get(qr),tx.get(cr),tx.get(tr),tx.get(hospitalRef)]);
    if(!qs.exists()||!cs.exists()||!ts.exists()||!hs.exists())throw Error('Ticket or hospital unavailable.');
    const old=ts.data();
    if(old.queueId!==queueId)throw Error('Ticket belongs to a different department.');
    const minutes=graceMinutes(hs.data().recallGraceMinutes);
    const plan=planRecall(qs.data(),cs.data(),old,ticketId,now,minutes,today);
    tx.update(qr,plan.queuePatch);tx.update(cr,plan.controlPatch);tx.update(tr,{...plan.ticketPatch,calledCounter:deleteField()});
    if(old.patientName)tx.update(historyDoc(hid,old.dayKey,old.originQueueId||queueId,ticketId),{...plan.historyPatch,calledCounter:''});
    appendActivity(tx,hid,'ticket-recalled');return {code:old.code,minutes};
  });
}

export async function setDoctorDelay(hid,qid,doctorId,reason){
 if(!['','running-late','unexpected-delay','extended-service'].includes(reason))throw Error('Choose a standard delay message.');
 if(!auth.currentUser)throw Error('Sign in first.');
 return runTransaction(db,async tx=>{
  const qr=qDoc(hid,qid),[qs,ds]=await Promise.all([tx.get(qr),tx.get(doctorDoc(hid,doctorId))]);
  if(!qs.exists()||!ds.exists()||ds.data().departmentId!==qid||qs.data().dayKey!==dayKey())throw Error('Refresh the selected doctor queue.');
  const q=qs.data(),lane=getDoctorLane(q,doctorId),now=Date.now();
  tx.update(qr,{lanes:{...q.lanes,[doctorId]:{...lane,pauseReason:reason,updatedAt:now}},updatedAt:now});appendActivity(tx,hid,'delay-updated');
 });
}

export async function changeWaitingTicket(hid,qid,ticketId,doctorId,details){
 const uid=auth.currentUser?.uid;if(!uid)throw Error('Sign in first.');
 const event=doc(collection(db,'hospitals',hid,'ticketChanges'));
 return runTransaction(db,async tx=>{
  const qr=qDoc(hid,qid),cr=controlDoc(hid,qid),tr=ticketDoc(hid,ticketId);
  const [qs,cs,ts,ds]=await Promise.all([tx.get(qr),tx.get(cr),tx.get(tr),tx.get(doctorDoc(hid,doctorId))]);
  if(!qs.exists()||!cs.exists()||!ts.exists()||!ds.exists()||ts.data().queueId!==qid)throw Error('Ticket or doctor no longer available.');
  const t=ts.data(),doctor=ds.data(),now=Date.now(),target=doctor.departmentId;
  let plan,dqr,dcr;
  if(target!==qid){
   dqr=qDoc(hid,target);dcr=controlDoc(hid,target);
   const [dqs,dcs]=await Promise.all([tx.get(dqr),tx.get(dcr)]);
   if(!dqs.exists()||!dcs.exists())throw Error('Destination unavailable.');
   plan=planDepartmentTransfer(qs.data(),cs.data(),dqs.data(),dcs.data(),t,ticketId,doctor,doctorId,target,details,now,dayKey());
  }else plan=planTicketChange(qs.data(),cs.data(),t,ticketId,doctor,doctorId,details,now,dayKey());
  if(plan.queuePatch){tx.update(qr,plan.queuePatch);tx.update(cr,plan.controlPatch);}
  if(plan.destinationQueuePatch){tx.update(dqr,plan.destinationQueuePatch);tx.update(dcr,plan.destinationControlPatch);}
  tx.update(tr,{...plan.patch,changeId:event.id});
  tx.update(historyDoc(hid,t.dayKey,t.originQueueId||qid,ticketId),plan.archivePatch||{...plan.patch,updatedAt:now});
  tx.set(event,{kind:plan.kind,ticketId,actorUid:uid,fromDoctor:t.doctorId,toDoctor:doctorId,createdAt:serverTimestamp()});
  return {kind:plan.kind,code:plan.patch.code||t.code};
 });
}
export async function readTicketChanges(hid){
 const snap=await getDocs(query(collection(db,'hospitals',hid,'ticketChanges'),orderBy('createdAt','desc'),limit(100)));
 return snap.docs.map(d=>d.data());
}

/** Explicit owner search over a whole selected date, with bounded reads and no silent truncation.
 * Archive paths are immutable issue departments, so search every path for current service department.
 */
export async function searchHistoryDate(hid,date,departmentIds,filters={},cancelled=()=>false,progress=()=>{}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid archive date.');
 const matches=[];let scanned=0,requests=0;
 for(const qid of [...new Set(departmentIds)]){
  let cursor=null;
  do{
   if(cancelled())throw Error('Search cancelled.');
   if(++requests>200)throw Error('Search limit reached. Narrow the date or use the original department.');
   const snap=await getDocsFromServer(query(historyCollection(hid,date,qid),orderBy('issuedAt','desc'),...(cursor?[startAfter(cursor)]:[]),limit(100)));
   if(cancelled())throw Error('Search cancelled.');
   for(const d of snap.docs){
    if(++scanned>10000)throw Error('Search exceeds 10,000 records. Use a narrower original-department search.');
    const t=d.data();
    if(filters.department&&filters.department!==(t.serviceQueueId||t.queueId))continue;
    if(filters.code&&![t.code,t.serviceCode].includes(filters.code))continue;
    if(filters.doctor&&t.doctorId!==filters.doctor||filters.counter&&t.issuedCounter!==filters.counter||filters.staff&&t.issuedBy!==filters.staff||filters.status&&t.status!==filters.status)continue;
    matches.push({id:d.id,...t});
   }
   cursor=snap.size===100?snap.docs.at(-1):null;
   progress(scanned);
  }while(cursor);
 }
 return {records:matches.sort((a,b)=>b.issuedAt-a.issuedAt),scanned};
}
