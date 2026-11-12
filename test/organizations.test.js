import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEmail,validHospitalName,canManageStaff,canManageDepartments,
  canInviteRole,canChangeRole,membershipId,boardLink,invitationLink,ticketLink} from '../public/org-model.js';
const hid='ABcdEFghIJklMNopQR12',uid='Firebase_User_123';
const base='https://nittinchughani.github.io/TurnAhead/desk.html';
test('email invitations normalize casing and reject invalid addresses',()=>{
  assert.equal(normalizeEmail(' Staff@Example.COM '),'staff@example.com');
  for(const input of ['','broken','x@y','x/y@example.com']) assert.throws(()=>normalizeEmail(input));
});
test('hospital names are validated and normalized',()=>{
  assert.equal(validHospitalName('  Riverside   Medical  '),'Riverside Medical');
  assert.throws(()=>validHospitalName('x'));
  assert.throws(()=>validHospitalName('Z'.repeat(71)));
});
test('owner and administrator manage staff; supervisor only manages departments',()=>{
  assert.equal(canManageStaff('owner'),true);
  assert.equal(canManageStaff('admin'),true);
  assert.equal(canManageStaff('supervisor'),false);
  assert.equal(canManageDepartments('supervisor'),true);
  assert.equal(canManageDepartments('receptionist'),false);
});
test('only hospital owner can invite administrators',()=>{
  assert.equal(canInviteRole('owner','admin'),true);
  assert.equal(canInviteRole('admin','admin'),false);
  assert.equal(canInviteRole('admin','receptionist'),true);
  assert.equal(canInviteRole('supervisor','receptionist'),false);
  assert.equal(canInviteRole('owner','owner'),false);
});
test('hospital owner role is immutable; admins cannot promote themselves',()=>{
  assert.equal(canChangeRole('owner','owner','admin'),false);
  assert.equal(canChangeRole('owner','admin','supervisor'),true);
  assert.equal(canChangeRole('admin','admin','receptionist'),false);
  assert.equal(canChangeRole('admin','supervisor','admin'),false);
  assert.equal(canChangeRole('admin','receptionist','supervisor'),true);
});
test('membership keys are scoped to both workspace and Firebase UID',()=>{
  assert.equal(membershipId(hid,uid),`${hid}_${uid}`);
  assert.notEqual(membershipId(hid,uid),membershipId('zzzzzzzzzzzzzzzzzzzz',uid));
  assert.throws(()=>membershipId('../other',uid));
});
test('share links use independent hospital-specific query values',()=>{
  const board=new URL(boardLink(hid,base));
  const invite=new URL(invitationLink(hid,base));
  const patient=new URL(ticketLink(hid,'SomeRandomTicketId123',base));
  assert.equal(board.pathname,'/TurnAhead/board.html');
  assert.equal(board.searchParams.get('hospital'),hid);
  assert.equal(invite.pathname,'/TurnAhead/desk.html');
  assert.equal(invite.searchParams.get('invite'),hid);
  assert.equal(patient.pathname,'/TurnAhead/track.html');
  assert.equal(patient.searchParams.get('hospital'),hid);
  assert.equal(patient.searchParams.get('ticket'),'SomeRandomTicketId123');
});
