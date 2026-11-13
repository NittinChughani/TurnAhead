/** Hospital-scoped Firestore queues, atomic ticket transitions and private dated history. */
import {
  collection,doc,getDocs,onSnapshot,runTransaction,query,orderBy,limit,where,startAfter
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {db} from './firebase.js';
import {dayKey,departmentPrefix,initialQueue,initialControl,normalizedQueue,
  nextTicket,nextInLine,publicQueue} from './queue-engine.js';
import {ticketLink} from './org-model.js';

const ref=(hid,group,id)=>doc(db,'hospitals',hid,group,id);
const qDoc=(hid,id)=>ref(hid,'queues',id);
const controlDoc=(hid,id)=>ref(hid,'controls',id);
const ticketDoc=(hid,id)=>ref(hid,'tickets',id);
const metaDoc=hid=>ref(hid,'meta','sequence');
const prefixDoc=(hid,prefix)=>ref(hid,'prefixes',prefix);
const dayDoc=(hid,day)=>ref(hid,'history',day);
const historyCollection=(hid,day,qid)=>collection(db,'hospitals',hid,'history',day,'departments',qid,'records');
const historyDoc=(hid,day,qid,ticketId)=>doc(historyCollection(hid,day,qid),ticketId);
const archiveTicket=(ticketId,t,now)=>({ticketId,queueId:t.queueId,queueName:t.queueName,
  code:t.code,number:t.number,dayKey:t.dayKey,patientName:t.patientName,
  status:t.status,attendance:t.attendance,issuedAt:t.createdAt,calledAt:t.calledAt,
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
        tx.update(qr,{prefix:departmentPrefix(q.name),lastNumber:-1,updatedAt:Date.now()});
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
  return onSnapshot(hid?ticketDoc(hid,id):doc(db,'tickets',id),snap=>next(snap.exists()?{id:snap.id,...snap.data()}:null),error);
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
export async function issueTicket(hid,id,patientName){
  const tr=doc(collection(db,'hospitals',hid,'tickets'));
  const now=Date.now(),today=dayKey();
  const ticket=await runTransaction(db,async tx=>{
    const qr=qDoc(hid,id),cr=controlDoc(hid,id),dr=dayDoc(hid,today);
    const [qs,cs,ds]=await Promise.all([tx.get(qr),tx.get(cr),tx.get(dr)]);
    if(!qs.exists()||!cs.exists())throw Error('Unknown department. Refresh reception.');
    const changed=qs.data().dayKey!==today;
    const {queue,ticket}=nextTicket(qs.data(),tr.id,today,now,patientName);
    ticket.queueId=id;
    const c=changed?initialControl():cs.data();
    tx.set(qr,queue);tx.set(cr,{...c,pending:[...c.pending,{id:tr.id,number:ticket.number}]});
    tx.set(tr,ticket);
    if(!ds.exists())tx.set(dr,{dayKey:today,createdAt:now});
    tx.set(historyDoc(hid,today,id,tr.id),archiveTicket(tr.id,ticket,now));
    return ticket;
  });
  return {...ticket,id:tr.id,queue:ticket.queueName,trackingUrl:ticketLink(hid,tr.id,window.location.href)};
}
export async function performAction(hid,id,action){
  if(action==='pause'||action==='resume'){
    await runTransaction(db,async tx=>{
      const qr=qDoc(hid,id),snap=await tx.get(qr);
      if(!snap.exists())throw Error('Unknown department.');
      tx.update(qr,{paused:action==='pause',updatedAt:Date.now()});
    });return {};
  }
  const now=Date.now();
  return runTransaction(db,async tx=>{
    const qr=qDoc(hid,id),cr=controlDoc(hid,id);
    const [qs,cs]=await Promise.all([tx.get(qr),tx.get(cr)]);
    if(!qs.exists()||!cs.exists())throw Error('Department unavailable.');
    const q=qs.data(),c=cs.data();
    if(q.dayKey!==dayKey())throw Error('A new day has begun. Refresh reception to reset the queue.');
    if(action==='next'){
      const first=nextInLine(q,c),tr=ticketDoc(hid,first.id),ts=await tx.get(tr);
      if(!ts.exists()||ts.data().status!=='waiting')throw Error('Ticket status changed. Refresh reception.');
      const original=ts.data(),called={...original,status:'called',calledAt:now};
      tx.update(qr,{waitingNumbers:q.waitingNumbers.slice(1),active:{code:original.code,number:first.number},updatedAt:now});
      tx.update(cr,{pending:c.pending.slice(1),activeId:first.id,activeSince:now});
      tx.update(tr,{status:'called',calledAt:now});
      if(original.patientName)tx.update(historyDoc(hid,original.dayKey,id,first.id),{status:'called',calledAt:now,updatedAt:now});
      return {code:original.code};
    }
    if(!['complete','skip'].includes(action))throw Error('Unknown queue action');
    if(!c.activeId||!q.active)throw Error('There is no active ticket to finish.');
    const tr=ticketDoc(hid,c.activeId),ts=await tx.get(tr);
    if(!ts.exists()||ts.data().status!=='called')throw Error('Active ticket changed. Refresh reception.');
    const old=ts.data(),status=action==='complete'?'completed':'skipped';
    const attendance=action==='complete'?'present':'missed';
    const patch={active:null,updatedAt:now};
    if(action==='complete'){
      const minutes=Math.max(1,Math.min(40,(now-(c.activeSince||now))/60000));
      const sample=Math.min(9,q.served||0);
      patch.avgMinutes=Math.round(((Number(q.avgMinutes)||8)*sample+minutes)/(sample+1));
      patch.served=(q.served||0)+1;
    }
    tx.update(qr,patch);tx.update(cr,{activeId:null,activeSince:null});
    tx.update(tr,{status,attendance,finishedAt:now});
    if(old.patientName)tx.update(historyDoc(hid,old.dayKey,id,c.activeId),{status,attendance,finishedAt:now,updatedAt:now});
    return {code:old.code,status};
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
