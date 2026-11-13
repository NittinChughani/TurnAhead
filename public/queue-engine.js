/** Pure queue calculations, consistent ticket states and time formatting. */
export const TIME_ZONE = 'Asia/Karachi';
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
/** Display codes use the first three letters, ignoring spaces and punctuation. */
export function departmentPrefix(name) {
  const letters=String(name||'').normalize('NFKD').replace(/[^A-Za-z]/g,'').toUpperCase();
  if(letters.length<3)throw Error('Department name needs at least three letters for ticket codes.');
  return letters.slice(0,3);
}
/** Kept for compatibility with the original alphabetic sequence. */
export function prefixFor(index) {
  if (!Number.isSafeInteger(index)||index<0||index>701)throw Error('Department limit reached');
  let n=index+1,result='';while(n>0){n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26);}return result;
}
export function initialQueue(name='General OPD',prefix=departmentPrefix(name),today=dayKey(),now=Date.now()) {
  return {name,prefix,dayKey:today,lastNumber:-1,waitingNumbers:[],active:null,served:0,avgMinutes:8,paused:false,createdAt:now,updatedAt:now};
}
export function initialControl(){return {pending:[],activeId:null,activeSince:null};}
export function normalizedQueue(queue,today=dayKey(),now=Date.now()){
  if(queue.dayKey===today)return {...queue};
  return {...queue,prefix:departmentPrefix(queue.name),dayKey:today,lastNumber:-1,waitingNumbers:[],active:null,served:0,avgMinutes:8,paused:false,updatedAt:now};
}
export function nextTicket(queue,ticketId,today=dayKey(),now=Date.now(),patientName=''){
  const name=String(patientName||'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>80)throw Error('Enter the patient name (2–80 characters).');
  const q=normalizedQueue(queue,today,now);
  if(q.paused)throw Error('This queue is paused. Resume it before issuing tickets.');
  const number=q.lastNumber+1;
  if(number>999999)throw Error('Daily ticket limit reached.');
  const code=`${q.prefix}-${String(number).padStart(3,'0')}`;
  return {queue:{...q,lastNumber:number,waitingNumbers:[...q.waitingNumbers,number],updatedAt:now},
    ticket:{queueId:'',queueName:q.name,code,number,dayKey:today,patientName:name,status:'waiting',attendance:'pending',createdAt:now,calledAt:null,finishedAt:null}};
}
export function nextInLine(queue,control){
  if(queue.paused)throw Error('Resume this queue before calling the next visitor.');
  if(queue.active||control.activeId)throw Error('Complete or skip the active ticket first.');
  if(!control.pending?.length||!queue.waitingNumbers?.length)throw Error('Nobody is waiting in this queue.');
  const first=control.pending[0];
  if(queue.waitingNumbers[0]!==first.number)throw Error('Queue is out of sync. Refresh reception before continuing.');
  return first;
}
export function waitingEstimate(queue,number){
  const ahead=queue.waitingNumbers.indexOf(number);
  if(ahead<0)return null;
  const count=ahead+(queue.active?1:0),avg=Math.max(3,Math.min(40,Number(queue.avgMinutes)||8));
  return {peopleAhead:count,range:[Math.max(0,Math.round(count*avg*.8)),Math.round(count*avg*1.2+avg)]};
}
/** Final ticket states trump the queue snapshot. Do not display 'your turn' on conflicting snapshots. */
export function effectiveTicketStatus(ticket,queue,today=dayKey()){
  if(!ticket)return 'missing';
  if(ticket.status==='completed'||ticket.status==='skipped')return ticket.status;
  if(ticket.dayKey!==today||(queue&&ticket.dayKey!==queue.dayKey))return 'expired';
  if(ticket.status==='called'&&queue&&queue.active?.code!==ticket.code)return 'syncing';
  if(ticket.status==='waiting'&&queue&&!queue.waitingNumbers?.includes(ticket.number))return 'syncing';
  return ticket.status;
}
export function approximateTurnTime(estimate,now=Date.now(),timezone=TIME_ZONE){
  if(!estimate)return null;
  const minutes=Math.max(0,Math.round((estimate.range[0]+estimate.range[1])/2));
  const when=new Date(now+minutes*60000);
  const clock=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit',hour12:true}).format(when);
  return {minutes,clock};
}
export function publicQueue(id,queue){return {id,...queue,waiting:queue.waitingNumbers?.length||0};}
