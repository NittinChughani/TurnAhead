/** Managed-service pricing in integer PKR, not restrictions on MIT-licensed copies. */
export const PLANS=Object.freeze({
 essential:Object.freeze({name:'Essential',monthly:4999,setup:15000,departments:2,doctors:5,staff:3}),
 professional:Object.freeze({name:'Professional',monthly:14999,setup:35000,departments:15,doctors:50,staff:30}),
 enterprise:Object.freeze({name:'Enterprise',monthly:null,setup:null,departments:null,doctors:null,staff:null})
});
export const money=n=>Number.isSafeInteger(n)&&n>=0?'PKR '+n.toLocaleString('en-PK'):'Custom quotation';
export function quote(plan,cycle){
 const p=PLANS[plan];if(!Object.hasOwn(PLANS,plan)||!['monthly','annual'].includes(cycle))throw Error('Invalid package or billing cycle.');
 const recurring=p.monthly===null?null:p.monthly*(cycle==='annual'?10:1);
 return {recurring,setup:p.setup,total:recurring===null?null:recurring+p.setup};
}
export function subscriptionStatus(s,now=Date.now()){
 if(!s)return 'unassigned';
 if(['cancelled','suspended','pending','awaiting-payment'].includes(s.status))return s.status;
 if(s.status!=='active'||!Number.isFinite(s.expiresAt?.toMillis?.()))return 'unavailable';
 const remaining=s.expiresAt.toMillis()-now;
 return remaining<=-15*86400000?'expired':remaining<=0?'grace':remaining<=30*86400000?'renewal-due':'active';
}
export function renewalNotice(s,now=Date.now()){
 const status=subscriptionStatus(s,now);if(status==='grace')return 'Renewal overdue. Contact TurnAhead; active clinical workflows remain available.';
 if(status==='expired')return 'Subscription expired. Contact TurnAhead to arrange safe continuity.';
 if(status!=='renewal-due')return '';
 const days=Math.ceil((s.expiresAt.toMillis()-now)/86400000);
 return 'Renewal due in '+days+' day'+(days===1?'':'s')+'.';
}
