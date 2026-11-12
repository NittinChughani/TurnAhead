import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {isStaffRole,canManageStaff,canInviteRole,invitationLink} from '../public/org-model.js';
const root=resolve(import.meta.dirname,'..');
const read=(name)=>readFileSync(resolve(root,name),'utf8');
test('separate login routes and no public staff signup on the reception panel',()=>{
 const home=read('public/index.html'),desk=read('public/desk.html'),admin=read('public/admin.html');
 assert.match(home,/Admin login<\/a>/);
 assert.match(home,/Staff login<\/a>/);
 assert.match(home,/Public board<\/a>/);
 assert.match(admin,/id="admin-login-form"/);
 assert.match(desk,/id="login-form"/);
 assert.doesNotMatch(desk,/show-register|register-form|Create an account|hospital-form/);
 assert.match(desk,/not registered/i);
});
test('staff activation requires a separate invitation-specific page',()=>{
 assert.equal(new URL(invitationLink('ABCDefGhijKLMnopQR12','https://example.org/TurnAhead/admin.html')).pathname,'/TurnAhead/activate.html');
 assert.match(read('public/activate.js'),/acceptInvitation\(hospitalId\)/);
 assert.match(read('public/activate.js'),/requestVerification/);
 assert.match(read('public/activate.html'),/INVITATION-ONLY ACCESS/);
});
test('only the hospital owner is administrator; old secondary admin cannot invite',()=>{
 assert.equal(canManageStaff('owner'),true);
 assert.equal(canManageStaff('admin'),false);
 assert.equal(canManageStaff('supervisor'),false);
 assert.equal(isStaffRole('owner'),false);
 assert.equal(isStaffRole('receptionist'),true);
 assert.equal(canInviteRole('owner','admin'),false);
 assert.equal(canInviteRole('owner','supervisor'),true);
});
test('Firestore rules block self-service owner and hospital creation',()=>{
 const rules=read('firestore.rules');
 assert.match(rules,/match \/hospitals\/\{hid\} \{[\s\S]*?allow create: if false;/);
 assert.match(rules,/function admin\(hid\) \{ return owner\(hid\); \}/);
 assert.match(rules,/request\.resource\.data\.role in \['supervisor','receptionist'\]/);
 assert.match(rules,/getAfter\(invitePath/);
 assert.doesNotMatch(rules,/Self-service hospital creation/);
 assert.match(rules,/allow list: if isMember\(hid\)/);
});
test('admin dashboard exposes anonymous operational data only',()=>{
 const html=read('public/admin.html');
 for(const id of ['admin-waiting','admin-serving','admin-completed','admin-average','patient-ticket-list','staff-list','department-list'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/No names, diagnoses, phone numbers or medical records/);
 assert.doesNotMatch(html,/patient-name|diagnosis-input/);
});
test('all local page links and script references exist',()=>{
 for(const file of ['index','desk','admin','activate','board','track']){
   const html=read(`public/${file}.html`);
   for(const match of html.matchAll(/(?:href|src)="\.\/([^"?#]+)[^\"]*"/g)){
     const dest=match[1];
     assert.ok(existsSync(resolve(root,'public',dest)),`${file}: ${dest} not found`);
   }
 }
});
