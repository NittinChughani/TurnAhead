import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp,Timestamp,query,where,runTransaction} from 'firebase/firestore';
import {planTicketChange,planDepartmentTransfer} from '../public/ticket-change.js';
import {initialQueue,initialControl,nextTicket,planDoctorCall,planDoctorFinish,dayKey} from '../public/queue-engine.js';
import {defaultCustomization} from '../public/hospital-custom.js';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Refusing to run without the Firestore emulator.');
const projectId='demo-turnahead',h='H'.repeat(20),other='X'.repeat(20),doctor='D'.repeat(20),tid='T'.repeat(20),done='F'.repeat(20),department='general-opd',day=dayKey(),now=Date.now();
let env;
const root=(db,id=h)=>doc(db,'hospitals',id);
const p=(db,group,id,tenant=h)=>doc(db,'hospitals',tenant,group,id);
const archive=(db,id=tid,tenant=h)=>doc(db,'hospitals',tenant,'history',day,'departments',department,'records',id);
const claims=uid=>({email:uid+'@example.test',email_verified:true});
const user=uid=>env.authenticatedContext(uid,claims(uid)).firestore();
const member=(uid,role,active=true,hospitalId=h)=>({uid,hospitalId,email:uid+'@example.test',role,active,createdAt:Timestamp.fromMillis(now),updatedAt:Timestamp.fromMillis(now),invitedBy:'owner',displayName:'Test staff',gender:'unspecified'});
const seedTicket=nextTicket(initialQueue('General OPD','GEN',day,now),tid,day,now,'Fictional Patient',{patientGender:'male',doctorId:doctor,doctorName:'Test Doctor',roomNumber:'1'});
const waiting={...seedTicket.ticket,queueId:department};
const completed={...waiting,code:'GEN-009',number:9,status:'completed',attendance:'present',calledAt:now+1000,finishedAt:now+2000,calledCounter:'Counter 1'};
function record(id,t){return {ticketId:id,queueId:t.queueId,queueName:t.queueName,code:t.code,number:t.number,dayKey:t.dayKey,patientName:t.patientName,patientGender:t.patientGender,doctorId:t.doctorId,doctorName:t.doctorName,roomNumber:t.roomNumber,status:t.status,attendance:t.attendance,issuedAt:t.createdAt,calledAt:t.calledAt,finishedAt:t.finishedAt,updatedAt:now,issuedBy:'staff',issuedCounter:'Counter 1',calledBy:'',finishedBy:'',calledCounter:t.calledCounter||''};}
before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore(),stamp=Timestamp.fromMillis(now);
  await Promise.all([
   setDoc(root(db),{name:'Demo hospital',ownerUid:'owner',status:'active',createdAt:stamp,updatedAt:stamp}),
   setDoc(root(db,other),{name:'Other hospital',ownerUid:'otherowner',status:'active',createdAt:stamp,updatedAt:stamp}),
   ...[['owner','owner',true,h],['staff','receptionist',true,h],['supervisor','supervisor',true,h],['disabled','receptionist',false,h],['otherowner','owner',true,other]].map(([uid,role,active,tenant])=>setDoc(doc(db,'memberships',tenant+'_'+uid),member(uid,role,active,tenant))),
   setDoc(p(db,'queues',department),seedTicket.queue),
   setDoc(p(db,'controls',department),{...initialControl(),lanes:{[doctor]:{pending:[{id:tid,number:1}],activeId:null,activeSince:null,activeCounter:'',activeUid:''}}}),
   setDoc(p(db,'doctors',doctor),{name:'Test Doctor',departmentId:department,departmentName:'General OPD',roomNumber:'1',active:true,createdAt:stamp,updatedAt:stamp}),
   setDoc(p(db,'tickets',tid),waiting),setDoc(p(db,'tickets',done),completed),
   setDoc(p(db,'history',day),{dayKey:day,createdAt:now}),
   setDoc(archive(db),record(tid,waiting)),setDoc(archive(db,done),record(done,completed)),
   setDoc(archive(db,done,other),record(done,completed))
  ]);
 });
});
test('public QR bearer reads and anonymous board are allowed, enumeration and private records are denied',async()=>{
 const db=env.unauthenticatedContext().firestore();
 await assertSucceeds(getDoc(root(db)));
 await assertSucceeds(getDoc(p(db,'tickets',tid)));
 await assertSucceeds(getDocs(collection(db,'hospitals',h,'queues')));
 await assertFails(getDocs(collection(db,'hospitals')));
 await assertFails(getDocs(collection(db,'hospitals',h,'tickets')));
 await assertFails(getDoc(archive(db)));
 await assertFails(getDoc(p(db,'controls',department)));
 await assertFails(getDoc(p(db,'doctors',doctor)));
 await assertFails(updateDoc(p(db,'tickets',tid),{patientName:'Changed'}));
});
test('owner-only history, feedback and staff access with cross-hospital isolation',async()=>{
 const owner=user('owner'),staff=user('staff'),sup=user('supervisor'),disabled=user('disabled'),outside=user('otherowner');
 await assertSucceeds(getDoc(archive(owner)));
 await assertSucceeds(getDocs(collection(owner,'hospitals',h,'history',day,'departments',department,'records')));
 await assertSucceeds(getDocs(collection(owner,'hospitals',h,'feedback')));
 await assertSucceeds(getDocs(query(collection(owner,'memberships'),where('hospitalId','==',h))));
 for(const db of [staff,sup,disabled,outside]){await assertFails(getDoc(archive(db)));await assertFails(getDocs(collection(db,'hospitals',h,'feedback')));}
 await assertFails(getDoc(archive(owner,done,other)));
 await assertSucceeds(getDoc(p(staff,'controls',department)));
 await assertFails(getDoc(p(disabled,'controls',department)));
 await assertFails(getDoc(p(outside,'controls',department)));
 await assertFails(getDoc(p(env.authenticatedContext('staff',{email:'staff@example.test',email_verified:false}).firestore(),'controls',department)));
 await assertFails(updateDoc(doc(staff,'memberships',h+'_staff'),{role:'owner',updatedAt:serverTimestamp()}));
});
test('valid branding is owner-only and malformed customizations fail closed',async()=>{
 const owner=user('owner');
 await assertSucceeds(updateDoc(root(owner),{customization:{...defaultCustomization,counters:4},updatedAt:serverTimestamp()}));
 for(const bad of [{counters:13},{logo:'javascript:alert(1)'},{accent:'red'},{opens:'26:00'},{hoursEnabled:true,opens:'09:00',closes:'09:00'},{boardMessage:'x'.repeat(121)},{extra:true}]){
  await assertFails(updateDoc(root(owner),{customization:{...defaultCustomization,...bad},updatedAt:serverTimestamp()}));
 }
 for(const uid of ['staff','supervisor','disabled','otherowner'])await assertFails(updateDoc(root(user(uid)),{customization:defaultCustomization,updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(root(owner),{ownerUid:'staff',updatedAt:serverTimestamp()}));
});
test('feedback is anonymous create-once only for a completed ticket, private and immutable',async()=>{
 const db=env.unauthenticatedContext().firestore(),payload=id=>({ticketId:id,rating:5,note:'Fictional feedback',createdAt:serverTimestamp()});
 await assertFails(setDoc(p(db,'feedback',tid),payload(tid)));
 await assertFails(setDoc(p(db,'feedback',done),{...payload(done),rating:6}));
 await assertFails(setDoc(p(db,'feedback',done),{...payload(done),note:'x'.repeat(301)}));
 await assertSucceeds(setDoc(p(db,'feedback',done),payload(done)));
 await assertFails(getDoc(p(db,'feedback',done)));
 await assertSucceeds(getDoc(p(user('owner'),'feedback',done)));
 await assertFails(setDoc(p(db,'feedback',done),payload(done)));
 await assertFails(deleteDoc(p(user('owner'),'feedback',done)));
});
test('two concurrent counters cannot claim the same FIFO ticket',async()=>{
 const call=async counter=>{
  const db=user('staff'),q=p(db,'queues',department),c=p(db,'controls',department),t=p(db,'tickets',tid),a=archive(db);
  return runTransaction(db,async tx=>{
   const [qs,cs,ts]=await Promise.all([tx.get(q),tx.get(c),tx.get(t)]);
   const plan=planDoctorCall(qs.data(),cs.data(),doctor,ts.data(),tid,counter,'staff',Date.now());
   tx.update(q,plan.queuePatch);tx.update(c,plan.controlPatch);tx.update(t,plan.ticketPatch);tx.update(a,plan.historyPatch);
  });
 };
 const results=await Promise.allSettled([call('Counter 1'),call('Counter 2')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const db=user('owner'),q=(await getDoc(p(db,'queues',department))).data(),t=(await getDoc(p(db,'tickets',tid))).data(),a=(await getDoc(archive(db))).data();
 assert.equal(t.status,'called');assert.equal(a.status,'called');assert.equal(t.calledCounter,a.calledCounter);assert.equal(q.lanes[doctor].active.code,t.code);assert.deepEqual(q.waitingNumbers,[]);
 await assertFails(updateDoc(p(user('staff'),'tickets',tid),{doctorName:'Different doctor'}));
});

test('waiting ticket correction requires matching private audit and archive',async()=>{
 const staff=user('staff'),owner=user('owner'),event='C'.repeat(20);
 await assertFails(updateDoc(p(staff,'tickets',tid),{patientName:'New name'}));
 const change=async db=>runTransaction(db,async tx=>{
  tx.update(p(db,'tickets',tid),{patientName:'Corrected Fictional',changeId:event});
  tx.update(archive(db),{patientName:'Corrected Fictional',updatedAt:now+1});
  tx.set(p(db,'ticketChanges',event),{kind:'correction',ticketId:tid,actorUid:'staff',fromDoctor:doctor,toDoctor:doctor,createdAt:serverTimestamp()});
 });
 await assertFails(change(user('disabled')));await assertSucceeds(change(staff));
 await assertSucceeds(getDoc(p(owner,'ticketChanges',event)));
 await assertFails(getDoc(p(staff,'ticketChanges',event)));await assertFails(deleteDoc(p(owner,'ticketChanges',event)));
 assert.equal((await getDoc(archive(owner))).data().patientName,'Corrected Fictional');
});
test('doctor transfer requires atomic queue, control, ticket, archive and audit',async()=>{
 const target='E'.repeat(20),event='Z'.repeat(20),staff=user('staff'),owner=user('owner');
 const d={name:'Second Doctor',departmentId:department,departmentName:'General OPD',roomNumber:'2',active:true,createdAt:Timestamp.fromMillis(now),updatedAt:Timestamp.fromMillis(now)};
 await env.withSecurityRulesDisabled(async ctx=>setDoc(p(ctx.firestore(),'doctors',target),d));
 const change=async(includeLanes)=>runTransaction(staff,async tx=>{
  const q=p(staff,'queues',department),c=p(staff,'controls',department);
  const [qs,cs]=await Promise.all([tx.get(q),tx.get(c)]);
  const plan=planTicketChange(qs.data(),cs.data(),waiting,tid,d,target,{patientName:waiting.patientName,patientGender:waiting.patientGender,roomNumber:'2'},now+1,day);
  if(includeLanes){tx.update(q,plan.queuePatch);tx.update(c,plan.controlPatch);}
  tx.update(p(staff,'tickets',tid),{...plan.patch,changeId:event});
  tx.update(archive(staff),{...plan.patch,updatedAt:now+1});
  tx.set(p(staff,'ticketChanges',event),{kind:'transfer',ticketId:tid,actorUid:'staff',fromDoctor:doctor,toDoctor:target,createdAt:serverTimestamp()});
 });
 await assertFails(change(false));await assertSucceeds(change(true));
 const q=(await getDoc(p(owner,'queues',department))).data(),t=(await getDoc(p(owner,'tickets',tid))).data();
 assert.deepEqual(q.lanes[doctor].waitingNumbers,[]);assert.deepEqual(q.lanes[target].waitingNumbers,[1]);assert.equal(t.code,waiting.code);assert.equal(t.doctorId,target);
 assert.equal((await getDoc(archive(owner))).data().doctorId,target);
});

test('cross-department transfer retains original archive, new code, and can be called and completed',async()=>{
 const target='E'.repeat(20),dest='radiology',event='R'.repeat(20),staff=user('staff'),owner=user('owner');
 const d={name:'Second Doctor',departmentId:dest,departmentName:'Radiology',roomNumber:'2',active:true,createdAt:Timestamp.fromMillis(now),updatedAt:Timestamp.fromMillis(now)};
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await Promise.all([setDoc(p(db,'doctors',target),d),setDoc(p(db,'queues',dest),initialQueue('Radiology','RAD',day,now)),setDoc(p(db,'controls',dest),initialControl())]);});
 const tr=p(staff,'tickets',tid),q=p(staff,'queues',department),c=p(staff,'controls',department),dq=p(staff,'queues',dest),dc=p(staff,'controls',dest);
 const change=includeArchive=>runTransaction(staff,async tx=>{
  const [qs,cs,dqs,dcs,ts]=await Promise.all([q,c,dq,dc,tr].map(x=>tx.get(x)));
  const plan=planDepartmentTransfer(qs.data(),cs.data(),dqs.data(),dcs.data(),ts.data(),tid,d,target,dest,{patientName:waiting.patientName,patientGender:waiting.patientGender,roomNumber:'2'},now+1,day);
  tx.update(q,plan.queuePatch);tx.update(c,plan.controlPatch);tx.update(dq,plan.destinationQueuePatch);tx.update(dc,plan.destinationControlPatch);
  tx.update(tr,{...plan.patch,changeId:event});
  if(includeArchive)tx.update(archive(staff),plan.archivePatch);
  tx.set(p(staff,'ticketChanges',event),{kind:'department-transfer',ticketId:tid,actorUid:'staff',fromDoctor:doctor,toDoctor:target,createdAt:serverTimestamp()});
 });
 await assertFails(change(false));await assertSucceeds(change(true));
 const after=(await getDoc(tr)).data();assert.equal(after.code,'RAD-001');assert.equal(after.originQueueId,department);
 const a=(await getDoc(archive(owner))).data();assert.equal(a.code,waiting.code);assert.equal(a.serviceCode,after.code);assert.equal(a.issuedBy,'staff');
 assert.deepEqual((await getDoc(q)).data().waitingNumbers,[]);
 assert.equal((await getDoc(p(owner,'ticketChanges',event))).data().kind,'department-transfer');
 await assertSucceeds(runTransaction(staff,async tx=>{
  const [qs,cs,ts]=await Promise.all([dq,dc,tr].map(x=>tx.get(x)));
  const plan=planDoctorCall(qs.data(),cs.data(),target,ts.data(),tid,'Counter 1','staff',now+1000);
  tx.update(dq,plan.queuePatch);tx.update(dc,plan.controlPatch);tx.update(tr,plan.ticketPatch);tx.update(archive(staff),plan.historyPatch);
 }));
 await assertSucceeds(runTransaction(staff,async tx=>{
  const [qs,cs,ts]=await Promise.all([dq,dc,tr].map(x=>tx.get(x)));
  const plan=planDoctorFinish(qs.data(),cs.data(),target,ts.data(),'Counter 1','staff','complete',now+2000);
  tx.update(dq,plan.queuePatch);tx.update(dc,plan.controlPatch);tx.update(tr,plan.ticketPatch);tx.update(archive(staff),plan.historyPatch);
 }));
 assert.equal((await getDoc(archive(owner))).data().status,'completed');
 assert.equal((await getDoc(archive(owner))).data().serviceCode,'RAD-001');
});

test('activity events are owner-readable, immutable, restricted by actor and role',async()=>{
 const staff=user('staff'),owner=user('owner'),event='A'.repeat(20),path=db=>p(db,'activity',event);
 const data={kind:'ticket-issued',actorUid:'staff',createdAt:serverTimestamp()};
 await assertFails(setDoc(path(user('disabled')),data));await assertFails(setDoc(path(staff),{...data,actorUid:'owner'}));
 await assertFails(setDoc(path(staff),{...data,kind:'staff-updated'}));await assertFails(setDoc(path(staff),{...data,patientName:'Private'}));
 await assertSucceeds(setDoc(path(staff),data));await assertSucceeds(getDoc(path(owner)));await assertFails(getDoc(path(staff)));
 await assertFails(updateDoc(path(owner),{kind:'ticket-called'}));await assertFails(deleteDoc(path(owner)));
 await assertSucceeds(setDoc(p(owner,'activity','B'.repeat(20)),{kind:'staff-updated',actorUid:'owner',createdAt:serverTimestamp()}));
});

test('commercial data: verified lead intake, immutable billing and tenant isolation',async()=>{
 const db=user('prospect'),anon=env.unauthenticatedContext().firestore(),owner=user('owner'),outside=user('otherowner'),staff=user('staff');
 const lead={uid:'prospect',email:'prospect@example.test',organization:'Example clinic',representative:'Test contact',phone:'03001234567',plan:'essential',cycle:'annual',status:'pending',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(anon,'commercialLeads','prospect'),lead));
 await assertFails(setDoc(doc(db,'commercialLeads','someone'),lead));
 await assertFails(setDoc(doc(db,'commercialLeads','prospect'),{...lead,status:'active'}));
 await assertSucceeds(setDoc(doc(db,'commercialLeads','prospect'),lead));
 await assertSucceeds(getDoc(doc(db,'commercialLeads','prospect')));
 await assertFails(getDoc(doc(owner,'commercialLeads','prospect')));
 await assertFails(getDocs(collection(db,'commercialLeads')));
 await assertFails(updateDoc(doc(db,'commercialLeads','prospect'),{status:'active'}));
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'commercialAccounts',h),{plan:'essential',cycle:'annual',status:'active'});});
 await assertSucceeds(getDoc(doc(owner,'commercialAccounts',h)));
 for(const x of [anon,outside,staff])await assertFails(getDoc(doc(x,'commercialAccounts',h)));
 await assertFails(updateDoc(doc(owner,'commercialAccounts',h),{plan:'enterprise'}));
 const req={uid:'owner',kind:'renew',plan:'essential',cycle:'annual',message:'',status:'pending',createdAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(owner,'commercialAccounts',h,'requests','renew'),req));
 await assertFails(setDoc(doc(outside,'commercialAccounts',h,'requests','renew'),req));
 await assertFails(updateDoc(doc(owner,'commercialAccounts',h,'requests','renew'),{status:'approved'}));
 const operator=env.authenticatedContext('operator',{...claims('operator'),turnaheadPlatformOperator:true}).firestore();
 await assertSucceeds(getDocs(collection(operator,'commercialLeads')));
 await assertSucceeds(getDoc(doc(operator,'commercialAccounts',h)));
 await assertFails(updateDoc(doc(operator,'commercialAccounts',h),{plan:'enterprise'}));
 await assertFails(getDoc(archive(operator)));
});

test('managed capacity requires atomic unique resource reservations and protects existing queues',async()=>{
 const db=user('owner'),cap=p(db,'capacity','managed'),account=doc(db,'commercialAccounts',h),newQueue='next-department',otherQueue='overflow-department',newDoctor='N'.repeat(20);
 const queue=initialQueue('New department','NEW',day,now),docData={name:'New Doctor',departmentId:department,departmentName:'General OPD',roomNumber:'2',active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 const seed=async(expires=now+86400000)=>env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await setDoc(doc(d,'commercialAccounts',h),{status:'active',plan:'essential',expiresAt:Timestamp.fromMillis(expires)});await setDoc(p(d,'capacity','managed'),{departments:1,doctors:1,staff:3,limits:{departments:2,doctors:2,staff:4},lastKind:'',lastId:'',updatedAt:Timestamp.fromMillis(now)});});
 await seed();
 await assertFails(setDoc(p(db,'queues',newQueue),queue));
 await assertFails(updateDoc(cap,{departments:0}));
 await assertFails(updateDoc(cap,{limits:{departments:99,doctors:99,staff:99}}));
 const add=async(kind,id,value)=>runTransaction(db,async tx=>{const s=await tx.get(cap);tx.update(cap,{[kind]:s.data()[kind]+1,lastKind:kind,lastId:id,updatedAt:serverTimestamp()});tx.set(p(db,kind==='departments'?'queues':'doctors',id),value);});
 await assertSucceeds(add('departments',newQueue,queue));
 await assertFails(add('departments',otherQueue,queue));
 await assertFails(setDoc(p(db,'doctors',newDoctor),docData));
 await assertSucceeds(add('doctors',newDoctor,docData));
 await assertFails(add('doctors','Q'.repeat(20),docData));
 await assertFails(updateDoc(cap,{doctors:2,lastKind:'doctors',lastId:'Q'.repeat(20),updatedAt:serverTimestamp()}));
 await env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'commercialAccounts',h),{expiresAt:Timestamp.fromMillis(now-1000)});});
 await assertSucceeds(updateDoc(p(db,'queues',department),{updatedAt:now+100}));
 await assertSucceeds(getDoc(archive(db)));
 await assertFails(setDoc(p(db,'queues','more'),queue));
});
test('accepted staff invitation atomically consumes a permanent managed staff slot',async()=>{
 const uid='newstaff',db=user(uid),email=uid+'@example.test',cap=p(db,'capacity','managed'),invite=p(db,'invites',email),ref=doc(db,'memberships',h+'_'+uid);
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore(),stamp=Timestamp.fromMillis(now);await setDoc(doc(d,'commercialAccounts',h),{plan:'essential',status:'active',expiresAt:Timestamp.fromMillis(now+86400000)});await setDoc(p(d,'capacity','managed'),{departments:1,doctors:1,staff:2,limits:{departments:2,doctors:5,staff:3},lastKind:'',lastId:'',updatedAt:stamp});await setDoc(p(d,'invites',email),{email,role:'receptionist',status:'pending',createdBy:'owner',createdAt:stamp,expiresAt:Timestamp.fromMillis(now+86400000),acceptedUid:null,acceptedAt:null,displayName:'Test staff',gender:'male'});});
 const accept=reserve=>runTransaction(db,async tx=>{const s=await tx.get(cap);if(reserve)tx.update(cap,{staff:s.data().staff+1,lastKind:'staff',lastId:uid,updatedAt:serverTimestamp()});tx.set(ref,{...member(uid,'receptionist'),gender:'male',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});tx.update(invite,{status:'accepted',acceptedUid:uid,acceptedAt:serverTimestamp()});});
 await assertFails(accept(false));await assertSucceeds(accept(true));await assertFails(accept(true));
});

test('commercial operator audit and payment records are read-only and isolated; migration locks do not halt queues',async()=>{
 const own=user('owner'),out=user('otherowner'),staff=user('staff'),operator=env.authenticatedContext('operator',{...claims('operator'),turnaheadPlatformOperator:true}).firestore();
 await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();await setDoc(doc(d,'commercialAccounts',h,'payments','test'),{amount:4999,status:'verified'});await setDoc(doc(d,'commercialAccounts',h,'notices','test'),{stage:'7'});await setDoc(doc(d,'commercialAudit','test'),{kind:'payment-verified'});await setDoc(doc(d,'commercialMigrationLocks',h),{orderId:'test'});});
 for(const key of ['payments','notices']){const ref=db=>doc(db,'commercialAccounts',h,key,'test');await assertSucceeds(getDoc(ref(own)));await assertSucceeds(getDoc(ref(operator)));await assertFails(getDoc(ref(out)));await assertFails(getDoc(ref(staff)));await assertFails(updateDoc(ref(own),{status:'paid'}));await assertFails(updateDoc(ref(operator),{status:'paid'}));}
 await assertFails(getDoc(doc(own,'commercialAudit','test')));await assertSucceeds(getDoc(doc(operator,'commercialAudit','test')));await assertFails(updateDoc(doc(operator,'commercialAudit','test'),{kind:'modified'}));
 await assertFails(setDoc(p(own,'queues','new-department'),initialQueue('New department','NEW',day,now)));await assertSucceeds(updateDoc(p(own,'queues',department),{updatedAt:now+100}));await assertSucceeds(getDoc(archive(own)));
});
