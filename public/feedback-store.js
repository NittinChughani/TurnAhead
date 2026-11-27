import {collection,query,where,orderBy,limit,startAfter,getDocsFromServer,onSnapshot} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {db} from './firebase.js';
import {dayKey} from './queue-engine.js?v=2.6.2';
import {feedbackBounds,monthBounds} from './feedback-dates.js';
const root=hid=>collection(db,'hospitals',hid,'feedback');
const size=50;
const page=s=>({records:s.docs.map(d=>({id:d.id,...d.data()})),cursor:s.docs.at(-1)||null,more:s.size===size});
const within=(hid,start,end,cursor)=>query(root(hid),where('createdAt','>=',start),where('createdAt','<',end),orderBy('createdAt','desc'),...(cursor?[startAfter(cursor)]:[]),limit(size));
export function watchTodayFeedback(hid,day,next,error){const {start,end}=feedbackBounds(day);return onSnapshot(within(hid,start,end,null),{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache)next(page(s));},error);}
export async function readFeedbackPage(hid,day,month,cursor=null){
 const today=feedbackBounds(day),bounds=month?monthBounds(month):today;
 const end=month?new Date(Math.min(+bounds.end,+today.start)):bounds.end;
 if(+end<=+bounds.start)return {records:[],cursor:null,more:false};
 return page(await getDocsFromServer(within(hid,bounds.start,end,cursor)));
}
// One read per nonempty month. Skip empty years/months rather than scanning comments.
export async function discoverFeedbackMonths(hid,before,count=8){
 let boundary=before,months=[];for(let i=0;i<count;i++){
  const s=await getDocsFromServer(query(root(hid),where('createdAt','<',boundary),orderBy('createdAt','desc'),limit(1)));
  if(s.empty)return {months,before:boundary,more:false};
  const date=s.docs[0].data().createdAt?.toDate?.();if(!date)throw Error('Invalid feedback timestamp');
  const month=dayKey(date).slice(0,7);const next=monthBounds(month).start;if(+next>=+boundary)throw Error('Invalid month boundary');
  months.push(month);boundary=next;
 }return {months,before:boundary,more:true};
}
