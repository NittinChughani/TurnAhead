/** Aggregate operational archive records only; never include names or ticket IDs in exports. */
export function reportDates(end,days){
 if(![1,7,30].includes(days)||!/^\d{4}-\d{2}-\d{2}$/.test(end))throw Error('Choose a valid report date.');
 const date=new Date(end+'T00:00:00Z');
 if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==end)throw Error('Invalid date.');
 return Array.from({length:days},(_,i)=>new Date(+date-(days-1-i)*86400000).toISOString().slice(0,10));
}
const mean=(sum,n)=>n?Math.round(sum/n*10)/10:null;
const validTime=t=>typeof t==='number'&&Number.isFinite(t)&&t>0;
const bucket=()=>({issued:0,completed:0,missed:0,recalled:0,recalledCompleted:0,unresolved:0,waitSum:0,waitN:0,serviceSum:0,serviceN:0});
function add(b,t){
 b.issued++;
 if(t.status==='completed')b.completed++;else if(t.status==='skipped')b.missed++;else b.unresolved++;
 if(t.recallCount){b.recalled++;if(t.status==='completed')b.recalledCompleted++;}
 // Recalled tickets overwrite the original call timestamp. Exclude them from waiting averages.
 if(!t.recallCount&&validTime(t.issuedAt)&&validTime(t.calledAt)&&t.calledAt>=t.issuedAt){b.waitSum+=(t.calledAt-t.issuedAt)/60000;b.waitN++;}
 if(t.status==='completed'&&validTime(t.calledAt)&&validTime(t.finishedAt)&&t.finishedAt>=t.calledAt){b.serviceSum+=(t.finishedAt-t.calledAt)/60000;b.serviceN++;}
}
function summarize(b){const {waitSum,waitN,serviceSum,serviceN,...counts}=b;return {...counts,wait:mean(waitSum,waitN),service:mean(serviceSum,serviceN),waitN,serviceN};}
export function buildAnalytics(records,feedback,dates){
 const total=bucket(),byDay=new Map(dates.map(d=>[d,bucket()])),departments=new Map(),doctors=new Map(),hours=Array(24).fill(0);
 const slot=(map,key,label)=>{if(!map.has(key))map.set(key,{label,...bucket()});return map.get(key);};
 const hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',hourCycle:'h23'});
 for(const t of records){
  if(!byDay.has(t.dayKey))continue;
  add(total,t);add(byDay.get(t.dayKey),t);
  add(slot(departments,t.queueId||t.queueName||'unknown',t.queueName||'Unknown department'),t);
  add(slot(doctors,(t.queueId||'')+':'+(t.doctorId||t.doctorName||'unknown'),(t.doctorName||'Unassigned')+' · '+(t.queueName||'Department')),t);
  if(validTime(t.issuedAt))hours[Number(hourFormat.format(new Date(t.issuedAt)))]++;
 }
 const satisfaction=dates.map(date=>{const ratings=feedback.filter(f=>f.day===date&&Number.isInteger(f.rating)&&f.rating>=1&&f.rating<=5).map(f=>f.rating);return {date,count:ratings.length,average:mean(ratings.reduce((a,b)=>a+b,0),ratings.length)};});
 const valid=feedback.filter(f=>dates.includes(f.day)&&Number.isInteger(f.rating)&&f.rating>=1&&f.rating<=5);
 return {total:summarize(total),days:[...byDay].map(([date,b])=>({date,...summarize(b)})),departments:[...departments.values()].map(summarize).sort((a,b)=>b.issued-a.issued),doctors:[...doctors.values()].map(summarize).sort((a,b)=>b.issued-a.issued),hours,ratings:{count:valid.length,average:mean(valid.reduce((a,b)=>a+b.rating,0),valid.length),distribution:[1,2,3,4,5].map(r=>valid.filter(f=>f.rating===r).length),trend:satisfaction}};
}
export function reportRows(report){
 const rows=[['Section','Period / group','Issued','Completed','Missed (final)','Recalled','Recalled & completed','Unresolved','Avg wait (min)','Avg service (min)','Wait samples','Service samples','Feedback count','Avg rating']];
 const add=(section,label,r)=>rows.push([section,label,r.issued,r.completed,r.missed,r.recalled,r.recalledCompleted,r.unresolved,r.wait,r.service,r.waitN,r.serviceN,'','']);
 add('Total','Selected period',report.total);
 for(const [section,group] of [['Daily',report.days],['Department',report.departments],['Doctor',report.doctors]])for(const r of group)add(section,r.date||r.label,r);
 report.hours.forEach((n,h)=>rows.push(['Issue hour (PKT)',String(h).padStart(2,'0')+':00',n]));
 rows.push(['Feedback','Selected period','','','','','','','','','','',report.ratings.count,report.ratings.average]);
 for(const r of report.ratings.trend)rows.push(['Feedback date',r.date,'','','','','','','','','','',r.count,r.average]);
 return rows;
}
export function analyticsCSV(rows){
 // Prevent spreadsheet formula execution from configurable department/doctor labels.
 return rows.map(row=>row.map(v=>{let s=String(v??'');if(typeof v==='string'&&/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');
}
