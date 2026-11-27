import {doc,collection,getDocFromServer,getDocsFromServer,setDoc,serverTimestamp,onSnapshot,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {db,auth} from './firebase.js';
import {PLANS,quote} from './subscription-model.js';
function verifiedUser(){const u=auth?.currentUser;if(!u?.emailVerified)throw Error('Sign in with a verified email first.');return u;}
const leadRef=uid=>doc(db,'commercialLeads',uid);
export async function readLead(){const u=verifiedUser();const s=await getDocFromServer(leadRef(u.uid));return s.exists()?s.data():null;}
export async function submitLead({organization,representative,phone,plan,cycle}){
 const u=verifiedUser();quote(plan,cycle);
 if(!/^[+0-9 ().-]{5,30}$/.test(phone.trim()))throw Error('Enter a valid business contact number.');
 await setDoc(leadRef(u.uid),{uid:u.uid,email:u.email.toLowerCase(),organization:organization.trim(),representative:representative.trim(),phone:phone.trim(),plan,cycle,status:'pending',createdAt:serverTimestamp()});
}
export function watchSubscription(hid,next,error){
 return onSnapshot(doc(db,'commercialAccounts',hid),{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache)next(s.exists()?s.data():null);},error);
}
export async function billingHistory(hid){
 const snaps=await getDocsFromServer(query(collection(db,'commercialAccounts',hid,'invoices'),orderBy('issuedAt','desc'),limit(100)));
 return snaps.docs.map(s=>({id:s.id,...s.data()}));
}
export async function requestChange(hid,kind,plan,cycle,message){
 const u=verifiedUser();quote(plan,cycle);
 if(!['upgrade','downgrade','renew','billing-cycle','support','cancel','export'].includes(kind))throw Error('Invalid request.');
 await setDoc(doc(db,'commercialAccounts',hid,'requests',kind),{uid:u.uid,kind,plan,cycle,message:message.trim(),status:'pending',createdAt:serverTimestamp()});
}
export async function readChanges(hid){
 const [pending,history]=await Promise.all([getDocsFromServer(collection(db,'commercialAccounts',hid,'requests')),getDocsFromServer(query(collection(db,'commercialAccounts',hid,'requestHistory'),orderBy('resolvedAt','desc'),limit(100)))]);
 return [...pending.docs,...history.docs].map(s=>({id:s.id,...s.data()}));
}
export async function commercialRecords(hid){
 const read=async(name,field)=>{const snaps=await getDocsFromServer(query(collection(db,'commercialAccounts',hid,name),orderBy(field,'desc'),limit(101)));return {items:snaps.docs.slice(0,100).map(s=>({id:s.id,...s.data()})),more:snaps.size>100};};
 const [payments,notices]=await Promise.all([read('payments','verifiedAt'),read('notices','createdAt')]);return {payments,notices};
}
