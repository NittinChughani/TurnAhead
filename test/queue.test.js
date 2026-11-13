import test from 'node:test';
import assert from 'node:assert/strict';
import {dayKey,prefixFor,initialQueue,initialControl,normalizedQueue,nextTicket,nextInLine,waitingEstimate,departmentPrefix,effectiveTicketStatus,approximateTurnTime} from '../public/queue-engine.js';

test('Pakistan calendar date is deterministic',()=>{
  assert.equal(dayKey(new Date('2026-11-12T20:30:00Z')),'2026-11-13');
});
test('department prefixes stay unique through Z and AA',()=>{
  assert.deepEqual([0,1,25,26,27,51].map(prefixFor),['A','B','Z','AA','AB','AZ']);
  assert.throws(()=>prefixFor(-1));
});
test('queue starts with no active or waiting ticket',()=>{
  const q=initialQueue();assert.equal(q.lastNumber,-1);assert.deepEqual(q.waitingNumbers,[]);assert.equal(q.active,null);
});
test('ticket numbers increment and never share numbers',()=>{
  const q=initialQueue();const one=nextTicket(q,'abc','2026-11-12',1000,'Ayesha Khan');
  const two=nextTicket(one.queue,'def','2026-11-12',2000,'John Paul');
  assert.equal(one.ticket.code,'GEN-000');assert.equal(two.ticket.code,'GEN-001');
  assert.deepEqual(two.queue.waitingNumbers,[0,1]);
});
test('paused queues do not issue tickets',()=>{
  assert.throws(()=>nextTicket({...initialQueue(),paused:true},'id',dayKey(),1000,'Patient Name'),/paused/);
});
test('call next follows FIFO even if two tickets share a queue',()=>{
  const q={...initialQueue(),waitingNumbers:[1,2]};
  const c={...initialControl(),pending:[{id:'a',number:1},{id:'b',number:2}]};
  assert.deepEqual(nextInLine(q,c),{id:'a',number:1});
  assert.throws(()=>nextInLine({...q,active:{code:'A-001'}},c),/Complete/);
});
test('waiting estimates include current active visitor',()=>{
  const q={...initialQueue(),waitingNumbers:[3,4,5],active:{code:'A-002',number:2}};
  assert.equal(waitingEstimate(q,3).peopleAhead,1);
  assert.equal(waitingEstimate(q,5).peopleAhead,3);
  assert.equal(waitingEstimate(q,99),null);
});
test('new day resets previous queue state, preserving the department',()=>{
  const yesterday={...initialQueue('Laboratory','B','2026-11-11'),lastNumber:45,waitingNumbers:[44,45],active:{code:'B-043'},served:42};
  const today=normalizedQueue(yesterday,'2026-11-12');
  assert.equal(today.name,'Laboratory');assert.equal(today.prefix,'LAB');assert.equal(today.lastNumber,-1);assert.equal(today.active,null);assert.equal(today.served,0);
});
test('QR encoder can create an SVG for a GitHub Pages tracking URL',async()=>{
  const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
  const s=readFileSync(new URL('../public/qr.js',import.meta.url),'utf8');
  const ctx={window:{}};vm.runInNewContext(s,ctx,{timeout:2000});
  const svg=ctx.window.turnaheadQR.svg('https://nittinchughani.github.io/TurnAhead/track.html?hospital=ABcdEFghIJklMNopQR12&ticket=AbCdEfGhiJKLmnoPQrST');
  assert.match(svg,/viewBox/);assert.match(svg,/<path/);assert.ok(svg.length>2000);
});

test('three-letter department ticket prefixes are deterministic',()=>{
 assert.equal(departmentPrefix('Cardiology'),'CAR');
 assert.equal(departmentPrefix('Emergency Services'),'EME');
 assert.equal(departmentPrefix('Lab-1'),'LAB');
 assert.throws(()=>departmentPrefix('A1'));
});
test('numbering starts at zero, crosses 999, and does not truncate at 1000',()=>{
 let q=initialQueue('Cardiology','CAR','2026-11-13');
 assert.equal(nextTicket(q,'id','2026-11-13',100,'Patient Name').ticket.code,'CAR-000');
 q={...q,lastNumber:998};
 const a=nextTicket(q,'id','2026-11-13',100,'Patient Name');
 assert.equal(a.ticket.code,'CAR-999');
 const b=nextTicket(a.queue,'id2','2026-11-13',200,'Patient Name');
 assert.equal(b.ticket.code,'CAR-1000');
});
test('midnight resets CAR sequence to 000, dropping old active state',()=>{
 let q=initialQueue('Cardiology','CAR','2026-11-12');
 q={...q,lastNumber:1000,waitingNumbers:[999,1000],active:{code:'CAR-998',number:998}};
 const a=nextTicket(q,'id','2026-11-13',100,'Patient Name');
 assert.equal(a.ticket.code,'CAR-000');assert.deepEqual(a.queue.waitingNumbers,[0]);assert.equal(a.queue.active,null);
});
test('final ticket status beats stale queue snapshots; mismatches never claim YOUR TURN',()=>{
 const t={code:'CAR-000',status:'waiting',number:0,dayKey:'2026-11-13'};
 const q={...initialQueue('Cardiology','CAR','2026-11-13'),waitingNumbers:[0]};
 assert.equal(effectiveTicketStatus(t,q,'2026-11-13'),'waiting');
 const calledQueue={...q,waitingNumbers:[],active:{code:t.code,number:0}};
 assert.equal(effectiveTicketStatus(t,calledQueue,'2026-11-13'),'syncing');
 assert.equal(effectiveTicketStatus({...t,status:'called'},calledQueue,'2026-11-13'),'called');
 assert.equal(effectiveTicketStatus({...t,status:'called'},{...calledQueue,active:null},'2026-11-13'),'syncing');
 assert.equal(effectiveTicketStatus({...t,status:'completed'},calledQueue,'2026-11-13'),'completed');
 assert.equal(effectiveTicketStatus({...t,status:'skipped'},calledQueue,'2026-11-13'),'skipped');
 assert.equal(effectiveTicketStatus({...t,status:'completed'},calledQueue,'2026-11-14'),'completed');
 assert.equal(effectiveTicketStatus(t,calledQueue,'2026-11-14'),'expired');
});
test('estimated turn is presented as approximate local clock time',()=>{
 const estimate={peopleAhead:1,range:[4,6]};
 const time=approximateTurnTime(estimate,Date.parse('2026-11-13T12:25:00+05:00'));
 assert.equal(time.minutes,5);assert.match(time.clock,/12:30/);
});
test('missing patient names are rejected for new tickets',()=>{
 assert.throws(()=>nextTicket(initialQueue(),'id','2026-11-13',123,''),/patient name/i);
});
