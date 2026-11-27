import {doc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {db} from './firebase.js';
/** Reserve a single permanent resource slot in the same transaction as its creation.
 * Missing record supports existing unmanaged workspaces. Rules reject managed accounts
 * without a provisioned capacity record; the browser cannot create or reset counters.
 */
export async function reserveCapacity(tx,hid,kind,id){
 if(!['departments','doctors','staff'].includes(kind))throw Error('Invalid capacity resource.');
 const ref=doc(db,'hospitals',hid,'capacity','managed'),snap=await tx.get(ref);
 if(!snap.exists())return;
 const data=snap.data(),used=data[kind],max=data.limits?.[kind];
 if(!Number.isSafeInteger(used)||!Number.isSafeInteger(max)||used<0||max<0)throw Error('Plan capacity is not configured. Contact TurnAhead.');
 if(used>=max)throw Error('Your plan limit for '+kind+' has been reached. Request an upgrade in Subscription.');
 tx.update(ref,{[kind]:used+1,lastKind:kind,lastId:id,updatedAt:serverTimestamp()});
}
