import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {avatarHTML,avatarContents,validProfilePhoto,initials} from '../public/profile-photo.js';
import {patientReportRows,safeReportFilename} from '../public/patient-report.js';
const file=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const escape=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

test('profile photos accept only small raster data URLs or removal',()=>{
 assert.ok(validProfilePhoto(''));
 assert.ok(validProfilePhoto('data:image/webp;base64,UklGRg=='));
 assert.ok(!validProfilePhoto('data:image/svg+xml;base64,PHN2Zz4='));
 assert.ok(!validProfilePhoto('https://example.com/photo.jpg'));
 assert.ok(!validProfilePhoto('data:image/png;base64,'+'A'.repeat(65001)));
});
test('member avatars use a safe raster image or escaped initials',()=>{
 assert.equal(initials('Ayesha Khan'),'AK');
 const no=avatarHTML({displayName:'Ayesha Khan'},escape);
 assert.match(no,/AK/);
 assert.doesNotMatch(avatarContents({profilePhoto:'javascript:alert(1)',displayName:'Staff'},escape),/img/);
 const yes=avatarContents({profilePhoto:'data:image/webp;base64,UklGRg=='},escape);
 assert.match(yes,/image\/webp/);
});
test('admin and receptionist can upload or remove their own profile pictures',()=>{
 const rules=file('firestore.rules');
 assert.match(rules,/function validAvatar/);
 assert.match(rules,/request\.auth\.uid == resource\.data\.uid/);
 assert.match(rules,/hasOnly\(\['profilePhoto','updatedAt'\]\)/);
 assert.match(file('public/admin.html'),/id="admin-profile-file"/);
 assert.match(file('public/desk.html'),/id="staff-profile-file"/);
 assert.match(file('public/admin.js'),/avatarHTML\(m,esc\)/);
});
test('redesigned tickets have the brand, QR, patient, room and issuing counter',()=>{
 const html=file('public/desk.html');
 for(const id of ['print-ticket','receipt-code','receipt-qr','receipt-visit','receipt-counter','receipt-issued'])
   assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/brand-light-blended\.webp/);
 assert.match(html,/LIVE WALK-IN QUEUE/);
});
test('patient record PDF rows include receptionist, both counters and attendance',()=>{
 const record={code:'CAR-001',patientName:'Sample Patient',patientGender:'female',queueName:'Cardiology',doctorName:'Demo Doctor',roomNumber:'B-201',
 dayKey:'2026-11-17',issuedAt:Date.now(),issuedCounter:'Counter 2',calledCounter:'Counter 3',attendance:'present',status:'completed'};
 const rows=patientReportRows(record,{issuedBy:'Ms Samira',calledBy:'Mr Hassan'});
 assert.ok(rows.some(([k,v])=>k==='Issued by'&&v==='Ms Samira'));
 assert.ok(rows.some(([k,v])=>k==='Issuing counter'&&v==='Counter 2'));
 assert.ok(rows.some(([k,v])=>k==='Calling counter'&&v==='Counter 3'));
 assert.ok(rows.some(([k,v])=>k==='Attendance'&&v==='Attended'));
 assert.equal(safeReportFilename(record),'TurnAhead-CAR-001-2026-11-17.pdf');
 assert.match(file('public/admin.html'),/history-download-pdf/);
});
test('push notification capabilities are accurately gated behind optional server setup',()=>{
 const client=file('public/push-client.js'),server=file('functions/index.js'),sw=file('public/push-sw.js');
 assert.match(client,/vapidPublicKey/);assert.match(client,/appCheckSiteKey/);
 assert.match(client,/display-mode: standalone/);
 assert.match(server,/enforceAppCheck:true/);assert.match(server,/before.status==='called'/);
 assert.match(server,/after.status!=='called'/);assert.match(server,/pushSubscriptions/);
 assert.match(sw,/onBackgroundMessage/);assert.match(sw,/showNotification/);
 assert.ok(!sw.includes('patientName'));
});
