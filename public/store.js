/** Hospital-scoped Firestore queues, atomic ticket transitions and private dated history. */
import {
  collection,doc,getDocs,onSnapshot,runTransaction,query,orderBy,limit,where,startAfter,deleteField
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
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
  await Promise.all(list.docs.map(q=>rollOverQueue(hid,q.id)));
}
export function observeQueues(hid,next,error){
  return onSnapshot(collection(db,'hospitals',hid,'queues'),snap=>next(snap.docs.map(d=>publicQueue(d.id,d.data())).sort((a,b)=>a.name.localeCompare(b.name))),error);
}
export function observeTickets(hid,next,error,maxItems=25){
  return onSnapshot(query(collection(db,'hospitals',hid,'tickets'),orderBy('createdAt','desc'),limit(Math.max(1,Math.min(100,maxItems)))),
    snap=>next(snap.docs.map(d=>({id:d.id,...d.data()}))),error);
}
export function observeTicket(hid,id,next,error){
  return onSnapshot(hid?ticketDoc(hid,id):doc(db,'tickets',id),{includeMetadataChanges:true},
    snap=>next(snap.exists()?{id:snap.id,...snap.data(),_fromCache:snap.metadata.fromCache}:null),error);
}
/** Force a network read on Safari resume/foreground; never mistake stale cache for live status. */
export async function fetchTicketFromServer(hid,id){
  const {getDocFromServer}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
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
    tx.set(controlDoc(hid,id),initialControl());
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
    const [qs,cs,ds,doctorSnap]=await Promise.all([tx.get(qr),tx.get(cr),tx.get(dr),tx.get(doctorDoc(hid,details.doctorId))]);
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
    return ticket;
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
    const [qs,cs,doctorSnap]=await Promise.all([tx.get(qr),tx.get(cr),tx.get(doctorDoc(hid,doctorId))]);
    if(!qs.exists()||!cs.exists()||!doctorSnap.exists()||doctorSnap.data().departmentId!==id)
      throw Error('The selected doctor queue is unavailable.');
    const q=qs.data(),c=cs.data();
    if(q.dayKey!==dayKey())throw Error('A new day has begun. Refresh reception to reset queues.');
    const lane=getDoctorLane(q,doctorId),control=getDoctorControl(c,doctorId);
    if(action==='pause-department'||action==='resume-department'){
      const paused=action==='pause-department';
      tx.update(qr,{paused,updatedAt:now});
      return {status:paused?'paused':'resumed'};
    }
    if(action==='pause'||action==='resume'){
      const paused=action==='pause';
      tx.update(qr,{lanes:{...q.lanes,[doctorId]:{...lane,paused,updatedAt:now}},updatedAt:now});
      return {doctorName:doctorSnap.data().name,status:paused?'paused':'resumed'};
    }
    // Finishing a patient must remain possible during an unexpected doctor break.
    if(action==='next'){
      if(q.paused||lane.paused)throw Error('This doctor queue is paused. Resume it first.');
      const first=nextInLine(lane,control),tr=ticketDoc(hid,first.id),ts=await tx.get(tr);
      if(!ts.exists())throw Error('Ticket changed. Refresh reception.');
      const original=ts.data();
      const plan=planDoctorCall(q,c,doctorId,original,first.id,counter,uid,now);
      tx.update(qr,plan.queuePatch);tx.update(cr,plan.controlPatch);tx.update(tr,plan.ticketPatch);
      if(original.patientName)tx.update(historyDoc(hid,original.dayKey,id,first.id),plan.historyPatch);
      return {code:original.code,counter};
    }
    if(!['complete','skip'].includes(action))throw Error('Unknown queue action');
    if(!control.activeId||!lane.active)throw Error('There is no active ticket for this doctor.');
    const tr=ticketDoc(hid,control.activeId),ts=await tx.get(tr);
    if(!ts.exists())throw Error('Active ticket changed. Refresh reception.');
    const old=ts.data(),plan=planDoctorFinish(q,c,doctorId,old,counter,uid,action,now);
    tx.update(qr,plan.queuePatch);tx.update(cr,plan.controlPatch);tx.update(tr,plan.ticketPatch);
    if(old.patientName)tx.update(historyDoc(hid,old.dayKey,id,control.activeId),plan.historyPatch);
    return {code:old.code,status:plan.ticketPatch.status,counter};
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
  const {setDoc,serverTimestamp}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
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
    if(old.patientName)tx.update(historyDoc(hid,old.dayKey,queueId,ticketId),{...plan.historyPatch,calledCounter:''});
    return {code:old.code,minutes};
  });
}
