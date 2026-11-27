// Capacity reservations are committed in the SAME Firestore transaction as the
// new resource. The security rules are authoritative; this helper provides
// understandable errors and handles contention via Firestore transaction retries.
import {doc} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {db} from './firebase.js';
export async function reserveCommercialSlot(tx,hid,kind,target){
 const policyRef=doc(db,'hospitals',hid,'commercialPolicy','current');
 const policy=await tx.get(policyRef);
 if(!policy.exists())return; // Existing unmanaged organizations are unchanged.
 const p=policy.data(),usageRef=doc(db,'hospitals',hid,'commercialUsage',kind),usage=await tx.get(usageRef);
 if(!p.expansionAllowed||!p.validUntil||p.validUntil.toMillis()<=Date.now())throw Error('New allocations are unavailable under the current subscription. Contact your administrator. Existing services remain available.');
 const count=usage.data()?.count,cap=p.limits?.[kind];
 if(!usage.exists()||!Number.isSafeInteger(count)||count<0||(cap!==null&&(!Number.isSafeInteger(cap)||cap<0)))throw Error('Commercial capacity is not configured. Contact your administrator.');
 if(cap!==null&&count>=cap)throw Error('Your allocated '+kind+' limit has been reached. Contact your administrator.');
 tx.update(usageRef,{count:count+1,lastId:target});
}
