import {commercialEnabled,subscriptionDisplayEnabled,customerPortalEnabled} from './commercial-config.js';
import {doc,collection,getDocFromServer,getDocsFromServer,setDoc,serverTimestamp,Timestamp,onSnapshot,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {db,auth} from './firebase.js';
import {PLANS,quote} from './subscription-model.js';
const endpoint='https://tcc-production.turnahead.workers.dev/api/customer/';
const pending=new Map();
async function customerCall(hid,action,body){
 if(!/^[a-f0-9]{20}$/.test(hid)||!auth?.currentUser?.emailVerified)throw Error('Verified administrator sign-in required.');
 const u=auth.currentUser,token=await u.getIdToken();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(endpoint+hid+'/'+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:controller.signal});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Customer records unavailable.');
  if(auth.currentUser?.uid!==u.uid)throw Error('Session changed.');
  return data;
 }finally{clearTimeout(timer);}
}
const dateKeys=['issuedAt','paidAt','dueAt','verifiedAt','createdAt','resolvedAt','acceptedAt'];
const dated=x=>({...x,...Object.fromEntries(dateKeys.filter(k=>Number.isFinite(x[k])).map(k=>[k,Timestamp.fromMillis(x[k])]))});
function customerBundle(hid){
 const key=auth?.currentUser?.uid+'|'+hid;
 if(!pending.has(key)){const task=customerCall(hid,'records').then(data=>({invoices:data.invoices.map(dated),requests:data.requests.map(dated),payments:{...data.payments,items:data.payments.items.map(dated)},notices:{...data.notices,items:data.notices.items.map(dated)},partial:data.partial})).finally(()=>pending.delete(key));pending.set(key,task);}
 return pending.get(key);
}
function requireCommercial(){if(!commercialEnabled)throw Error('Commercial activation is not yet available.');}
function verifiedUser(){requireCommercial();const u=auth?.currentUser;if(!u?.emailVerified)throw Error('Sign in with a verified email first.');return u;}
const leadRef=uid=>doc(db,'commercialLeads',uid);
export async function readLead(){const u=verifiedUser();const s=await getDocFromServer(leadRef(u.uid));return s.exists()?s.data():null;}
export async function submitLead({organization,representative,phone,plan,cycle}){
 const u=verifiedUser();quote(plan,cycle);
 if(!/^[+0-9 ().-]{5,30}$/.test(phone.trim()))throw Error('Enter a valid business contact number.');
 await setDoc(leadRef(u.uid),{uid:u.uid,email:u.email.toLowerCase(),organization:organization.trim(),representative:representative.trim(),phone:phone.trim(),plan,cycle,status:'pending',createdAt:serverTimestamp()});
}
export function watchSubscription(hid,next,error){
 if(!commercialEnabled&&!subscriptionDisplayEnabled){const t=setTimeout(()=>next(null),0);return ()=>clearTimeout(t);}
 return onSnapshot(doc(db,'commercialAccounts',hid),{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache)next(s.exists()?s.data():null);},error);
}
export async function billingHistory(hid){
 if(customerPortalEnabled)return (await customerBundle(hid)).invoices;
 requireCommercial();
 const snaps=await getDocsFromServer(query(collection(db,'commercialAccounts',hid,'invoices'),orderBy('issuedAt','desc'),limit(100)));
 return snaps.docs.map(s=>({id:s.id,...s.data()}));
}
export async function requestChange(hid,kind,plan,cycle,message){
 if(customerPortalEnabled){await customerCall(hid,'requests',{kind,plan,cycle,message:message.trim()});return;}
 const u=verifiedUser();quote(plan,cycle);
 if(!['upgrade','downgrade','renew','billing-cycle','support','cancel','export'].includes(kind))throw Error('Invalid request.');
 await setDoc(doc(db,'commercialAccounts',hid,'requests',kind),{uid:u.uid,kind,plan,cycle,message:message.trim(),status:'pending',createdAt:serverTimestamp()});
}
export async function readChanges(hid){
 if(customerPortalEnabled)return (await customerBundle(hid)).requests;
 requireCommercial();
 const [pending,history]=await Promise.all([getDocsFromServer(collection(db,'commercialAccounts',hid,'requests')),getDocsFromServer(query(collection(db,'commercialAccounts',hid,'requestHistory'),orderBy('resolvedAt','desc'),limit(100)))]);
 return [...pending.docs,...history.docs].map(s=>({id:s.id,...s.data()}));
}
export async function commercialRecords(hid){
 if(customerPortalEnabled){const {payments,notices,partial}=await customerBundle(hid);return {payments,notices,partial};}
 requireCommercial();
 const read=async(name,field)=>{const snaps=await getDocsFromServer(query(collection(db,'commercialAccounts',hid,name),orderBy(field,'desc'),limit(101)));return {items:snaps.docs.slice(0,100).map(s=>({id:s.id,...s.data()})),more:snaps.size>100};};
 const [payments,notices]=await Promise.all([read('payments','verifiedAt'),read('notices','createdAt')]);return {payments,notices};
}
