import test from 'node:test';
import assert from 'node:assert/strict';
import {nearTurnMilestone,recallEligibility,planRecall,activeAnnouncements,safeFeedback,graceMinutes,shouldApplyTicket} from '../public/v26-engine.js';
test('near-turn thresholds, no alert for completed/missed and invalid estimate',()=>{
 assert.equal(nearTurnMilestone('waiting',4),null);assert.equal(nearTurnMilestone('waiting',3),'near');
 assert.equal(nearTurnMilestone('waiting',2),'near');assert.equal(nearTurnMilestone('waiting',1),'next');
 assert.equal(nearTurnMilestone('waiting',0),'next');assert.equal(nearTurnMilestone('called',null),'called');
 assert.equal(nearTurnMilestone('skipped',1),null);assert.equal(nearTurnMilestone('waiting',null),null);
});
test('recall grace and one-attempt limit',()=>{
 const t={queueId:'q',doctorId:'d',status:'skipped',dayKey:'2026-11-17',finishedAt:1000000};
 assert.equal(recallEligibility(t,1000000+600000,10,'2026-11-17').ok,true);
 assert.equal(recallEligibility(t,1000000+600001,10,'2026-11-17').ok,false);
 assert.equal(recallEligibility({...t,recallCount:1},1000100,10,'2026-11-17').ok,false);
 assert.equal(recallEligibility(t,1000100,10,'2026-11-18').ok,false);
 assert.equal(recallEligibility({...t,status:'completed'},1000100).ok,false);
 assert.equal(graceMinutes(50),50);
 assert.equal(graceMinutes(121),10);assert.equal(graceMinutes(1),1);
});
test('recall appends to both global and doctor FIFO without displacing active service',()=>{
 const q={dayKey:'2026-11-17',waitingNumbers:[8],lanes:{d:{waitingNumbers:[8],active:{code:'GEN-007'},updatedAt:9}}};
 const c={lanes:{d:{pending:[{id:'other',number:8}],activeId:'serving'}}};
 const t={queueId:'q',doctorId:'d',number:4,status:'skipped',dayKey:'2026-11-17',finishedAt:1000000};
 const p=planRecall(q,c,t,'returned',1010000,10,'2026-11-17');
 assert.deepEqual(p.queuePatch.waitingNumbers,[8,4]);assert.deepEqual(p.queuePatch.lanes.d.waitingNumbers,[8,4]);
 assert.deepEqual(p.controlPatch.lanes.d.pending,[{id:'other',number:8},{id:'returned',number:4}]);
 assert.equal(p.controlPatch.lanes.d.activeId,'serving');assert.equal(p.ticketPatch.recallCount,1);
 assert.deepEqual(q.waitingNumbers,[8]);
 assert.throws(()=>planRecall({...q,waitingNumbers:[8,4]},c,t,'returned',1010000,10,'2026-11-17'),/already/);
});
test('public board announces only active doctor calls',()=>{
 assert.deepEqual(activeAnnouncements([{id:'q',lanes:{d:{active:{code:'GEN-001',counter:'Counter 1'}},e:{active:null}}}]),
 [{key:'q:d',code:'GEN-001',counter:'Counter 1'}]);
});
test('feedback validation prevents overlong notes and out-of-range scores',()=>{
 assert.deepEqual(safeFeedback(4,' Good   service '),{rating:4,note:'Good service'});
 assert.throws(()=>safeFeedback(0,'test'),/rating/);assert.throws(()=>safeFeedback(4,'x'.repeat(301)),/300/);
});
import {readFileSync} from 'node:fs';
const source=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('v2.6 patient/reception/board/admin wiring and permission-free modal',()=>{
  for(const id of ['near-popup','feedback-form','near-popup-close'])assert.ok(source('public/track.html').includes(`id="${id}"`));
  assert.match(source('public/track.js'),/showNearTurn\(t,shownStatus/);
  assert.ok(!source('public/v26-engine.js').includes('Notification.requestPermission'));
  for(const id of ['missed-list'])assert.ok(source('public/desk.html').includes(`id="${id}"`));
  assert.match(source('public/desk.js'),/recallMissedTicket/);
  assert.doesNotMatch(source('public/desk.html'),/id="arrival-list"/);
  assert.doesNotMatch(source('public/track.html'),/id="arrival-panel"/);
  assert.ok(source('public/board.js').includes('speechSynthesis'));
  assert.ok(source('public/admin.html').includes('id="grace-form"'));
  assert.ok(source('public/admin.html').includes('id="feedback-list"'));
});
test('Firestore rules deny arbitrary feedback writes and require owner-only feedback reads',()=>{
  const r=source('firestore.rules');assert.match(r,/match \/feedback\/\{ticketId\}/);
  assert.match(r,/allow get, list: if owner\(hid\)/);
  assert.match(r,/request\.resource\.data\.rating >= 1/);
  assert.match(r,/request\.resource\.data\.note\.size\(\) <= 300/);
  assert.match(r,/allow update, delete: if false;/);
  assert.match(r,/request\.time\.toMillis\(\) - old\.finishedAt <=/);
  assert.match(r,/getAfter\(\/databases\/\$\(database\)\/documents\/hospitals\/\$\(hid\)\/queues/);
});

test('recall cycle advances past an earlier missed state without accepting stale snapshots',()=>{
 const missed={id:'ticket1',status:'skipped',recallCount:0};
 const recalled={id:'ticket1',status:'waiting',recallCount:1};
 const called={...recalled,status:'called'};
 const completed={...recalled,status:'completed'};
 assert.equal(shouldApplyTicket(missed,recalled),true);
 assert.equal(shouldApplyTicket(recalled,missed),false);
 assert.equal(shouldApplyTicket(called,recalled),false);
 assert.equal(shouldApplyTicket(completed,called),false);
 assert.equal(shouldApplyTicket(called,completed),true);
});
test('v2.6.2 enables private feedback after completion without trusting staff device clock',()=>{
 const r=source('firestore.rules');
 assert.match(r,/match \/feedback\/\{ticketId\}/);
 assert.match(r,/get\(ticketPath\(hid,ticketId\)\)\.data\.status == 'completed'/);
 assert.doesNotMatch(r,/request\.time\.toMillis\(\) >= get\(ticketPath\(hid,ticketId\)\)\.data\.finishedAt/);
 assert.doesNotMatch(r,/match \/arrivalRequests\//);
});
