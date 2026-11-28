import test from 'node:test';
import assert from 'node:assert/strict';
import {withWorkspaceTimeout} from '../public/signin-loader.js';

test('workspace verification preserves authorized result and explicit denial',async()=>{
 const result={member:{role:'owner'},hospital:{id:'synthetic'}};
 assert.equal(await withWorkspaceTimeout(()=>result,1000),result);
 const denied={member:null,hospital:null};
 assert.equal(await withWorkspaceTimeout(()=>denied,1000),denied);
 await assert.rejects(withWorkspaceTimeout(()=>Promise.reject(Error('Permission denied')),1000),/Permission denied/);
});
test('stalled workspace verification fails closed and late response cannot authorize',async()=>{
 let complete;
 const pending=new Promise(resolve=>{complete=resolve;});
 const result=withWorkspaceTimeout(()=>pending,10);
 await assert.rejects(result,/Workspace verification timed out/);
 complete({member:{role:'owner'},hospital:{id:'synthetic'}});
 await assert.rejects(result,/Workspace verification timed out/);
});
