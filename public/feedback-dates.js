import {dayKey} from './queue-engine.js?v=2.6.2';
export const feedbackDay=()=>dayKey();
export function dayStart(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(+new Date(day+'T00:00:00+05:00')))throw Error('Invalid date');return new Date(day+'T00:00:00+05:00');}
export function feedbackBounds(day){const start=dayStart(day);return {start,end:new Date(+start+86400000)};}
export function monthBounds(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Invalid month');const start=dayStart(month+'-01'),utc=new Date(month+'-01T00:00:00Z');utc.setUTCMonth(utc.getUTCMonth()+1);return {start,end:dayStart(utc.toISOString().slice(0,10))};}
export const feedbackMonthLabel=month=>new Intl.DateTimeFormat('en-PK',{month:'long',year:'numeric',timeZone:'Asia/Karachi'}).format(monthBounds(month).start);
export const feedbackDateLabel=date=>new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Karachi'}).format(date);
