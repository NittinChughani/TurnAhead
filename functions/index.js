/** Optional trusted push backend. Requires Firebase Blaze billing and deployment.
 * No push tokens are readable or writable from Firestore client rules.
 * Ticket URLs are bearer secrets; tighten onboarding with App Check and abuse limits
 * before using this endpoint in production.
 */
import {createHash} from 'node:crypto';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onDocumentUpdated} from 'firebase-functions/v2/firestore';
if(!getApps().length)initializeApp();
const db=getFirestore();
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9]{20}$/.test(s);
const hashToken=s=>createHash('sha256').update(s).digest('hex');

export const registerTurnAlert=onCall({region:'us-central1',maxInstances:5,memory:'256MiB',enforceAppCheck:true},async request=>{
  const {hospitalId,ticketId,token}=request.data||{};
  if(!validId(hospitalId)||!validId(ticketId)||typeof token!=='string'||token.length<60||token.length>4096)
    throw new HttpsError('invalid-argument','Invalid ticket or device.');
  const ticketRef=db.doc(`hospitals/${hospitalId}/tickets/${ticketId}`);
  const ticket=await ticketRef.get();
  if(!ticket.exists||ticket.data().status!=='waiting'||ticket.data().dayKey!==new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
    throw new HttpsError('failed-precondition','Only active waiting tickets can subscribe.');
  const hashed=hashToken(token),collection=ticketRef.collection('pushSubscriptions'),ref=collection.doc(hashed);
  const already=await ref.get();
  if(!already.exists){const current=await collection.limit(12).get();if(current.docs.filter(d=>d.data().expiresAt?.toMillis()>Date.now()).length>=10)
    throw new HttpsError('resource-exhausted','The maximum number of devices is already registered for this ticket.');}
  // One subscription per FCM token per ticket, capped per ticket and short-lived.
  await ref.set({token,createdAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now()+30*60*60*1000)}, {merge:true});
  return {ok:true};
});

export const deliverCalledTurnAlert=onDocumentUpdated({document:'hospitals/{hospitalId}/tickets/{ticketId}',region:'us-central1',maxInstances:5},async event=>{
  const before=event.data?.before?.data(),after=event.data?.after?.data();
  if(!before||!after||before.status==='called'||after.status!=='called')return;
  const {hospitalId,ticketId}=event.params;
  const coll=db.doc(`hospitals/${hospitalId}/tickets/${ticketId}`).collection('pushSubscriptions');
  const snap=await coll.get();
  const targets=snap.docs.filter(d=>d.data().expiresAt?.toMillis()>Date.now()).slice(0,100);
  if(!targets.length)return;
  const code=String(after.code||'');
  if(!/^[A-Z]{3}-\d{3,6}$/.test(code))return;
  // Use data-only payload so the service worker can decide what to display.
  const result=await getMessaging().sendEachForMulticast({
    tokens:targets.map(d=>d.data().token),
    data:{kind:'turn-called',code,hospital:hospitalId,ticket:ticketId},
    webpush:{headers:{Urgency:'high',TTL:'900'}}
  });
  // Remove invalid registrations; keep valid tokens until expiry so failures can be diagnosed.
  await Promise.all(result.responses.map((r,i)=>{
    if(r.success)return Promise.resolve();
    return /registration-token-not-registered|invalid-registration-token/.test(r.error?.code||'')?targets[i].ref.delete():Promise.resolve();
  }));
});
