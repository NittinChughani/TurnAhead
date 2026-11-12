import test from 'node:test';
import assert from 'node:assert/strict';
import {dayKey,prefixFor,initialQueue,initialControl,normalizedQueue,nextTicket,nextInLine,waitingEstimate} from '../public/queue-engine.js';

test('Pakistan calendar date is deterministic',()=>{
  assert.equal(dayKey(new Date('2026-11-12T20:30:00Z')),'2026-11-13');
});
test('department prefixes stay unique through Z and AA',()=>{
  assert.deepEqual([0,1,25,26,27,51].map(prefixFor),['A','B','Z','AA','AB','AZ']);
  assert.throws(()=>prefixFor(-1));
});
test('queue starts with no active or waiting ticket',()=>{
  const q=initialQueue();assert.equal(q.lastNumber,0);assert.deepEqual(q.waitingNumbers,[]);assert.equal(q.active,null);
});
test('ticket numbers increment and never share numbers',()=>{
  const q=initialQueue();const one=nextTicket(q,'abc','2026-11-12',1000);
  const two=nextTicket(one.queue,'def','2026-11-12',2000);
  assert.equal(one.ticket.code,'A-001');assert.equal(two.ticket.code,'A-002');
  assert.deepEqual(two.queue.waitingNumbers,[1,2]);
});
test('paused queues do not issue tickets',()=>{
  assert.throws(()=>nextTicket({...initialQueue(),paused:true},'id',dayKey(),1000),/paused/);
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
  assert.equal(today.name,'Laboratory');assert.equal(today.lastNumber,0);assert.equal(today.active,null);assert.equal(today.served,0);
});
test('QR encoder can create an SVG for a GitHub Pages tracking URL',async()=>{
  const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
  const s=readFileSync(new URL('../public/qr.js',import.meta.url),'utf8');
  const ctx={window:{}};vm.runInNewContext(s,ctx,{timeout:2000});
  const svg=ctx.window.turnaheadQR.svg('https://nittinchughani.github.io/TurnAhead/track.html?hospital=ABcdEFghIJklMNopQR12&ticket=AbCdEfGhiJKLmnoPQrST');
  assert.match(svg,/viewBox/);assert.match(svg,/<path/);assert.ok(svg.length>2000);
});
