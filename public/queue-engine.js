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
  return {name,prefix,dayKey:today,lastNumber:0,waitingNumbers:[],active:null,served:0,avgMinutes:8,paused:false,lanes:{},createdAt:now,updatedAt:now};
}
export function initialControl(){return {pending:[],activeId:null,activeSince:null,lanes:{}};}
export function normalizedQueue(queue,today=dayKey(),now=Date.now()){
  if(queue.dayKey===today)return {...queue};
  return {...queue,prefix:departmentPrefix(queue.name),dayKey:today,lastNumber:0,waitingNumbers:[],active:null,served:0,avgMinutes:8,paused:false,lanes:{},updatedAt:now};
}
export function nextTicket(queue,ticketId,today=dayKey(),now=Date.now(),patientName='',details={}){
  const name=String(patientName||'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>80)throw Error('Enter the patient name (2–80 characters).');
  const q=normalizedQueue(queue,today,now);
  if(q.paused)throw Error('This queue is paused. Resume it before issuing tickets.');
  const patientGender=details.patientGender;
  if(!['male','female'].includes(patientGender))throw Error('Choose the patient title (Mr or Ms).');
  const roomNumber=String(details.roomNumber||'').trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9 .\-\/]{0,19}$/.test(roomNumber))throw Error('Enter a valid doctor room number (1–20 characters).');
  const doctorId=String(details.doctorId||'');
  const doctorName=String(details.doctorName||'').trim();
  if(!/^[A-Za-z0-9]{20}$/.test(doctorId)||doctorName.length<2||doctorName.length>80)throw Error('Select a registered doctor.');
  const number=Math.max(1,q.lastNumber+1);
  if(number>999999)throw Error('Daily ticket limit reached.');
  const code=`${q.prefix}-${String(number).padStart(3,'0')}`;
  const lane = getDoctorLane(q,doctorId);
  if(lane.paused)throw Error('This doctor is taking a break. Choose another available doctor.');
  if(q.waitingNumbers.length>=2000 || lane.waitingNumbers.length>=2000)throw Error('Queue capacity reached. Ask reception to finish earlier tickets.');
  const lanes={...q.lanes,[doctorId]:{...lane,waitingNumbers:[...lane.waitingNumbers,number],updatedAt:now}};
  return {queue:{...q,lastNumber:number,waitingNumbers:[...q.waitingNumbers,number],lanes,updatedAt:now},
    ticket:{queueId:'',queueName:q.name,code,number,dayKey:today,patientName:name,patientGender,doctorId,doctorName,roomNumber,status:'waiting',attendance:'pending',createdAt:now,calledAt:null,finishedAt:null}};
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
  // Never hide a committed call just because the queue listener is a snapshot behind.
  if(ticket.status==='called')return 'called';
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
/** Doctor lanes share the department's daily sequence but advance independently. */
export function emptyDoctorLane(now=Date.now()){
  return {waitingNumbers:[],active:null,served:0,avgMinutes:8,paused:false,pauseReason:'',updatedAt:now};
}
export function getDoctorLane(queue,doctorId){
  return queue?.lanes?.[doctorId]||emptyDoctorLane();
}
export function getDoctorControl(control,doctorId){
  return control?.lanes?.[doctorId]||{pending:[],activeId:null,activeSince:null,activeCounter:'',activeUid:''};
}
export function doctorQueueSummary(queue,doctorId){
  const lane=getDoctorLane(queue,doctorId);
  return {...lane,dayKey:queue.dayKey,paused:Boolean(queue.paused||lane.paused),name:queue.name};
}
export function doctorActiveCodes(queue){
  return Object.entries(queue.lanes||{}).filter(([,lane])=>Boolean(lane.active)).map(([doctorId,lane])=>({doctorId,...lane.active}));
}
export function publicQueue(id,queue){return {id,...queue,waiting:queue.waitingNumbers?.length||0,activeCount:doctorActiveCodes(queue).length+(queue.active?1:0)};}

/** Pure transaction planning. Store.js commits these changes with Firestore runTransaction. */
export function planDoctorCall(q,c,doctorId,ticket,ticketId,counter,uid,now){
  if(!uid||!ticketId)throw Error('A signed-in receptionist and ticket are required.');
  const lane=getDoctorLane(q,doctorId),control=getDoctorControl(c,doctorId);
  const next=nextInLine(lane,control);
  if(next.id!==ticketId||ticket.status!=='waiting'||ticket.doctorId!==doctorId||ticket.number!==next.number)
    throw Error('Ticket or doctor assignment changed. Refresh reception.');
  if(Object.values(q.lanes||{}).some(other=>other.active?.counter===counter))
    throw Error(`${counter} is already serving a patient in this department.`);
  const nextLane={...lane,waitingNumbers:lane.waitingNumbers.slice(1),active:{code:ticket.code,number:next.number,counter},updatedAt:now};
  const nextControl={...control,pending:control.pending.slice(1),activeId:ticketId,activeSince:now,activeCounter:counter,activeUid:uid};
  return {
    queuePatch:{waitingNumbers:q.waitingNumbers.filter(n=>n!==next.number),lanes:{...q.lanes,[doctorId]:nextLane},updatedAt:now},
    controlPatch:{lanes:{...c.lanes,[doctorId]:nextControl}},
    ticketPatch:{status:'called',calledAt:now,calledCounter:counter},
    historyPatch:{status:'called',calledAt:now,calledCounter:counter,calledBy:uid,updatedAt:now}
  };
}
export function planDoctorFinish(q,c,doctorId,ticket,counter,uid,action,now){
  if(!['complete','skip'].includes(action))throw Error('Unknown queue action');
  const lane=getDoctorLane(q,doctorId),control=getDoctorControl(c,doctorId);
  if(!control.activeId||!lane.active||ticket.status!=='called')throw Error('The active ticket has changed. Refresh reception.');
  if(control.activeCounter!==counter)throw Error(`This patient was called from ${control.activeCounter}. Select that counter to finish the ticket.`);
  if(ticket.doctorId!==doctorId||ticket.code!==lane.active.code)throw Error('Doctor assignment changed. Refresh reception.');
  const status=action==='complete'?'completed':'skipped',attendance=action==='complete'?'present':'missed';
  const nextLane={...lane,active:null,updatedAt:now},queuePatch={updatedAt:now};
  if(status==='completed'){
    const minutes=Math.max(1,Math.min(40,(now-(control.activeSince||now))/60000));
    const sample=Math.min(9,lane.served||0),overall=Math.min(9,q.served||0);
    nextLane.avgMinutes=Math.round(((Number(lane.avgMinutes)||8)*sample+minutes)/(sample+1));
    nextLane.served=(lane.served||0)+1;
    queuePatch.served=(q.served||0)+1;
    queuePatch.avgMinutes=Math.round(((Number(q.avgMinutes)||8)*overall+minutes)/(overall+1));
  }
  queuePatch.lanes={...q.lanes,[doctorId]:nextLane};
  return {
    queuePatch,
    controlPatch:{lanes:{...c.lanes,[doctorId]:{...control,activeId:null,activeSince:null,activeCounter:'',activeUid:''}}},
    ticketPatch:{status,attendance,finishedAt:now},
    historyPatch:{status,attendance,finishedAt:now,finishedBy:uid,updatedAt:now}
  };
}

/** A recalled ticket retains its distinction throughout waiting, service, and completion. */
export function ticketStatusLabel(ticket){
  if(!ticket)return 'Unknown';
  const standard={waiting:'Waiting',called:'Called',completed:'Completed',skipped:'Missed'};
  const recalled={waiting:'Recalled · Waiting',called:'Recalled · Called',completed:'Recalled & completed',skipped:'Recalled · Missed again'};
  return ((ticket.recallCount||0)>0?recalled:standard)[ticket.status]||ticket.status;
}
/** A ticket's call time survives Safari suspension and a subsequent completion. */
export function callHistoryLine(ticket,timezone=TIME_ZONE){
  if(!ticket?.calledAt)return '';
  const clock=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(ticket.calledAt));
  return `Reception called ${ticket.code} at ${clock}${ticket.calledCounter?' from '+ticket.calledCounter:''}.`;
}
/** Bound counter labels to predictable choices, not arbitrary HTML. */
export function counterLabel(number){
  const n=Number(number);
  if(!Number.isInteger(n)||n<1||n>12)throw Error('Select a counter from 1 to 12.');
  return `Counter ${n}`;
}

/** Display a title without inferring anyone's gender from their name. */
export function patientDisplayName(patient){
  const name=String(patient?.patientName||'').trim();
  if(!name)return 'Patient';
  const title=patient?.patientGender==='male'?'Mr':patient?.patientGender==='female'?'Ms':'';
  return title?`${title} ${name}`:name;
}
export function displayClock(date=new Date(),timezone=TIME_ZONE){
  return new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}).format(date);
}
