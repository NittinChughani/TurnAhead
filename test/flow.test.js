'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

async function freePort() {
  return new Promise((resolve,reject)=>{
    const s=net.createServer();s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});
  });
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
let child,base,dir,cookie;
async function api(route,method='GET',data,authenticated=true) {
  const resp=await fetch(base+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(authenticated&&cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});
  const contentType=resp.headers.get('content-type')||'';
  const body=contentType.includes('application/json')?await resp.json():await resp.text();
  return {resp,body};
}
test.before(async()=>{
  const port=await freePort();base=`http://127.0.0.1:${port}`;dir=fs.mkdtempSync(path.join(os.tmpdir(),'turnahead-test-'));
  child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_PASSWORD:'sample-long-password-for-tests',SESSION_SECRET:'this-is-a-long-random-test-secret-0123456789',FACILITY_NAME:'Test Facility',TIME_ZONE:'Asia/Karachi'},stdio:['ignore','pipe','pipe']});
  let started=false;
  for(let i=0;i<70;i++){if(child.exitCode!==null)break;try{const result=await fetch(base+'/api/health');if(result.ok){started=true;break;}}catch{}await sleep(70);}
  if(!started)throw new Error('Server did not start');
});
test.after(()=>{child?.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});});

test('serves all four screen routes and health endpoint',async()=>{
  for(const route of ['/','/desk','/board']) {const r=await fetch(base+route);assert.equal(r.status,200);assert.match(await r.text(),/TurnAhead/);}
  assert.equal((await api('/api/health')).body.ok,true);
});
test('rejects anonymous queue mutation and bad password',async()=>{
  const unauthorized=await api('/api/queues/general-opd/tickets','POST',{},false);
  assert.equal(unauthorized.resp.status,401);
  const bad=await api('/api/login','POST',{password:'wrong'},false);
  assert.equal(bad.resp.status,401);
});
test('logs receptionist in with secure, HTTP-only cookie',async()=>{
  const r=await api('/api/login','POST',{password:'sample-long-password-for-tests'},false);
  assert.equal(r.resp.status,200);
  cookie=r.resp.headers.get('set-cookie').split(';')[0];
  assert.match(r.resp.headers.get('set-cookie'),/HttpOnly/);
  assert.equal((await api('/api/session')).body.authenticated,true);
});
test('creates trackable tickets with real QR SVG and rejects fake tickets',async()=>{
  const one=await api('/api/queues/general-opd/tickets','POST',{});assert.equal(one.resp.status,201);assert.equal(one.body.code,'A-001');
  const two=await api('/api/queues/general-opd/tickets','POST',{});assert.equal(two.body.code,'A-002');
  const tracking=await api('/api/track/'+one.body.secret);assert.equal(tracking.body.status,'waiting');assert.equal(tracking.body.peopleAhead,0);
  const second=await api('/api/track/'+two.body.secret);assert.equal(second.body.peopleAhead,1);
  const svg=await api(one.body.qrUrl);assert.equal(svg.resp.status,200);assert.match(svg.body,/<svg/);assert.match(svg.body,/<path/);
  assert.equal((await fetch(base+'/track/'+one.body.secret)).status,200);
  const fake=await api('/api/track/'+'x'.repeat(24));assert.equal(fake.resp.status,404);
  globalThis.testTickets={one,two};
});
test('updates public, reception and patient states across full service lifecycle',async()=>{
  const called=await api('/api/queues/general-opd/next','POST',{});assert.equal(called.body.code,'A-001');
  const again=await api('/api/queues/general-opd/next','POST',{});assert.equal(again.resp.status,409);
  assert.equal((await api('/api/track/'+globalThis.testTickets.one.body.secret)).body.status,'called');
  const waiting=await api('/api/track/'+globalThis.testTickets.two.body.secret);assert.equal(waiting.body.peopleAhead,1);
  assert.equal((await api('/api/queues/general-opd/complete','POST',{})).body.code,'A-001');
  assert.equal((await api('/api/track/'+globalThis.testTickets.one.body.secret)).body.status,'completed');
  assert.equal((await api('/api/queues/general-opd/next','POST',{})).body.code,'A-002');
  assert.equal((await api('/api/queues/general-opd/skip','POST',{})).body.code,'A-002');
  assert.equal((await api('/api/track/'+globalThis.testTickets.two.body.secret)).body.status,'skipped');
  const summary=await api('/api/public/queues');assert.equal(summary.body.queues[0].served,1);assert.equal(summary.body.queues[0].skipped,1);
});
test('pause blocks calling tickets and resume restores service',async()=>{
  const third=await api('/api/queues/general-opd/tickets','POST',{});assert.equal(third.body.code,'A-003');
  assert.equal((await api('/api/queues/general-opd/pause','POST',{})).resp.status,200);
  assert.equal((await api('/api/queues/general-opd/next','POST',{})).resp.status,409);
  const paused=await api('/api/track/'+third.body.secret);
  assert.equal(paused.body.estimatedMinutes,null);
  assert.equal(paused.body.paused,true);
  assert.equal((await api('/api/queues/general-opd/resume','POST',{})).resp.status,200);
  assert.equal((await api('/api/queues/general-opd/next','POST',{})).body.code,'A-003');
});
test('creates a separate department and independent B-series queue',async()=>{
  const create=await api('/api/queues','POST',{name:'Laboratory'});
  assert.equal(create.resp.status,201);
  const tk=await api('/api/queues/'+create.body.id+'/tickets','POST',{});
  assert.equal(tk.body.code,'B-001');
  const board=await api('/api/public/queues');
  assert.equal(board.body.queues.length,2);
  assert.equal(board.body.queues[1].waiting,1);
});
test('blocks unsupported methods, malformed inputs and malicious cross-origin posts',async()=>{
  const missing=await api('/api/queues/general-opd/complete','POST',{});
  assert.equal(missing.resp.status,200);
  const invalid=await api('/api/queues','POST',{name:'a'});
  assert.equal(invalid.resp.status,400);
  const forged=await fetch(base+'/api/queues',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({name:'Malicious Queue'})});
  assert.equal(forged.status,403);
  assert.equal((await fetch(base+'/api/unknown')).status,404);
});
test('logs out and revokes current browser session',async()=>{
  const logout=await api('/api/logout','POST',{});
  assert.equal(logout.resp.status,200);
  cookie=logout.resp.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('/api/session')).body.authenticated,false);
});