/**
 * Operator-run only, using local Application Default Credentials (ADC).
 * Dry run by default. Never run this against real data without an approved
 * retention policy, backup and explicit confirmation. No secrets in this file.
 */
import {parseArgs} from 'node:util';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore,FieldPath} from 'firebase-admin/firestore';
import {cutoffFor,eligibleForRetention,linkedToControl} from './retention-policy.mjs';
const {values:v}=parseArgs({options:{project:{type:'string'},hospital:{type:'string'},days:{type:'string'},limit:{type:'string',default:'100'},apply:{type:'boolean',default:false},confirm:{type:'string'},'backup-confirmed':{type:'boolean',default:false}}});
if(!v.project||!/^([a-z][a-z0-9-]{4,28}[a-z0-9])$/.test(v.project)||!v.hospital||!(/^[A-Za-z0-9]{20}$/).test(v.hospital)||!v.days)throw Error('Specify --project PROJECT --hospital HOSPITAL_ID --days APPROVED_DAYS.');
if(process.env.FIRESTORE_EMULATOR_HOST&&!v.project.startsWith('demo-'))throw Error('Use a demo-* project with the emulator.');
const cutoff=cutoffFor(Number(v.days)),limit=Number(v.limit);
if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Limit must be 1–500.');
if(v.apply&&(!v['backup-confirmed']||v.confirm!==v.project+'/'+v.hospital))throw Error('Apply requires --backup-confirmed and --confirm PROJECT/HOSPITAL_ID after reviewing the dry run.');
const app=initializeApp({credential:applicationDefault(),projectId:v.project});
const db=getFirestore(app),root=db.collection('hospitals').doc(v.hospital);
if(!(await root.get()).exists)throw Error('Hospital does not exist.');
const totals={scanned:0,eligible:0,deleted:0,skipped:0};let cursor=null;
while(totals.scanned<limit){
 let q=root.collection('tickets').where('createdAt','<',cutoff).orderBy('createdAt').orderBy(FieldPath.documentId()).limit(Math.min(50,limit-totals.scanned));
 if(cursor)q=q.startAfter(cursor);
 const page=await q.get();if(page.empty)break;
 for(const d of page.docs){
  totals.scanned++;
  const inspect=async reader=>{
   const t=await reader(d.ref);if(!t.exists)return null;const data=t.data();
   if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data.dayKey||'')||!(/^[A-Za-z0-9_-]{3,64}$/).test(data.queueId||''))return null;
   const archive=root.collection('history').doc(data.dayKey).collection('departments').doc(data.originQueueId||data.queueId).collection('records').doc(d.id);
   const control=root.collection('controls').doc(data.queueId);
   const queue=root.collection('queues').doc(data.queueId);
   const feedback=root.collection('feedback').doc(d.id);
   const [a,c,q,f]=await Promise.all([reader(archive),reader(control),reader(queue),reader(feedback)]);
   if(!q.exists||q.data().dayKey<=data.dayKey||!eligibleForRetention(data,a.data(),cutoff)||a.data()?.ticketId!==d.id||linkedToControl(c.data(),d.id))return null;
   // Retain records if a linked response was submitted recently.
   if(f.exists&&(!(f.data().createdAt?.toMillis?.()<cutoff)))return null;
   return [d.ref,archive,...(f.exists?[feedback]:[])];
  };
  if(v.apply){
   const deleted=await db.runTransaction(async tx=>{const refs=await inspect(ref=>tx.get(ref));if(!refs)return false;for(const ref of refs)tx.delete(ref);return true;});
   if(deleted){totals.eligible++;totals.deleted++;}else totals.skipped++;
  }else{if(await inspect(ref=>ref.get()))totals.eligible++;else totals.skipped++;}
 }
 cursor=page.docs.at(-1);if(page.size<50)break;
}
console.log(JSON.stringify({mode:v.apply?'APPLIED':'DRY RUN',cutoff:new Date(cutoff).toISOString(),...totals,limit},null,2));
// No names, ticket identifiers, or feedback comments are written to logs.
