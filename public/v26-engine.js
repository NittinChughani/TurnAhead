/** v2.6: deterministic, side-effect-free walk-in rules. */
export const DEFAULT_RECALL_GRACE = 10;
export function graceMinutes(value){return Number.isInteger(value)&&value>=5&&value<=30?value:DEFAULT_RECALL_GRACE;}
/** Return the most relevant milestone; never stack or regress alerts. */
export function nearTurnMilestone(status, ahead){
  if(status==='called')return 'called';
  if(status!=='waiting'||!Number.isInteger(ahead)||ahead<0)return null;
  if(ahead<=1)return 'next';
  if(ahead<=3)return 'near';
  return null;
}
export function recallEligibility(ticket,now=Date.now(),minutes=DEFAULT_RECALL_GRACE,today){
  if(!ticket||ticket.status!=='skipped')return {ok:false,reason:'Only missed tickets can be recalled.'};
  if(today&&ticket.dayKey!==today)return {ok:false,reason:'Only today’s missed turns can be recalled.'};
  if((ticket.recallCount||0)>=1)return {ok:false,reason:'This ticket was already recalled once.'};
  if(!Number.isFinite(ticket.finishedAt)||now<ticket.finishedAt||now-ticket.finishedAt>graceMinutes(minutes)*60000)
    return {ok:false,reason:'The recall grace period has expired.'};
  if(!ticket.doctorId||!ticket.queueId)return {ok:false,reason:'This older ticket cannot be recalled.'};
  return {ok:true,remainingMs:Math.max(0,graceMinutes(minutes)*60000-(now-ticket.finishedAt))};
}
export function planRecall(q,c,ticket,ticketId,now,minutes,today){
  const eligible=recallEligibility(ticket,now,minutes,today);
  if(!eligible.ok)throw Error(eligible.reason);
  if(q.dayKey!==ticket.dayKey)throw Error('The department has moved to a new day.');
  const lane=q.lanes?.[ticket.doctorId],control=c.lanes?.[ticket.doctorId];
  if(!lane||!control)throw Error('Doctor queue is no longer available.');
  if(q.waitingNumbers.includes(ticket.number)||lane.waitingNumbers.includes(ticket.number)||control.pending.some(p=>p.id===ticketId)||control.activeId===ticketId)
    throw Error('Ticket is already in this doctor queue.');
  if(q.waitingNumbers.length>=2000||lane.waitingNumbers.length>=2000||control.pending.length>=2000)throw Error('Queue is at capacity.');
  const patch={status:'waiting',attendance:'pending',calledAt:null,finishedAt:null,
    missedAt:ticket.finishedAt,recalledAt:now,recallCount:1};
  return {queuePatch:{waitingNumbers:[...q.waitingNumbers,ticket.number],lanes:{...q.lanes,[ticket.doctorId]:{
    ...lane,waitingNumbers:[...lane.waitingNumbers,ticket.number],updatedAt:now}},updatedAt:now},
    controlPatch:{lanes:{...c.lanes,[ticket.doctorId]:{...control,pending:[...control.pending,{id:ticketId,number:ticket.number}]}}},
    ticketPatch:patch,historyPatch:{...patch,updatedAt:now}};
}
/** Public board call events. The UI can queue them while its tab is hidden instead
 * of marking them handled and permanently losing the spoken announcement. */
export function activeAnnouncements(queues,today=null){
  const active=[];
  for(const q of queues||[]){
    if(today&&q.dayKey&&q.dayKey!==today)continue;
    for(const [doctorId,lane] of Object.entries(q.lanes||{})){
      if(lane.active?.code)active.push({key:`${q.id}:${doctorId}`,code:lane.active.code,counter:lane.active.counter||'Reception'});
    }
    // Older departments with one shared active ticket still deserve announcements.
    if(q.active?.code)active.push({key:`${q.id}:legacy`,code:q.active.code,counter:q.active.counter||'Reception'});
  }
  return active;
}
export function announcementChanges(previous,queues,today=null){
  const current=new Map(activeAnnouncements(queues,today).map(call=>[call.key,call]));
  const calls=[...current.values()].filter(call=>{
    const last=previous.get(call.key);
    return !last||last.code!==call.code||last.counter!==call.counter;
  });
  return {current,calls};
}
export function safeFeedback(score,comment){
  const rating=Number(score);
  if(!Number.isInteger(rating)||rating<1||rating>5)throw Error('Choose a rating from 1 to 5.');
  const note=String(comment||'').trim().replace(/\s+/g,' ');
  if(note.length>300)throw Error('Feedback must contain at most 300 characters.');
  return {rating,note};
}
