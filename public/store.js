/** TurnAhead's real shared database. No local Node server is needed. */
import {
  collection, doc, getDoc, getDocs, query, orderBy, limit,
  onSnapshot, runTransaction
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { auth, db } from './firebase.js';
import { dayKey, prefixFor, initialQueue, initialControl, normalizedQueue,
  nextTicket, nextInLine, publicQueue } from './queue-engine.js';
import { facilityName } from './config.js';

const qDoc = id => doc(db, 'queues', id);
const controlDoc = id => doc(db, 'controls', id);
const ticketDoc = id => doc(db, 'tickets', id);
const metaDoc = () => doc(db, 'meta', 'sequence');
export const facility = facilityName;
export function observeAuth(callback) {return onAuthStateChanged(auth, callback);}
export async function login(email, password) {
  const response = await signInWithEmailAndPassword(auth,email,password);
  if(!await authorized(response.user)) {await signOut(auth);throw Error('This account has not been approved as reception staff. Ask the administrator to add its Firebase UID in the staff collection.');}
}
export function logout() {return signOut(auth);}
export async function authorized(user) {
  if(!user)return false;
  const role=await getDoc(doc(db,'staff',user.uid));
  return role.exists() && role.data().active===true;
}
export async function bootstrap() {
  await runTransaction(db,async tx=>{
    const counter=await tx.get(metaDoc());
    if(counter.exists())return;
    const now=Date.now();
    tx.set(metaDoc(),{nextPrefix:1});
    tx.set(qDoc('general-opd'),initialQueue('General OPD','A',dayKey(),now));
    tx.set(controlDoc('general-opd'),initialControl());
  });
}
export async function rollOverQueue(id) {
  await runTransaction(db,async tx=>{
    const qRef=qDoc(id), cRef=controlDoc(id);
    const [q,ctrl]=await Promise.all([tx.get(qRef),tx.get(cRef)]);
    if(!q.exists() || !ctrl.exists() || q.data().dayKey===dayKey())return;
    tx.set(qRef,normalizedQueue(q.data(),dayKey(),Date.now()));
    tx.set(cRef,initialControl());
  });
}
export async function rollOverAll() {
  const snapshot=await getDocs(collection(db,'queues'));
  await Promise.all(snapshot.docs.map(q=>rollOverQueue(q.id)));
}
export function observeQueues(next, error) {
  return onSnapshot(collection(db,'queues'), snapshot=>{
    next(snapshot.docs.map(d=>publicQueue(d.id,d.data())).sort((a,b)=>a.prefix.localeCompare(b.prefix)));
  },error);
}
export function observeTickets(next, error) {
  return onSnapshot(query(collection(db,'tickets'),orderBy('createdAt','desc'),limit(25)),
    snapshot=>next(snapshot.docs.map(d=>({id:d.id,...d.data()}))),error);
}
export function observeTicket(id,next,error) {
  return onSnapshot(ticketDoc(id),snap=>next(snap.exists()?{id:snap.id,...snap.data()}:null),error);
}
export function observeQueue(id,next,error) {return onSnapshot(qDoc(id),snapshot=>next(snapshot.exists()?publicQueue(id,snapshot.data()):null),error);}
export async function createQueue(name) {
  name=name.trim();if(name.length<3||name.length>45)throw Error('Department name must be 3–45 characters.');
  const id=doc(collection(db,'queues')).id;
  await runTransaction(db,async tx=>{
    const ref=metaDoc(),count=await tx.get(ref);
    if(!count.exists())throw Error('Facility has not been initialized. Refresh reception.');
    const n=count.data().nextPrefix;
    const prefix=prefixFor(n),now=Date.now();
    tx.update(ref,{nextPrefix:n+1});
    tx.set(qDoc(id),initialQueue(name,prefix,dayKey(),now));
    tx.set(controlDoc(id),initialControl());
  });
  return {id,name};
}
export async function issueTicket(id) {
  const ref=doc(collection(db,'tickets'));
  const now=Date.now(),today=dayKey();
  const result=await runTransaction(db,async tx=>{
    const qr=qDoc(id), cr=controlDoc(id);
    const [qs,cs]=await Promise.all([tx.get(qr),tx.get(cr)]);
    if(!qs.exists()||!cs.exists())throw Error('Unknown department. Refresh reception.');
    const changed=qs.data().dayKey!==today;
    const {queue,ticket}=nextTicket(qs.data(),ref.id,today,now);
    ticket.queueId=id;
    const current=changed?initialControl():cs.data();
    tx.set(qr,queue);
    tx.set(cr,{...current,pending:[...current.pending,{id:ref.id,number:ticket.number}]});
    tx.set(ref,ticket);
    return ticket;
  });
  const url=new URL('./track.html',window.location.href);
  url.searchParams.set('ticket',ref.id);
  return {...result,id:ref.id,queue:result.queueName,trackingUrl:url.toString()};
}
export async function performAction(id,action) {
  if(action==='pause'||action==='resume'){
    await runTransaction(db,async tx=>{
      const ref=qDoc(id),snap=await tx.get(ref);
      if(!snap.exists())throw Error('Unknown department');
      tx.update(ref,{paused:action==='pause',updatedAt:Date.now()});
    });
    return {};
  }
  const now=Date.now();
  return runTransaction(db,async tx=>{
    const qr=qDoc(id),cr=controlDoc(id);
    const [qSnap,cSnap]=await Promise.all([tx.get(qr),tx.get(cr)]);
    if(!qSnap.exists()||!cSnap.exists())throw Error('Department unavailable.');
    const q=qSnap.data(), c=cSnap.data();
    if(q.dayKey!==dayKey())throw Error('A new day has begun. Refresh reception to reset the queue.');
    if(action==='next'){
      const first=nextInLine(q,c),tr=ticketDoc(first.id),ts=await tx.get(tr);
      if(!ts.exists() || ts.data().status!=='waiting')throw Error('Ticket status changed. Refresh reception.');
      tx.update(qr,{waitingNumbers:q.waitingNumbers.slice(1),active:{code:ts.data().code,number:first.number},updatedAt:now});
      tx.update(cr,{pending:c.pending.slice(1),activeId:first.id,activeSince:now});
      tx.update(tr,{status:'called',calledAt:now});
      return {code:ts.data().code};
    }
    if(!['complete','skip'].includes(action))throw Error('Unknown queue action');
    if(!c.activeId||!q.active)throw Error('There is no active ticket to finish.');
    const tr=ticketDoc(c.activeId),ts=await tx.get(tr);
    if(!ts.exists()||ts.data().status!=='called')throw Error('Active ticket changed. Refresh reception.');
    const update={active:null,updatedAt:now};
    if(action==='complete'){
      const mins=Math.max(1,Math.min(40,(now-(c.activeSince||now))/60000));
      const sample=Math.min(9,q.served||0);
      update.avgMinutes=Math.round(((Number(q.avgMinutes)||8)*sample+mins)/(sample+1));
      update.served=(q.served||0)+1;
    }
    tx.update(qr,update);
    tx.update(cr,{activeId:null,activeSince:null});
    tx.update(tr,{status:action==='complete'?'completed':'skipped',finishedAt:now});
    return {code:ts.data().code};
  });
}
