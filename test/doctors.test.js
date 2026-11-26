import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanDoctorName,cleanRoomNumber,doctorAvailable} from '../public/doctor-model.js';
const html=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('doctor name and room are normalized and validated',()=>{
  assert.equal(cleanDoctorName('  Ayesha   Shah  '),'Ayesha Shah');
  assert.equal(cleanRoomNumber('  B-204  '),'B-204');
  assert.throws(()=>cleanDoctorName('X'));assert.throws(()=>cleanRoomNumber('!!',{required:true}));
});
test('only active doctors from the chosen department appear at reception',()=>{
  const doctor={active:true,departmentId:'physio'};
  assert.equal(doctorAvailable(doctor,'physio'),true);
  assert.equal(doctorAvailable(doctor,'cardiology'),false);
  assert.equal(doctorAvailable({...doctor,active:false},'physio'),false);
});
test('there is exactly one Staff login link in the top homepage navigation',()=>{
  const nav=html('index.html').match(/<header class="site-header">([\s\S]*?)<\/header>/)[1];
  assert.equal((nav.match(/Staff login/gi)||[]).length,1);
});
test('board clock and patient loader are visible and script uses vibration only when supported',()=>{
  const board=readFileSync(new URL('../public/board.js',import.meta.url),'utf8');
  const track=readFileSync(new URL('../public/track.js',import.meta.url),'utf8');
  assert.match(board,/displayClock/);assert.match(html('track.html'),/id="track-loading"/);
  assert.match(track,/navigator.vibrate/);assert.match(track,/vibrationEnabled/);
});
test('admin doctor CRUD, history date picker and patient details modal are present',()=>{
  const admin=html('admin.html');
  for(const id of ['doctor-form','doctor-list','doctor-edit-modal','history-open-date','history-detail-modal'])
    assert.ok(admin.includes(`id="${id}"`),id);
});
test('Firestore rules limit doctor changes to owner and archived records to owner',()=>{
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  assert.match(rules,/match \/doctors\/\{doctorId\}/);
  assert.match(rules,/allow create: if owner\(hid\) && validDoctor/);
  assert.match(rules,/let d = get\(doctorPath\(hid,t.doctorId\)\).data/);assert.match(rules,/d.departmentId == t.queueId/);
  assert.match(rules,/allow get, list: if owner\(hid\)/);
});
