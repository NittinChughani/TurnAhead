import {hid,did,target,tid,today,now,hospital,member,doctors,queues,ticket,stream,stamp} from './preview-data.js';
export const readActivity=async()=>[{actorUid:member.uid,kind:'ticket-issued',createdAt:stamp}];
