/** Trusted server only. No service credentials, payment credentials or patient data in commercial records. */
import {Timestamp} from 'firebase-admin/firestore';
import {PLANS,quote,hasAdvancedAnalytics,reminderStage} from './commercial-policy.js';
import {buildAnalytics,reportDates} from './commercial-analytics-engine.js';
const DAY=86400000;
const ident=(v,name='ID')=>{if(typeof v!=='string'||! /^[A-Za-z0-9]{20}$/.test(v))throw Error('Invalid '+name);return v;};
const uidValue=v=>{if(typeof v!=='string'||!v.length||v.length>128||v.includes('/'))throw Error('Invalid user ID');return v;};
const clean=(v,min,max,name)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max||/[\x00-\x1f\x7f]/.test(v))throw Error('Invalid '+name);return v.trim();};
const integer=(v,min,max,name)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('Invalid '+name);return v;};
const exists=s=>s.exists?s.data():null;
const millis=t=>t?.toMillis?.()??0;
const now=()=>Timestamp.now();
const stamp=n=>Timestamp.fromMillis(n);
const kinds=['renew','upgrade','downgrade','billing-cycle','support','cancel','export'];
export function commercialTerms(plan,cycle,custom={}){
 const q=quote(plan,cycle),p=PLANS[plan];
 if(plan==='enterprise'){
  return {plan,cycle,recurringAmount:integer(custom.recurringAmount,1,100000000,'recurring amount'),setupAmount:integer(custom.setupAmount,0,100000000,'setup amount'),limits:Object.fromEntries(['departments','doctors','staff'].map(k=>[k,integer(custom.limits?.[k],1,10000,k)]))};
 }
 return {plan,cycle,recurringAmount:q.recurring,setupAmount:q.setup,limits:{departments:p.departments,doctors:p.doctors,staff:p.staff}};
}
export function periodEnd(start,cycle){
 if(!['annual','monthly'].includes(cycle)||!Number.isFinite(start))throw Error('Invalid period');
 // Calendar month in PKT, clamp end-of-month without rolling into the next month.
 const d=new Date(start+5*3600000),day=d.getUTCDate();d.setUTCDate(1);
 d.setUTCMonth(d.getUTCMonth()+(cycle==='annual'?12:1));
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 d.setUTCDate(Math.min(day,last));return +d-5*3600000;
}
export function createCommercialService(db,auth){
 const account=h=>db.doc('commercialAccounts/'+h),hospital=h=>db.doc('hospitals/'+h),order=id=>db.doc('commercialOrders/'+id),lead=uid=>db.doc('commercialLeads/'+uid),member=(h,u)=>db.doc('memberships/'+h+'_'+u),cap=h=>hospital(h).collection('capacity').doc('managed'),lock=h=>db.doc('commercialMigrationLocks/'+h);
 const slot=h=>db.doc('commercialOrderSlots/'+h);
 const invoice=(h,id)=>account(h).collection('invoices').doc(id);
 function audit(tx,actor,kind,h,id){tx.create(db.collection('commercialAudit').doc(),{actorUid:actor,kind,hospitalId:h,reference:id,createdAt:now()});}
 async function operator(identity){const uid=uidValue(identity?.uid);if(identity.token?.email_verified!==true||identity.token?.turnaheadPlatformOperator!==true)throw Error('Access denied');const u=await auth.getUser(uid);if(u.disabled||!u.emailVerified||u.customClaims?.turnaheadPlatformOperator!==true)throw Error('Access denied');return uid;}
 async function owner(identity,h){const uid=uidValue(identity?.uid);if(identity.token?.email_verified!==true)throw Error('Access denied');const [hs,ms]=await Promise.all([hospital(h).get(),member(h,uid).get()]);const a=hs.data(),m=ms.data();if(!a||a.ownerUid!==uid||a.status!=='active'||!m?.active||m.role!=='owner'||m.uid!==uid||m.hospitalId!==h)throw Error('Access denied');return uid;}
 async function issue(identity,input){
  const actor=await operator(identity),id=ident(input.orderId,'order ID'),h=ident(input.hospitalId,'hospital ID'),kind=input.kind;
  if(!['initial','renew','change'].includes(kind))throw Error('Invalid order kind');
  const terms=commercialTerms(input.plan,input.cycle,input.custom),billTo=clean(input.billTo,3,70,'organization name');
  const issuer=clean(input.issuer,2,120,'invoice issuer'),taxId=clean(input.taxId??'Not provided',2,60,'tax identifier');
  const discount=integer(input.discount??0,0,100000000,'discount'),tax=integer(input.tax??0,0,100000000,'tax');
  const base=terms.recurringAmount+(kind==='initial'?terms.setupAmount:0);
  if(discount>=base)throw Error('Discount must be less than subtotal');
  const total=base-discount+tax;
  const ownerUid=uidValue(input.ownerUid),u=await auth.getUser(ownerUid);
  if(u.disabled||!u.emailVerified||!u.email)throw Error('Organization owner must have a verified account');
  return db.runTransaction(async tx=>{
   const [os,hs,as,ls,ms,ss]=await Promise.all([tx.get(order(id)),tx.get(hospital(h)),tx.get(account(h)),tx.get(lead(ownerUid)),tx.get(member(h,ownerUid)),tx.get(slot(h))]);
   if(os.exists||ss.exists)throw Error('An outstanding order already exists');
   const a=exists(as),hr=exists(hs),m=exists(ms),l=exists(ls);
   if(hr){if(hr.ownerUid!==ownerUid||hr.status!=='active'||m?.role!=='owner'||m.active!==true)throw Error('Hospital owner mismatch');}
   else if(kind!=='initial'||a||!l||l.status!=='pending'||l.uid!==ownerUid||l.email!==u.email.toLowerCase()||m)throw Error('Verified pending lead required for new organization');
   if(kind==='initial'&&a)throw Error('Account already managed');
   if(kind!=='initial'&&(!a||a.status!=='active'))throw Error('Active managed account required');
   if(kind==='renew'&&(a.plan!==terms.plan||a.cycle!==terms.cycle||a.recurringAmount!==terms.recurringAmount||JSON.stringify(a.limits,Object.keys(a.limits||{}).sort())!==JSON.stringify(terms.limits,Object.keys(terms.limits).sort())))throw Error('Renewal must match current plan and contracted terms');
   if(kind==='change'&&millis(a.expiresAt)>Date.now())throw Error('Plan changes are applied at or after the current period end; no automatic proration');
   const issuedAt=now(),number='TA-'+id,setup=kind==='initial'?terms.setupAmount:0;
   const record={number,billTo,issuer,taxId,description:PLANS[terms.plan].name+' / '+terms.cycle,setup,recurring:terms.recurringAmount,discount,tax,total,currency:'PKR',status:'issued',issuedAt};
   tx.create(order(id),{hospitalId:h,ownerUid,kind,terms,billTo,status:'issued',total,expectedRevision:a?.revision??0,createdAt:issuedAt});
   tx.create(slot(h),{orderId:id,createdAt:issuedAt});tx.create(invoice(h,id),record);audit(tx,actor,'invoice-issued',h,id);return {orderId:id,number,total};
  });
 }
 async function verifyPayment(identity,input){
  const actor=await operator(identity),id=ident(input.orderId,'order ID');
  const reference=clean(input.reference,3,100,'non-sensitive payment reference'),amount=integer(input.amount,1,300000000,'paid amount');
  return db.runTransaction(async tx=>{
   const os=await tx.get(order(id)),o=exists(os);if(!o||o.status!=='issued'||o.total!==amount)throw Error('Payment does not match an unpaid order');
   const ir=invoice(o.hospitalId,id),inv=exists(await tx.get(ir));if(!inv||inv.status!=='issued'||inv.total!==amount)throw Error('Invoice mismatch');
   const verifiedAt=now();tx.update(order(id),{status:'paid',verifiedAt,paymentReference:reference,verifiedBy:actor});tx.update(ir,{status:'paid',paidAt:verifiedAt});
   tx.create(account(o.hospitalId).collection('payments').doc(id),{invoiceNumber:inv.number,amount,currency:'PKR',status:'verified',verifiedAt});audit(tx,actor,'payment-verified',o.hospitalId,id);return {orderId:id,status:'paid'};
  });
 }
 async function activate(identity,input){
  const actor=await operator(identity),id=ident(input.orderId,'order ID'),initial=exists(await order(id).get());
  if(!initial||initial.status!=='paid')throw Error('A verified paid order is required');
  const h=ident(initial.hospitalId),u=await auth.getUser(uidValue(initial.ownerUid));if(u.disabled||!u.emailVerified||!u.email)throw Error('Verified owner required');
  // Pause expansion only, never clinical service. Release the lock even when validation fails.
  await lock(h).create({orderId:id,actorUid:actor,createdAt:now()});
  try{
   return await db.runTransaction(async tx=>{
    const [os,hs,as,cs,ls,ms,lsLock,invS,qs,ds,staff]=await Promise.all([tx.get(order(id)),tx.get(hospital(h)),tx.get(account(h)),tx.get(cap(h)),tx.get(lead(u.uid)),tx.get(member(h,u.uid)),tx.get(lock(h)),tx.get(invoice(h,id)),tx.get(hospital(h).collection('queues').limit(10001)),tx.get(hospital(h).collection('doctors').limit(10001)),tx.get(db.collection('memberships').where('hospitalId','==',h).limit(10002))]);
    const o=exists(os),hr=exists(hs),a=exists(as),l=exists(ls),m=exists(ms),iv=exists(invS);
    if(!o||o.status!=='paid'||o.ownerUid!==u.uid||iv?.status!=='paid'||iv.total!==o.total||o.expectedRevision!==(a?.revision??0)||lsLock.data()?.orderId!==id)throw Error('Order or account changed; manual reconciliation required');
    if(hr&&(hr.ownerUid!==u.uid||hr.status!=='active'||m?.role!=='owner'||m.active!==true))throw Error('Owner mismatch');
    if(!hr&&(o.kind!=='initial'||a||l?.status!=='pending'||l.uid!==u.uid||l.email!==u.email.toLowerCase()||m||qs.size||ds.size||staff.size))throw Error('New workspace is not eligible');
    if(o.kind==='initial'&&a||o.kind!=='initial'&&a?.status!=='active')throw Error('Account changed');
    const t=o.terms,at=Date.now(),start=o.kind==='renew'?Math.max(at,millis(a.expiresAt)):at;
    if(o.kind==='change'&&millis(a.expiresAt)>at)throw Error('Current period has not ended');
    const counts={departments:qs.size,doctors:ds.size,staff:staff.docs.filter(d=>d.data().role!=='owner').length};
    if(qs.size>10000||ds.size>10000||staff.size>10001||Object.keys(counts).some(k=>counts[k]>t.limits[k]))throw Error('Existing usage exceeds package capacity; agree a suitable plan before activation');
    if(!hr){
     const createdAt=now();tx.create(hospital(h),{name:o.billTo,ownerUid:u.uid,status:'active',createdAt,updatedAt:createdAt});
     tx.create(hospital(h).collection('meta').doc('sequence'),{nextPrefix:1});
     tx.create(member(h,u.uid),{uid:u.uid,hospitalId:h,email:u.email.toLowerCase(),role:'owner',active:true,displayName:clean(l.representative,2,80,'representative').slice(0,70),gender:'unspecified',invitedBy:actor,createdAt,updatedAt:createdAt});
     tx.update(lead(u.uid),{status:'approved',hospitalId:h,resolvedAt:createdAt});
    }
    const expiry=periodEnd(start,t.cycle);
    tx.set(account(h),{plan:t.plan,cycle:t.cycle,status:'active',recurringAmount:t.recurringAmount,limits:t.limits,activatedAt:a?.activatedAt||stamp(at),expiresAt:stamp(expiry),revision:(a?.revision??0)+1,updatedAt:now()});
    tx.set(cap(h),{...counts,limits:t.limits,lastKind:'',lastId:'',updatedAt:now()});
    tx.update(order(id),{status:'activated',activatedAt:now()});tx.delete(slot(h));audit(tx,actor,'subscription-activated',h,id);
    return {hospitalId:h,expiresAt:expiry,counts};
   });
  }finally{
   await db.runTransaction(async tx=>{const s=await tx.get(lock(h));if(s.data()?.orderId===id)tx.delete(lock(h));});
  }
 }
 async function voidOrder(identity,input){
  const actor=await operator(identity),id=ident(input.orderId,'order ID');
  return db.runTransaction(async tx=>{const o=exists(await tx.get(order(id)));if(!o||o.status!=='issued')throw Error('Only an unpaid order may be voided');const ir=invoice(o.hospitalId,id),iv=exists(await tx.get(ir)),ss=exists(await tx.get(slot(o.hospitalId)));if(iv?.status!=='issued'||ss?.orderId!==id)throw Error('Order mismatch');tx.update(ir,{status:'void',voidedAt:now()});tx.update(order(id),{status:'void',voidedAt:now()});tx.delete(slot(o.hospitalId));audit(tx,actor,'invoice-voided',o.hospitalId,id);return {status:'void'};});
 }
 async function resolveRequest(identity,input){
  const actor=await operator(identity),h=ident(input.hospitalId),kind=input.kind;
  if(!kinds.includes(kind)||!['resolved','declined'].includes(input.status))throw Error('Invalid request resolution');
  const note=clean(input.note,2,500,'resolution note'),ref=account(h).collection('requests').doc(kind);
  return db.runTransaction(async tx=>{
   const s=await tx.get(ref);if(!s.exists||s.data().status!=='pending')throw Error('No pending request');
   const archived=account(h).collection('requestHistory').doc();
   tx.create(archived,{...s.data(),status:input.status,resolution:note,resolvedAt:now()});tx.delete(ref);audit(tx,actor,'request-'+input.status,h,archived.id);
   return {status:input.status};
  });
 }
 async function cancel(identity,input){
  const actor=await operator(identity),h=ident(input.hospitalId),reason=clean(input.reason,3,500,'cancellation reason');
  return db.runTransaction(async tx=>{const [as,ss]=await Promise.all([tx.get(account(h)),tx.get(slot(h))]);const a=exists(as);if(ss.exists||!a||a.status==='cancelled')throw Error('No cancellable account');tx.update(account(h),{status:'cancelled',revision:(a.revision??0)+1,cancelledAt:now(),cancellationReason:reason,updatedAt:now()});audit(tx,actor,'subscription-cancelled',h,h);return {status:'cancelled'};});
 }
 async function analytics(identity,input){
  const h=ident(input.hospitalId);await owner(identity,h);
  const a=exists(await account(h).get());if(!hasAdvancedAnalytics(a))throw Error('Advanced analytics requires an eligible managed subscription');
  const dates=reportDates(input.end,input.days),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(input.end>today)throw Error('Choose today or an earlier date');
  const root=hospital(h),records=[],feedback=[];let reads=0;
  const fetch=async q=>{if(++reads>500)throw Error('Choose a shorter report period');return q.get();};
  const depts=await fetch(root.collection('queues').limit(501));if(depts.size>500)throw Error('Too many departments for a single report');
  const days=await fetch(root.collection('history').where('dayKey','>=',dates[0]).where('dayKey','<=',input.end).orderBy('dayKey').limit(31));
  async function scan(q,project,out){let cursor;do{const page=await fetch((cursor?q.startAfter(cursor):q).limit(100));for(const d of page.docs){if(records.length+feedback.length>=10000)throw Error('Report exceeds 10,000 records');out.push(project(d.data()));}cursor=page.size===100?page.docs.at(-1):null;}while(cursor);}
  for(const day of days.docs)for(const dept of depts.docs)await scan(day.ref.collection('departments').doc(dept.id).collection('records').orderBy('issuedAt'),t=>({dayKey:t.dayKey,queueId:t.serviceQueueId||t.queueId,queueName:t.serviceQueueName||t.queueName,doctorId:t.doctorId,doctorName:t.doctorName,status:t.status,recallCount:t.recallCount,issuedAt:t.issuedAt,calledAt:t.calledAt,finishedAt:t.finishedAt}),records);
  const from=stamp(+new Date(dates[0]+'T00:00:00+05:00')),until=stamp(+new Date(input.end+'T00:00:00+05:00')+DAY);
  await scan(root.collection('feedback').where('createdAt','>=',from).where('createdAt','<',until).orderBy('createdAt'),f=>({rating:f.rating,day:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(f.createdAt.toDate())}),feedback);
  await owner(identity,h);if(!hasAdvancedAnalytics(exists(await account(h).get())))throw Error('Subscription access changed');
  return {dates,report:buildAnalytics(records,feedback,dates)};
 }
 async function reminders(at=Date.now(),after=null){
  let q=db.collection('commercialAccounts').where('status','==','active').orderBy('__name__').limit(100);
  if(after)q=q.startAfter(after);
  const page=await q.get();let written=0;
  for(const d of page.docs){const made=await db.runTransaction(async tx=>{const fresh=await tx.get(d.ref),a=exists(fresh),stage=reminderStage(a,at);if(!stage)return false;const key=String(millis(a.expiresAt))+'-'+stage,ref=d.ref.collection('notices').doc(key),old=await tx.get(ref);if(old.exists)return false;tx.create(ref,{stage,expiresAt:a.expiresAt,createdAt:now()});return true;});if(made)written++;}
  return {written,cursor:page.size===100?page.docs.at(-1).id:null};
 }
 return {issue,verifyPayment,activate,voidOrder,resolveRequest,cancel,analytics,reminders};
}
