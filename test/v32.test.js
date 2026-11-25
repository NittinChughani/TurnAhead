import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {operationGate,canMutateQueue,connectionLabel,safeStorage,mapLimited} from '../public/reliability.js';
import {cutoffFor,eligibleForRetention,linkedToControl} from '../scripts/retention-policy.mjs';
import {initialQueue,initialControl,nextTicket,planDoctorCall,planDoctorFinish,getDoctorControl} from '../public/queue-engine.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('one operation token survives repeated render and stale completion',()=>{
 const g=operationGate(),a=g.begin();assert.ok(a);assert.equal(g.busy,true);assert.equal(g.begin(),null);
 g.end(Symbol('stale'));assert.ok(g.busy);g.end(a);const b=g.begin();g.end(a);assert.ok(g.busy);g.end(b);assert.equal(g.busy,false);
});
test('queue mutations require online and server-confirmed data, with no pending operation',()=>{
 for(const online of [false,true])for(const confirmed of [false,true])for(const pending of [false,true])assert.equal(canMutateQueue({online,confirmed,pending}),online&&confirmed&&!pending);
 assert.match(connectionLabel({online:false,confirmed:false}),/Offline/);
 assert.match(connectionLabel({online:true,confirmed:false}),/Reconnecting/);
});
test('denied browser storage does not convert a successful operation into a failure',()=>{
 const s=safeStorage(()=>{throw Error('storage denied');});
 assert.equal(s.getItem('x'),null);assert.doesNotThrow(()=>s.setItem('x','y'));assert.equal(s.getItem('x'),'y');assert.doesNotThrow(()=>s.removeItem('x'));assert.equal(s.getItem('x'),null);
 const map=new Map(),ok=safeStorage(()=>({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}));
 ok.setItem('x','yes');assert.equal(ok.getItem('x'),'yes');ok.removeItem('x');assert.equal(ok.getItem('x'),null);
});
test('bounded maintenance concurrency preserves result order and limits active reads',async()=>{
 let active=0,peak=0;
 const result=await mapLimited(Array.from({length:30},(_,i)=>i),4,async i=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,1));active--;return i*2;});
 assert.equal(peak,4);assert.deepEqual(result,Array.from({length:30},(_,i)=>i*2));
});
test('retention only includes old, matching terminal records, with validated cutoff',()=>{
 const cutoff=cutoffFor(90,10000000000),t={status:'completed',dayKey:'2025-01-01',queueId:'q1',code:'Q-001',createdAt:1000,finishedAt:2000},a={...t,issuedAt:1000};
 assert.ok(eligibleForRetention(t,a,cutoff));assert.ok(!eligibleForRetention({...t,status:'called'},a,cutoff));assert.ok(!eligibleForRetention(t,{...a,status:'skipped'},cutoff));assert.ok(!eligibleForRetention(t,{...a,code:'different'},cutoff));assert.ok(!eligibleForRetention(t,{...a,finishedAt:cutoff},cutoff));assert.ok(!eligibleForRetention(t,null,cutoff));
 for(const days of [0,29,3651,30.5])assert.throws(()=>cutoffFor(days));
 assert.ok(linkedToControl(null,'x'));assert.ok(linkedToControl({lanes:{a:{pending:[{id:'x'}]}}},'x'));assert.ok(linkedToControl({lanes:{a:{activeId:'x'}}},'x'));assert.ok(!linkedToControl({lanes:{}},'x'));
});
test('2000-ticket capacity and FIFO service remain bounded under a large synthetic queue',()=>{
 const doctor='D'.repeat(20),day='2026-01-01',now=1000000;
 let q=initialQueue('General OPD','GEN',day,now),c=initialControl();
 const records=[];
 for(let i=0;i<2000;i++){const id='ticket-'+i;const next=nextTicket(q,id,day,now+i,'Demo patient',{patientGender:'male',doctorId:doctor,doctorName:'Demo Doctor',roomNumber:'1'});q=next.queue;records.push({id,...next.ticket,queueId:'general-opd'});}
 c.lanes[doctor]={...getDoctorControl(c,doctor),pending:records.map(x=>({id:x.id,number:x.number}))};
 assert.equal(q.waitingNumbers.length,2000);
 assert.throws(()=>nextTicket(q,'overflow',day,now,'Demo patient',{patientGender:'male',doctorId:doctor,doctorName:'Demo Doctor',roomNumber:'1'}),/capacity/);
 const first=records[0],call=planDoctorCall(q,c,doctor,first,first.id,'Counter 1','staff',now+3000);
 q={...q,...call.queuePatch};c={...c,...call.controlPatch};
 assert.throws(()=>planDoctorCall(q,c,doctor,records[1],records[1].id,'Counter 2','staff',now+3001));
 const finish=planDoctorFinish(q,c,doctor,{...first,...call.ticketPatch},'Counter 1','staff','complete',now+6000);
 assert.equal(finish.ticketPatch.status,'completed');assert.equal(q.waitingNumbers[0],2);
});
test('privacy and recovery UI are wired without widening Firestore permissions',()=>{
 for(const name of ['track','desk','admin','activate'])assert.match(source('public/'+name+'.html'),/name="referrer" content="no-referrer"/);
 assert.match(source('public/desk.html'),/id="desk-connection"/);assert.match(source('public/board.html'),/id="board-connection"/);
 assert.match(source('public/desk.js'),/beginMutation\(\)/);assert.match(source('public/desk.js'),/epoch!==workspaceEpoch/);
 assert.match(source('public/track.js'),/if\(meta\?\.fromCache\)/);assert.match(source('public/track.js'),/missingTicket\(\)/);
 assert.match(source('public/org-store.js'),/getDocsFromServer\(query\(collection\(db,'memberships'\)/);
 assert.match(source('public/admin.js'),/resolved\.ownerUid!==user\.uid/);
 assert.match(source('scripts/retention.mjs'),/default:false/);assert.match(source('scripts/retention.mjs'),/backup-confirmed/);
 assert.match(source('security/firestore.test.mjs'),/demo-turnahead/);
});
