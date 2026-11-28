import test from 'node:test';
import assert from 'node:assert/strict';
import {googleSignInTarget,startStagingGoogle,finishStagingGoogle} from '../public/staging-google.js';
const canonical='https://turnahead-staging.firebaseapp.com/admin.html',alias='https://turnahead-staging.web.app/admin.html';
function memory(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('Google auth uses the exact configured staging helper origin, never production',async()=>{
 assert.equal(googleSignInTarget(alias+'?hospital=synthetic'),canonical+'?hospital=synthetic');
 assert.equal(googleSignInTarget(canonical),null);
 assert.throws(()=>googleSignInTarget('https://example.invalid/admin.html'),/official/);
 let url;const r=await startStagingGoogle({}, {href:alias,navigate:x=>{url=x;},storage:memory(),load:()=>{throw Error('SDK not needed');}});
 assert.equal(url,canonical);assert.equal(r.navigating,true);
});
test('redirect completion passes verified identity only to existing authorization flow',async()=>{
 const storage=memory(),auth={},user={uid:'synthetic'},result={user};
 const load=async()=>({GoogleAuthProvider:class{setCustomParameters(p){assert.equal(p.prompt,'select_account');}},signInWithRedirect:async a=>assert.equal(a,auth),getRedirectResult:async a=>{assert.equal(a,auth);return result;}});
 await startStagingGoogle(auth,{href:canonical,storage,load});
 assert.equal(await finishStagingGoogle(auth,{href:canonical,storage,load}),result);
 assert.equal(await finishStagingGoogle(auth,{href:canonical,storage,load}),null);
});
test('failed redirect never reports successful authentication',async()=>{
 const storage=memory(),auth={},load=async()=>({GoogleAuthProvider:class{setCustomParameters(){}},signInWithRedirect:async()=>{},getRedirectResult:async()=>null});
 await startStagingGoogle(auth,{href:canonical,storage,load});
 await assert.rejects(finishStagingGoogle(auth,{href:canonical,storage,load}),/did not complete/);
 assert.equal(await finishStagingGoogle(auth,{href:canonical,storage,load}),null);
});
