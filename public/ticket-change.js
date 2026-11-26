import {getDoctorLane,getDoctorControl} from './queue-engine.js?v=3.3.0';
export function planTicketChange(q,c,t,id,doctor,doctorId,details,now,today){
 if(t.status!=='waiting'||t.dayKey!==today||q.dayKey!==today)throw Error('Only today’s waiting tickets can be edited.');
 const source=getDoctorLane(q,t.doctorId),control=getDoctorControl(c,t.doctorId);
 if(!source.waitingNumbers.includes(t.number)||!control.pending.some(x=>x.id===id&&x.number===t.number))throw Error('Ticket is no longer in the waiting queue.');
 const patientName=String(details.patientName||'').trim().replace(/\s+/g,' '),patientGender=details.patientGender,roomNumber=String(details.roomNumber||'').trim();
 if(patientName.length<2||patientName.length>80||!['male','female'].includes(patientGender)||!/^[A-Za-z0-9][A-Za-z0-9 .\-/]{0,19}$/.test(roomNumber))throw Error('Check patient name, title and room.');
 if(!doctor.active||doctor.departmentId!==t.queueId||doctor.name.length<2)throw Error('Choose an active doctor in this department.');
 const transfer=doctorId!==t.doctorId;
 if(transfer&&(patientName!==t.patientName||patientGender!==t.patientGender))throw Error('Transfer and patient correction are separate operations.');
 const patch=transfer?{doctorId,doctorName:doctor.name,roomNumber}:{patientName,patientGender,roomNumber};
 if(!transfer&&Object.entries(patch).every(([k,v])=>t[k]===v))throw Error('No changes to save.');
 if(!transfer)return {kind:'correction',patch};
 const target=getDoctorLane(q,doctorId),targetControl=getDoctorControl(c,doctorId);
 if(q.paused||target.paused||target.waitingNumbers.length>=2000||target.waitingNumbers.includes(t.number)||targetControl.pending.some(x=>x.id===id))throw Error('Destination doctor is paused, full or inconsistent.');
 return {kind:'transfer',patch,queuePatch:{lanes:{...q.lanes,[t.doctorId]:{...source,waitingNumbers:source.waitingNumbers.filter(n=>n!==t.number),updatedAt:now},[doctorId]:{...target,waitingNumbers:[...target.waitingNumbers,t.number],updatedAt:now}},updatedAt:now},controlPatch:{lanes:{...c.lanes,[t.doctorId]:{...control,pending:control.pending.filter(x=>x.id!==id)},[doctorId]:{...targetControl,pending:[...targetControl.pending,{id,number:t.number}]}}}};
}

/** Keep one archive at the original issue department; allocate a new destination number. */
export function planDepartmentTransfer(q,c,dq,dc,t,id,doctor,doctorId,targetId,details,now,today){
 if(t.status!=='waiting'||t.dayKey!==today||q.dayKey!==today||dq.dayKey!==today)throw Error('Only today’s waiting tickets can be transferred. Refresh both queues.');
 if(targetId===t.queueId||doctor.departmentId!==targetId||!doctor.active)throw Error('Select an active doctor in another department.');
 if(details.patientName!==t.patientName||details.patientGender!==t.patientGender)throw Error('Correct patient details separately.');
 const roomNumber=String(details.roomNumber||'').trim();
 if(!/^[A-Za-z0-9][A-Za-z0-9 .\-/]{0,19}$/.test(roomNumber))throw Error('Enter a valid room.');
 const source=getDoctorLane(q,t.doctorId),sourceControl=getDoctorControl(c,t.doctorId),dest=getDoctorLane(dq,doctorId),destControl=getDoctorControl(dc,doctorId);
 if(!q.waitingNumbers.includes(t.number)||!source.waitingNumbers.includes(t.number)||!sourceControl.pending.some(x=>x.id===id&&x.number===t.number))throw Error('Ticket is no longer waiting.');
 if(dq.paused||dest.paused||dq.waitingNumbers.length>=2000||dest.waitingNumbers.length>=2000||destControl.pending.length>=2000||destControl.pending.some(x=>x.id===id))throw Error('Destination queue paused, full or inconsistent.');
 const number=Math.max(1,dq.lastNumber+1);
 if(!Number.isInteger(number)||number>999999||dq.waitingNumbers.includes(number)||dest.waitingNumbers.includes(number))throw Error('Destination ticket sequence is unavailable.');
 const code=dq.prefix+'-'+String(number).padStart(3,'0');
 return {kind:'department-transfer',patch:{originQueueId:t.originQueueId||t.queueId,queueId:targetId,queueName:dq.name,number,code,doctorId,doctorName:doctor.name,roomNumber},
  queuePatch:{waitingNumbers:q.waitingNumbers.filter(n=>n!==t.number),lanes:{...q.lanes,[t.doctorId]:{...source,waitingNumbers:source.waitingNumbers.filter(n=>n!==t.number),updatedAt:now}},updatedAt:now},
  controlPatch:{lanes:{...c.lanes,[t.doctorId]:{...sourceControl,pending:sourceControl.pending.filter(x=>x.id!==id)}}},
  destinationQueuePatch:{lastNumber:number,waitingNumbers:[...dq.waitingNumbers,number],lanes:{...dq.lanes,[doctorId]:{...dest,waitingNumbers:[...dest.waitingNumbers,number],updatedAt:now}},updatedAt:now},
  destinationControlPatch:{lanes:{...dc.lanes,[doctorId]:{...destControl,pending:[...destControl.pending,{id,number}]}}},
  archivePatch:{serviceQueueId:targetId,serviceQueueName:dq.name,serviceNumber:number,serviceCode:code,doctorId,doctorName:doctor.name,roomNumber,updatedAt:now}};
}
