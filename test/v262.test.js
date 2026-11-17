import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ticketStatusLabel} from '../public/queue-engine.js';
import {graceMinutes,shouldApplyTicket} from '../public/v26-engine.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('administrator starts on overview and offers nine navigable sections',()=>{
 const html=source('public/admin.html'),js=source('public/admin.js');
 const tabs=['overview','team','invites','departments','doctors','patients','history','feedback','settings'];
 assert.match(html,/id="admin-overview"/);
 assert.match(js,/showAdminSection\('overview'\)/);
 for(const tab of tabs)assert.ok(html.includes('data-admin-tab="'+tab+'"'));
 for(const tab of tabs.slice(1))assert.ok(html.includes('data-admin-section="'+tab+'" hidden'));
 for(const id of ['admin-waiting','admin-serving','admin-completed','admin-average','staff-count','department-count','invite-count','admin-profile-avatar'])assert.ok(html.includes('id="'+id+'"'));
 const feedback=html.indexOf('data-admin-section="feedback"');
 assert.ok(feedback>=0 && html.indexOf('id="feedback-list"',feedback)>feedback);
 assert.ok(html.indexOf('data-admin-section="settings"')<feedback);
});
test('grace supports presets and a custom 1-to-120 minute entry',()=>{
 const html=source('public/admin.html'),store=source('public/org-store.js'),rules=source('firestore.rules');
 for(const preset of ['5','10','15','20','30','custom'])assert.ok(html.includes('option value="'+preset+'"'));
 assert.match(html,/id="recall-grace-custom" type="number" min="1" max="120"/);
 assert.match(store,/minutes<1\|\|minutes>120/);
 assert.match(rules,/recallGraceMinutes',10\) >= 1 && data.get\('recallGraceMinutes',10\) <= 120/);
 assert.equal(graceMinutes(7),7);
 assert.equal(graceMinutes(120),120);
 assert.equal(graceMinutes(121),10);
});
test('recalled status is never confused with a new ordinary ticket',()=>{
 const originallyMissed={id:'patient',status:'skipped',recallCount:0};
 const recalled={id:'patient',status:'waiting',recallCount:1};
 assert.ok(shouldApplyTicket(originallyMissed,recalled));
 assert.ok(!shouldApplyTicket(recalled,originallyMissed));
 assert.equal(ticketStatusLabel({...recalled,status:'completed'}),'Recalled & completed');
 assert.equal(ticketStatusLabel({...recalled,status:'called'}),'Recalled · Called');
 assert.equal(ticketStatusLabel({...recalled,status:'skipped'}),'Recalled · Missed again');
 assert.equal(ticketStatusLabel({status:'completed'}),'Completed');
});
test('arrival writes are gone and completed feedback remains owner-only and immutable',()=>{
 for(const path of ['public/track.html','public/desk.html','public/track.js','public/desk.js']){
   assert.doesNotMatch(source(path),/arrival-panel|arrival-button|arrival-list|observeArrival|verifyArrival/);
 }
 const rules=source('firestore.rules');
 assert.doesNotMatch(rules,/match \/arrivalRequests\//);
 assert.match(rules,/match \/feedback\/\{ticketId\}/);
 assert.match(rules,/allow get, list: if owner\(hid\)/);
 assert.match(rules,/allow update, delete: if false/);
});
