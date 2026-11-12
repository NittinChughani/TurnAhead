/** Scoped, transactional queue storage. Every queue belongs to one hospital. */
import {
  collection, doc, getDocs, onSnapshot, runTransaction, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';
import { dayKey, prefixFor, initialQueue, initialControl, normalizedQueue,
  nextTicket, nextInLine, publicQueue } from './queue-engine.js';
import { ticketLink } from './org-model.js';

const ref=(hid,group,id)=>doc(db,'hospitals',hid,group,id);
const qDoc=(hid,id)=>ref(hid,'queues',id);
const controlDoc=(hid,id)=>ref(hid,'controls',id);
const ticketDoc=(hid,id)=>ref(hid,'tickets',id);
const metaDoc=hid=>ref(hid,'meta','sequence');

export async function bootstrap(hid) {
  await runTransaction(db,async tx=>{
    const meta=await tx.get(metaDoc(hid));
    if(meta.exists())return;
    const now=Date.now();
    tx.set(metaDoc(hid),{nextPrefix:1});
    tx.set(qDoc(hid,'general-opd'),initialQueue('General OPD','A',dayKey(),now));
    tx.set(controlDoc(hid,'general-opd'),initialControl());
  });
}
export async function rollOverQueue(hid,id) {
  await runTransaction(db,async tx=>{
    const qRef=qDoc(hid,id),cRef=controlDoc(hid,id);
    const [qs,cs]=await Promise.all([tx.get(qRef),tx.get(cRef)]);
    if(!qs.exists()||!cs.exists()||qs.data().dayKey===dayKey())return;
    tx.set(qRef,normalizedQueue(qs.data(),dayKey(),Date.now()));
    tx.set(cRef,initialControl());
  });
}
export async function rollOverAll(hid) {
  const list=await getDocs(collection(db,'hospitals',hid,'queues'));
  await Promise.all(list.docs.map(q=>rollOverQueue(hid,q.id)));
}
export function observeQueues(hid,next,error) {
  return onSnapshot(collection(db,'hospitals',hid,'queues'),snapshot=>{
    next(snapshot.docs.map(d=>publicQueue(d.id,d.data())).sort((a,b)=>a.prefix.localeCompare(b.prefix)));
  },error);
}
export function observeTickets(hid,next,error,maxItems=25) {
  return onSnapshot(query(collection(db,'hospitals',hid,'tickets'),orderBy('createdAt','desc'),limit(Math.max(1,Math.min(100,maxItems)))),
    snap=>next(snap.docs.map(d=>({id:d.id,...d.data()}))),error);
}
export function observeTicket(hid,id,next,error) {
  return onSnapshot(hid?ticketDoc(hid,id):doc(db,'tickets',id),snap=>next(snap.exists()?{id:snap.id,...snap.data()}:null),error);
}
export function observeQueue(hid,id,next,error) {
  return onSnapshot(hid?qDoc(hid,id):doc(db,'queues',id),snap=>next(snap.exists()?publicQueue(id,snap.data()):null),error);
}
export async function createQueue(hid,name) {
  name=name.trim();if(name.length<3||name.length>45)throw Error('Department name must be 3–45 characters.');
  const id=doc(collection(db,'hospitals',hid,'queues')).id;
  await runTransaction(db,async tx=>{
    const mr=metaDoc(hid),snap=await tx.get(mr);
    if(!snap.exists())throw Error('Organization queue setup is incomplete. Contact an administrator.');
    const n=snap.data().nextPrefix;
    const prefix=prefixFor(n),now=Date.now();
    tx.update(mr,{nextPrefix:n+1});
    tx.set(qDoc(hid,id),initialQueue(name,prefix,dayKey(),now));
    tx.set(controlDoc(hid,id),initialControl());
  });
  return {id,name};
}
export async function issueTicket(hid,id) {
  const tr=doc(collection(db,'hospitals',hid,'tickets'));
  const now=Date.now(),today=dayKey();
  const ticket=await runTransaction(db,async tx=>{
    const qr=qDoc(hid,id),cr=controlDoc(hid,id);
    const [qs,cs]=await Promise.all([tx.get(qr),tx.get(cr)]);
    if(!qs.exists()||!cs.exists())throw Error('Unknown department. Refresh reception.');
    const dayChanged=qs.data().dayKey!==today;
    const {queue,ticket}=nextTicket(qs.data(),tr.id,today,now);
    ticket.queueId=id;
    const current=dayChanged?initialControl():cs.data();
    tx.set(qr,queue);
    tx.set(cr,{...current,pending:[...current.pending,{id:tr.id,number:ticket.number}]});
    tx.set(tr,ticket);
    return ticket;
  });
  return {...ticket,id:tr.id,queue:ticket.queueName,trackingUrl:ticketLink(hid,tr.id,window.location.href)};
}
export async function performAction(hid,id,action) {
  if(action==='pause'||action==='resume'){
    await runTransaction(db,async tx=>{
      const qr=qDoc(hid,id),snap=await tx.get(qr);
      if(!snap.exists())throw Error('Unknown department.');
      tx.update(qr,{paused:action==='pause',updatedAt:Date.now()});
    });
    return {};
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
      tx.update(qr,{waitingNumbers:q.waitingNumbers.slice(1),active:{code:ts.data().code,number:first.number},updatedAt:now});
      tx.update(cr,{pending:c.pending.slice(1),activeId:first.id,activeSince:now});
      tx.update(tr,{status:'called',calledAt:now});
      return {code:ts.data().code};
    }
    if(!['complete','skip'].includes(action))throw Error('Unknown queue action');
    if(!c.activeId||!q.active)throw Error('There is no active ticket to finish.');
    const tr=ticketDoc(hid,c.activeId),ts=await tx.get(tr);
    if(!ts.exists()||ts.data().status!=='called')throw Error('Active ticket changed. Refresh reception.');
    const patch={active:null,updatedAt:now};
    if(action==='complete'){
      const mins=Math.max(1,Math.min(40,(now-(c.activeSince||now))/60000));
      const sample=Math.min(9,q.served||0);
      patch.avgMinutes=Math.round(((Number(q.avgMinutes)||8)*sample+mins)/(sample+1));
      patch.served=(q.served||0)+1;
    }
    tx.update(qr,patch);
    tx.update(cr,{activeId:null,activeSince:null});
    tx.update(tr,{status:action==='complete'?'completed':'skipped',finishedAt:now});
    return {code:ts.data().code};
  });
}
