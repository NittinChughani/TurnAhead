import {dayKey} from './queue-engine.js?v=2.6.2';
export function archiveMonth(today=dayKey()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('Invalid archive month');
 const first=today.slice(0,7)+'-01',d=new Date(first+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);
 return {first,next:d.toISOString().slice(0,10),label:new Intl.DateTimeFormat('en-PK',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(first+'T00:00:00Z'))};
}
export function monthDates(dates,today=dayKey()){const {first,next}=archiveMonth(today);return [...new Set(dates.filter(d=>d>=first&&d<next&&/^\d{4}-\d{2}-\d{2}$/.test(d)))].sort((a,b)=>b.localeCompare(a));}
