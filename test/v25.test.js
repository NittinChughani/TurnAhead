import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialQueue,initialControl,nextTicket,getDoctorLane,getDoctorControl,
  doctorQueueSummary,doctorActiveCodes,waitingEstimate,planDoctorCall,planDoctorFinish,
  counterLabel,normalizedQueue,effectiveTicketStatus,callHistoryLine,publicQueue} from '../public/queue-engine.js';

const day='2026-11-15';
const A='A'.repeat(20),B='B'.repeat(20),staff='C'.repeat(28);
const fields=(doctorId,doctorName)=>({patientGender:'female',doctorId,doctorName,roomNumber:'B-204'});
function fixture(){
  let q=initialQueue('Cardiology','CAR',day),c=initialControl();
  const patientA=nextTicket(q,'ticket-A',day,1000,'Sample Person A',fields(A,'Doctor One'));q=patientA.queue;
  const patientB=nextTicket(q,'ticket-B',day,2000,'Sample Person B',fields(B,'Doctor Two'));q=patientB.queue;
  const patientA2=nextTicket(q,'ticket-A2',day,3000,'Sample Person C',fields(A,'Doctor One'));q=patientA2.queue;
  c.lanes={[A]:{...getDoctorControl(c,A),pending:[{id:'ticket-A',number:1},{id:'ticket-A2',number:3}]},
    [B]:{...getDoctorControl(c,B),pending:[{id:'ticket-B',number:2}]}};
  return {q,c,one:patientA.ticket,two:patientB.ticket,three:patientA2.ticket};
}
test('each doctor receives an independent FIFO line, with a shared department sequence',()=>{
  const {q}=fixture();
  assert.deepEqual(getDoctorLane(q,A).waitingNumbers,[1,3]);
  assert.deepEqual(getDoctorLane(q,B).waitingNumbers,[2]);
  assert.deepEqual(q.waitingNumbers,[1,2,3]);
  assert.equal(q.lastNumber,3);
});
test('two different counters may call different doctors in the same department',()=>{
  const {q,c,one,two}=fixture();
  const a=planDoctorCall(q,c,A,one,'ticket-A','Counter 1',staff,10000);
  const q1={...q,...a.queuePatch},c1={...c,...a.controlPatch};
  const b=planDoctorCall(q1,c1,B,two,'ticket-B','Counter 2',staff,11000);
  assert.deepEqual(doctorActiveCodes({...q1,...b.queuePatch}).map(x=>x.code).sort(),['CAR-001','CAR-002']);
  assert.equal(b.ticketPatch.calledCounter,'Counter 2');
  assert.equal(b.historyPatch.calledBy,staff);
  assert.equal(Object.hasOwn(b.ticketPatch,'calledBy'),false,'Staff UID must not appear in public QR ticket fields');
});
test('one counter cannot call two active patients within a department',()=>{
  const {q,c,one,two}=fixture();
  const a=planDoctorCall(q,c,A,one,'ticket-A','Counter 1',staff,10000);
  assert.throws(()=>planDoctorCall({...q,...a.queuePatch},{...c,...a.controlPatch},B,two,'ticket-B','Counter 1',staff,11000),/already serving/);
});
test('same doctor cannot be called twice before its first ticket is finished',()=>{
  const {q,c,one,three}=fixture();
  const a=planDoctorCall(q,c,A,one,'ticket-A','Counter 1',staff,10000);
  assert.throws(()=>planDoctorCall({...q,...a.queuePatch},{...c,...a.controlPatch},A,three,'ticket-A2','Counter 2',staff,11000),/Complete or skip/);
});
test('calling an incorrect doctor/ticket or stale status is rejected',()=>{
  const {q,c,one}=fixture();
  assert.throws(()=>planDoctorCall(q,c,A,{...one,status:'completed'},'ticket-A','Counter 1',staff,10000),/changed/);
  assert.throws(()=>planDoctorCall(q,c,A,{...one,doctorId:B},'ticket-A','Counter 1',staff,10000),/changed/);
});
test('complete requires the calling counter and retains the call timestamp',()=>{
  const {q,c,one}=fixture();
  const a=planDoctorCall(q,c,A,one,'ticket-A','Counter 1',staff,10000);
  const q1={...q,...a.queuePatch},c1={...c,...a.controlPatch},called={...one,...a.ticketPatch};
  assert.throws(()=>planDoctorFinish(q1,c1,A,called,'Counter 2',staff,'complete',70000),/Counter 1/);
  const finish=planDoctorFinish(q1,c1,A,called,'Counter 1',staff,'complete',70000);
  const q2={...q1,...finish.queuePatch};
  assert.equal(finish.ticketPatch.status,'completed');assert.equal(finish.ticketPatch.attendance,'present');
  assert.equal(finish.historyPatch.finishedBy,staff);assert.equal(q2.served,1);
  assert.equal(getDoctorLane(q2,A).active,null);
  assert.equal(effectiveTicketStatus({...called,...finish.ticketPatch},q2,day),'completed');
  assert.equal(called.calledAt,10000);
});
test('skipping marks missed but does not count as completed service',()=>{
  const {q,c,one}=fixture();
  const a=planDoctorCall(q,c,A,one,'ticket-A','Counter 1',staff,10000);
  const result=planDoctorFinish({...q,...a.queuePatch},{...c,...a.controlPatch},A,{...one,...a.ticketPatch},'Counter 1',staff,'skip',30000);
  assert.equal(result.ticketPatch.status,'skipped');assert.equal(result.ticketPatch.attendance,'missed');
  assert.equal(result.queuePatch.served,undefined);
});
test('patient waiting estimate only considers their own doctor line',()=>{
  const {q}=fixture();
  assert.equal(waitingEstimate(doctorQueueSummary(q,A),3).peopleAhead,1);
  assert.equal(waitingEstimate(doctorQueueSummary(q,B),2).peopleAhead,0);
});
test('doctor break prevents new tickets for that doctor only',()=>{
  const {q}=fixture();const paused={...q,lanes:{...q.lanes,[A]:{...getDoctorLane(q,A),paused:true}}};
  assert.throws(()=>nextTicket(paused,'x',day,4000,'Sample Person X',fields(A,'Doctor One')),/break/);
  assert.equal(nextTicket(paused,'x',day,4000,'Sample Person X',fields(B,'Doctor Two')).ticket.code,'CAR-004');
});
test('the next calendar day clears doctor lanes and resets ticket numbers',()=>{
  const {q}=fixture();const fresh=normalizedQueue(q,'2026-11-16');
  assert.deepEqual(fresh.lanes,{});assert.equal(fresh.lastNumber,0);
  assert.equal(nextTicket(fresh,'x','2026-11-16',4000,'Sample Person X',fields(A,'Doctor One')).ticket.code,'CAR-001');
});
test('counter choices are limited and predictable',()=>{
  assert.equal(counterLabel(1),'Counter 1');assert.equal(counterLabel(12),'Counter 12');
  for(const n of [0,13,1.5,'NaN'])assert.throws(()=>counterLabel(n));
});
test('called tickets are authoritative despite stale doctor snapshots, with a persistent call receipt',()=>{
  const {q,one}=fixture();const called={...one,status:'called',calledAt:Date.parse('2026-11-15T10:02:00+05:00'),calledCounter:'Counter 2'};
  assert.equal(effectiveTicketStatus(called,publicQueue('x',q),day),'called');
  assert.match(callHistoryLine(called),/Counter 2/);assert.match(callHistoryLine(called),/10:02/);
  assert.equal(effectiveTicketStatus({...called,status:'completed'},q,day),'completed');
});
test('connection recheck uses a server read and exposes metadata to patient page',()=>{
  const store=readFileSync(new URL('../public/store.js',import.meta.url),'utf8');
  const track=readFileSync(new URL('../public/track.js',import.meta.url),'utf8');
  assert.match(store,/includeMetadataChanges:true/);
  assert.match(store,/getDocFromServer/);
  assert.match(track,/visibilitychange/);assert.match(track,/pageshow/);assert.match(track,/window.addEventListener\('online'/);
  assert.match(track,/callHistoryLine/);
});
test('doctor state, counter UI and glass nav have expected controls',()=>{
  const path=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
  const desk=path('desk.html'),css=path('styles.css'),board=path('board.js');
  for(const id of ['counter-select','queue-detail','issue-modal'])assert.ok(desk.includes(`id="${id}"`));
  assert.match(css,/-webkit-backdrop-filter:blur\(22px\)/);
  assert.match(css,/doctor-tab\.selected/);
  assert.match(board,/doctorActiveCodes/);
});
test('Firestore rules allow v2.5 lanes and keep private staff IDs out of public tickets',()=>{
  const r=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  assert.match(r,/data\.get\('lanes',\{\}\) is map/);
  assert.match(r,/data\.get\('finishedBy',''\) is string/);
  const ticketSection=r.match(/function validTicket\(data\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(ticketSection);assert.doesNotMatch(ticketSection,/calledBy/);
  assert.match(r,/request\.resource\.data\.departmentId == resource\.data\.departmentId/);
});
