import {hid,did,target,tid,today,now,hospital,member,doctors,queues,ticket,stream,stamp} from './preview-data.js';
export const loadAnalytics=async()=>({records:[{...ticket,status:'completed',calledAt:now+60000,finishedAt:now+120000}],feedback:[{day:today,rating:4}],dates:[today]});
