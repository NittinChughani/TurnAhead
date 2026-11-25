import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAnalytics,reportDates,reportRows,analyticsCSV} from '../public/analytics-engine.js';
import {validateCustomization,hospitalCustomization,counterOptions,hoursLabel} from '../public/hospital-custom.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('report windows cross month and year boundaries',()=>{
 assert.deepEqual(reportDates('2026-01-03',7),['2025-12-28','2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03']);
 assert.equal(reportDates('2026-11-25',30).length,30);
 assert.throws(()=>reportDates('2026-02-30',7));
 assert.throws(()=>reportDates('2026-11-25',90));
});
test('archive metrics distinguish final missed, recall and incomplete visits, exclude recall wait',()=>{
 const day='2026-11-25',base=Date.parse(day+'T09:00:00+05:00');
 const common={dayKey:day,queueId:'q1',queueName:'OPD',doctorId:'d1',doctorName:'A',issuedAt:base,patientName:'PRIVATE NAME'};
 const records=[{...common,status:'completed',calledAt:base+600000,finishedAt:base+900000},{...common,status:'completed',recallCount:1,calledAt:base+1800000,finishedAt:base+2400000},{...common,status:'skipped',calledAt:base+1200000},{...common,status:'waiting'},{...common,dayKey:'2026-11-24',status:'completed'}];
 const r=buildAnalytics(records,[{day,rating:5,note:'PRIVATE COMMENT'},{day,rating:3},{day:'2026-11-24',rating:1}],[day]);
 assert.equal(r.total.issued,4);assert.equal(r.total.completed,2);assert.equal(r.total.missed,1);assert.equal(r.total.recalled,1);assert.equal(r.total.recalledCompleted,1);assert.equal(r.total.unresolved,1);
 assert.equal(r.total.wait,15);assert.equal(r.total.waitN,2);assert.equal(r.total.service,7.5);assert.equal(r.total.serviceN,2);
 assert.equal(r.hours[9],4);assert.equal(r.departments[0].issued,4);assert.equal(r.doctors[0].issued,4);
 assert.equal(r.ratings.average,4);assert.equal(r.ratings.count,2);assert.deepEqual(r.ratings.distribution,[0,0,1,0,1]);
 const csv=analyticsCSV(reportRows(r));assert.doesNotMatch(csv,/PRIVATE NAME|PRIVATE COMMENT/);
});
test('empty reports do not invent waiting times or satisfaction',()=>{
 const r=buildAnalytics([],[],['2026-11-25']);
 assert.equal(r.total.wait,null);assert.equal(r.total.service,null);assert.equal(r.ratings.average,null);assert.equal(r.days[0].issued,0);
});
test('CSV escapes formula injection and quotes',()=>{
 assert.equal(analyticsCSV([['=1+1','A"B',3]]),'"\'=1+1","A""B","3"');
});
test('customization defaults work on old hospital documents, invalid settings rejected',()=>{
 const c=hospitalCustomization({name:'Hospital'});
 assert.equal(c.counters,12);assert.equal(c.hoursEnabled,false);
 for(const v of [{logo:'javascript:alert(1)'},{accent:'red'},{counters:13},{counters:0},{opens:'25:00'},{hoursEnabled:true,opens:'09:00',closes:'09:00'},{boardLayout:'bad'},{receiptNote:'x'.repeat(121)}])assert.throws(()=>validateCustomization(v));
 const valid=validateCustomization({counters:3,opens:'22:00',closes:'06:00',hoursEnabled:true});
 assert.match(hoursLabel(valid),/overnight/);
 assert.deepEqual(counterOptions(valid,[{lanes:{d:{active:{counter:'Counter 8'}}}}]),[1,2,3,8]);
});
test('new admin tabs and privacy-protected report reads are wired',()=>{
 const html=source('public/admin.html'),js=source('public/admin.js'),data=source('public/analytics-store.js');
 for(const tab of ['analytics','customization','onboarding']){assert.ok(html.includes('data-admin-tab="'+tab+'"'));assert.ok(html.includes('data-admin-section="'+tab+'" hidden'));assert.ok(js.includes("'"+tab+"'"));}
 assert.match(data,/getDocsFromServer/);assert.match(data,/startAfter\(cursor\)/);assert.match(data,/count>10000/);
 assert.doesNotMatch(data,/patientName|f\.note/);
 assert.match(source('public/admin-v3.js'),/updateHospitalCustomization\(h\.id,c\)/);
});
test('hospital custom settings are owner-writable only, existing documents compatible',()=>{
 const rules=source('firestore.rules');
 assert.match(rules,/function validCustomization\(c\)/);
 assert.match(rules,/!\('customization' in data\) \|\| validCustomization\(data.customization\)/);
 assert.match(rules,/allow update: if admin\(hid\) &&\s*request.resource.data.diff\(resource.data\).affectedKeys\(\).hasOnly\(\['name','updatedAt','recallGraceMinutes','customization'\]\)/);
 assert.match(rules,/c.counters >= 1 && c.counters <= 12/);
 assert.match(source('public/desk.js'),/selectedCounter>hospitalCustomization\(currentHospital\).counters/);
 assert.match(source('public/board.js'),/board-large-layout/);
});
