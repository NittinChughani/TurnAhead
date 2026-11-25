import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const pub=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('navbar is a rounded floating glass rectangle which disappears after scrolling',()=>{
  const css=pub('styles.css'),common=pub('common.js');
  assert.match(css,/\.site-header\{[\s\S]*?position:sticky;[\s\S]*?border-radius:23px/);
  assert.match(css,/\.site-header\.nav-scrolled-away\s*\{/);
  assert.match(css,/translate3d\(0,calc\(-100%\s*-\s*44px\),0\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(common,/addEventListener\('scroll'/);
  assert.match(common,/window\.scrollY>Math\.max\(70,header\.offsetHeight\)/);
  assert.match(css,/:focus-within/);
});
test('nav uses pixel-preserving cutout assets; original logo assets remain available',()=>{
  for(const page of ['index','admin','desk','board','track','activate']){
    const html=pub(page+'.html'),header=html.split('</header>')[0];
    assert.match(header,/brand-light-blended\.webp/);
    assert.match(header,/brand-dark-blended\.webp/);
  }
  for(const name of ['brand-light.webp','brand-dark.webp','brand-light-blended.webp','brand-dark-blended.webp'])
    assert.ok(existsSync(new URL('../public/assets/'+name,import.meta.url)));
});
test('issuer identity and issuing counter are recorded atomically in owner-only history, not public QR',()=>{
  const store=pub('store.js'),desk=pub('desk.js'),admin=pub('admin.js'),rules=file('firestore.rules');
  assert.match(store,/const issuedBy=auth\.currentUser\?\.uid/);
  assert.match(store,/issuedCounter=counterLabel\(details\.counterNumber\)/);
  assert.match(store,/tx\.set\(historyDoc\(hid,today,id,tr\.id\),\{\.\.\.archiveTicket\(tr\.id,ticket,now\),issuedBy,issuedCounter\}\)/);
  assert.doesNotMatch(store,/tx\.set\(tr,\{[^}]*issuedBy/);
  assert.match(desk,/const epoch=workspaceEpoch,hid=currentHospital.id,counter=selectedCounter/);
  assert.match(desk,/counterNumber:counter/);
  assert.match(admin,/Issued by receptionist/);
  assert.match(admin,/Issuing counter/);
  assert.match(rules,/request\.resource\.data\.issuedBy == request\.auth\.uid/);
  assert.match(rules,/affectedKeys\(\)\.hasOnly\(\['status','attendance','calledAt','finishedAt','updatedAt','calledCounter','calledBy','finishedBy','missedAt','recalledAt','recallCount'\]\)/);
});
test('private staff name in archived records comes from authorized hospital member profiles',()=>{
  const admin=pub('admin.js');
  assert.match(admin,/members\.find\(m=>m\.uid===t\.issuedBy\)/);
  assert.match(admin,/staffGreeting\(member\)/);
  assert.match(admin,/\['Called from counter',t\.calledCounter/);
});
test('README screenshots are dark-mode browser renders and complete WebP files',()=>{
  const readme=file('README.md'),script=file('scripts/render_previews.py');
  for(const name of ['preview-home','preview-patient','preview-reception','preview-public-board','preview-doctors','preview-records','preview-record-detail']){
    const data=readFileSync(new URL('../docs/assets/'+name+'.webp',import.meta.url));
    assert.equal(data.toString('ascii',0,4),'RIFF');
    assert.equal(data.toString('ascii',8,12),'WEBP');
    assert.ok(data.length>7000);
  }
  assert.match(script,/soup\.html\['data-theme'\]='dark'/);
  assert.match(script,/pw\.chromium\.launch/);
  assert.match(script,/locator\.screenshot/);
  assert.match(readme,/docs\/assets\/preview-record-detail\.webp/);
});
test('patient visit details remain separate from staff-only audit history',()=>{
  const rules=file('firestore.rules');
  assert.match(rules,/allow get, list: if owner\(hid\)/);
  assert.match(rules,/\('issuedCounter' in data\)/);
  assert.match(rules,/allow get: if true;/);
});
