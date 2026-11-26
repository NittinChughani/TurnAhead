import {collection,query,where,orderBy,limit,startAfter,getDocsFromServer} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {db} from './firebase.js';
import {dayKey} from './queue-engine.js';
import {reportDates} from './analytics-engine.js?v=3.1.0';
// Explicit bounded reports. No silent truncation, no patient names in retained analytics data.
export async function loadAnalytics(hid,end,days,progress=()=>{},cancelled=()=>false){
 const dates=reportDates(end,days);
 if(end>dayKey())throw Error('Choose today or an earlier report date.');
 let count=0,requests=0;
 const fetchPage=async q=>{if(cancelled())throw Error('Report cancelled.');if(++requests>500)throw Error('Report exceeds the query limit. Choose a shorter period.');return getDocsFromServer(q);};
 const read=async (coll,clauses,project)=>{
  const out=[];let cursor=null;
  do{
   const snap=await fetchPage(query(coll,...clauses,...(cursor?[startAfter(cursor)]:[]),limit(100)));
   for(const d of snap.docs){if(++count>10000)throw Error('Report exceeds 10,000 records. Choose a shorter period.');out.push(project(d.data()));}
   cursor=snap.size===100?snap.docs.at(-1):null;
  }while(cursor);
  return out;
 };
 const root=['hospitals',hid];
 const depts=await fetchPage(query(collection(db,...root,'queues')));
 const dayDocs=await fetchPage(query(collection(db,...root,'history'),where('dayKey','>=',dates[0]),where('dayKey','<=',end),orderBy('dayKey')));
 const records=[];
 for(const d of dayDocs.docs){
  if(cancelled())throw Error('Report cancelled.');
  for(const dept of depts.docs){
   if(cancelled())throw Error('Report cancelled.');
   const items=await read(collection(db,...root,'history',d.id,'departments',dept.id,'records'),[orderBy('issuedAt')],t=>({dayKey:t.dayKey,queueId:t.serviceQueueId||t.queueId,queueName:t.serviceQueueName||t.queueName,doctorId:t.doctorId,doctorName:t.doctorName,status:t.status,recallCount:t.recallCount,issuedAt:t.issuedAt,calledAt:t.calledAt,finishedAt:t.finishedAt}));
   records.push(...items);
  }
  progress('Loaded '+d.id+' · '+records.length+' tickets');
 }
 const from=new Date(dates[0]+'T00:00:00+05:00'),until=new Date(+new Date(end+'T00:00:00+05:00')+86400000);
 const feedback=await read(collection(db,...root,'feedback'),[where('createdAt','>=',from),where('createdAt','<',until),orderBy('createdAt')],f=>({rating:f.rating,day:dayKey(f.createdAt.toDate())}));
 if(cancelled())throw Error('Report cancelled.');
 return {dates,records,feedback};
}
