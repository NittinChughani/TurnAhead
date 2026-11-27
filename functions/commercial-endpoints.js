import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {createCommercialService} from './commercial-service.js';
if(!getApps().length)initializeApp();
const service=createCommercialService(getFirestore(),getAuth());
const options={region:'us-central1',maxInstances:3,memory:'256MiB',timeoutSeconds:120};
function translate(e){return new HttpsError(e.message==='Access denied'?'permission-denied':'failed-precondition',e.message==='Access denied'?'Access denied':'Commercial operation could not be completed. Review the inputs and account state.');}
export const commercialOperator=onCall({...options,enforceAppCheck:true},async req=>{
 const action=req.data?.action;
 if(!['issue','verifyPayment','activate','resolveRequest','cancel'].includes(action))throw new HttpsError('invalid-argument','Unknown operation');
 try{return await service[action](req.auth,req.data);}catch(e){throw translate(e);}
});
// Owner identity is checked against live membership and subscription on the server.
export const commercialAnalytics=onCall(options,async req=>{
 try{return await service.analytics(req.auth,req.data||{});}catch(e){throw translate(e);}
});
// Optional scheduler: no email/payment integrations. Do not deploy before cost review.
// Bounded cursor traversal; large installations must use a paged job with durable cursor.
export const commercialRenewalSweep=onSchedule({region:'us-central1',schedule:'every day 08:00',timeZone:'Asia/Karachi',timeoutSeconds:540,maxInstances:1},async()=>{
 let cursor=null;for(let i=0;i<20;i++){const r=await service.reminders(Date.now(),cursor);cursor=r.cursor;if(!cursor)return;}throw Error('Renewal sweep exceeded 2,000 account scan; partition the job before production.');
});
