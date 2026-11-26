import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialQueue,initialControl,nextTicket,getDoctorControl,refinedWaitingEstimate} from '../public/queue-engine.js';
import {planTicketChange} from '../public/ticket-change.js';
const doc='D'.repeat(20),target='E'.repeat(20),id='T'.repeat(20),today='2026-11-26',now=2000000;
const x=nextTicket(initialQueue('General OPD','GEN',today,now),id,today,now,'Fictional Patient',{doctorId:doc,doctorName:'Old Doctor',patientGender:'male',roomNumber:'1'});
const q=x.queue,t={...x.ticket,queueId:'general-opd'},c={...initialControl(),lanes:{[doc]:{...getDoctorControl({},doc),pending:[{id,number:t.number}]}}};
const d={name:'New Doctor',active:true,departmentId:t.queueId};
const details={patientName:t.patientName,patientGender:t.patientGender,roomNumber:'2'};
test('transfer appends at destination and preserves ticket number',()=>{
 const p=planTicketChange(q,c,t,id,d,target,details,now+1,today);
 assert.equal(p.kind,'transfer');assert.equal(p.patch.doctorId,target);assert.equal(p.patch.number,undefined);
 assert.deepEqual(p.queuePatch.lanes[doc].waitingNumbers,[]);assert.deepEqual(p.queuePatch.lanes[target].waitingNumbers,[t.number]);assert.deepEqual(p.controlPatch.lanes[target].pending,[{id,number:t.number}]);
});
test('corrections preserve queue ordering; unsafe transfers fail',()=>{
 const p=planTicketChange(q,c,t,id,d,doc,{...details,patientName:'Corrected Patient'},now+1,today);
 assert.equal(p.kind,'correction');assert.equal(p.queuePatch,undefined);assert.equal(p.patch.patientName,'Corrected Patient');
 for(const bad of [{...t,status:'called'},{...t,dayKey:'old'}])assert.throws(()=>planTicketChange(q,c,bad,id,d,target,details,now,today));
 assert.throws(()=>planTicketChange(q,c,t,id,{...d,departmentId:'different'},target,details,now,today));
});
test('low-sample waiting estimate is wider without extra reads',()=>{
 const lane={waitingNumbers:[1,2,3],avgMinutes:8,served:0,active:null},fresh=refinedWaitingEstimate(lane,3),stable=refinedWaitingEstimate({...lane,served:5},3);
 assert.equal(fresh.peopleAhead,2);assert.ok(fresh.range[0]<=stable.range[0]);assert.ok(fresh.range[1]>=stable.range[1]);
});
test('demo avoids Firebase and service worker does not cache private data',()=>{
 const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.doesNotMatch(src('public/demo.js'),/firebase|fetch\(|localStorage/);
 assert.doesNotMatch(src('public/sw.js'),/caches\.|respondWith/);
 assert.match(src('public/admin-v3.js'),/Department comparison/);
});
