/** Conservative operator-only retention. No browser permissions or scheduled deletion. */
export function cutoffFor(days,now=Date.now()){
 if(!Number.isInteger(days)||days<30||days>3650)throw Error('Retention must be an explicitly approved integer between 30 and 3650 days.');
 return now-days*86400000;
}
export function eligibleForRetention(ticket,archive,cutoff){
 if(!ticket||!archive||!Number.isFinite(cutoff))return false;
 if(!['completed','skipped'].includes(ticket.status)||archive.status!==ticket.status)return false;
 if(ticket.dayKey!==archive.dayKey||ticket.queueId!==archive.queueId||ticket.code!==archive.code)return false;
 return [ticket.createdAt,ticket.finishedAt,archive.issuedAt,archive.finishedAt].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<cutoff);
}
export function linkedToControl(control,id){
 if(!control)return true; // Fail closed if the control record is missing.
 if(control.activeId===id||control.pending?.some(x=>x.id===id))return true;
 return Object.values(control.lanes||{}).some(l=>l.activeId===id||l.pending?.some(x=>x.id===id));
}
