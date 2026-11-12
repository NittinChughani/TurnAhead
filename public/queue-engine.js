/** Pure, testable queue calculations. No Firebase dependency. */
export const TIME_ZONE = 'Asia/Karachi';
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit' }).format(date);
}
export function prefixFor(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index > 701) throw Error('Department limit reached');
  let n=index+1, result='';
  while (n>0) { n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26); }
  return result;
}
export function initialQueue(name='General OPD',prefix='A',today=dayKey(),now=Date.now()) {
  return {name,prefix,dayKey:today,lastNumber:0,waitingNumbers:[],active:null,served:0,avgMinutes:8,paused:false,createdAt:now,updatedAt:now};
}
export function initialControl() {return {pending:[],activeId:null,activeSince:null};}
export function normalizedQueue(queue,today=dayKey(),now=Date.now()) {
  if(queue.dayKey === today) return {...queue};
  return {...queue,dayKey:today,lastNumber:0,waitingNumbers:[],active:null,served:0,avgMinutes:8,paused:false,updatedAt:now};
}
export function nextTicket(queue,ticketId,today=dayKey(),now=Date.now()) {
  const q=normalizedQueue(queue,today,now);
  if(q.paused) throw Error('This queue is paused. Resume it before issuing tickets.');
  const number=q.lastNumber+1;
  if(number>9999)throw Error('Ticket limit reached for today.');
  const code=`${q.prefix}-${String(number).padStart(3,'0')}`;
  return {queue:{...q,lastNumber:number,waitingNumbers:[...q.waitingNumbers,number],updatedAt:now},
    ticket:{queueId:'',queueName:q.name,code,number,dayKey:today,status:'waiting',createdAt:now,calledAt:null,finishedAt:null}};
}
export function nextInLine(queue,control) {
  if(queue.paused) throw Error('Resume this queue before calling the next visitor.');
  if(queue.active || control.activeId) throw Error('Complete or skip the active ticket first.');
  if(!control.pending?.length || !queue.waitingNumbers?.length) throw Error('Nobody is waiting in this queue.');
  const first=control.pending[0];
  if(queue.waitingNumbers[0]!==first.number)throw Error('Queue is out of sync. Refresh reception before continuing.');
  return first;
}
export function waitingEstimate(queue,number) {
  const ahead=queue.waitingNumbers.indexOf(number);
  if(ahead<0)return null;
  const count=ahead+(queue.active?1:0);
  const avg=Math.max(3,Math.min(40,Number(queue.avgMinutes)||8));
  return {peopleAhead:count,range:[Math.max(0,Math.round(count*avg*.8)),Math.round(count*avg*1.2+avg)]};
}
export function publicQueue(id,queue) {
  return {id,...queue,waiting:queue.waitingNumbers?.length||0};
}
