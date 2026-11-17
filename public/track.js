import {configured,helpfulError} from './firebase.js';
import {getHospital} from './org-store.js';
import {registerTurnPush} from './push-client.js';
import {observeTicket,observeQueue,fetchTicketFromServer,observeArrival,requestArrival,submitFeedback} from './store.js';
import {t as tfn,bindLanguage} from './locale.js';
import {nearTurnMilestone} from './v26-engine.js';
import {dayKey,waitingEstimate,effectiveTicketStatus,approximateTurnTime,patientDisplayName,doctorQueueSummary,callHistoryLine} from './queue-engine.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const ticketId=params.get('ticket'),hospitalId=params.get('hospital');
const legacy=!hospitalId;
let facility='Your hospital',currentTicket=null,currentQueue=null,stopQueue=null,stopArrival=null,arrival=null,subscribedQueueId=null,alerts=false,vibrationEnabled=false,hadLoaded=false,lastStatus='',lastAhead=null,lastConfirmed=0,refreshing=false,lastRefresh=0;
const loader=$('track-loading');
setTimeout(()=>{if(!loader.hidden)$('track-loading-note').textContent='Still connecting. Your queue will appear as soon as the live service responds.';},3200);
const messages={waiting:'Your place updates as reception calls each patient.',called:"It's your turn. Please go to your service counter.",completed:'Your visit was marked completed. Thank you for coming.',skipped:'Reception marked this turn as missed. Please ask them for help.',syncing:'Checking the latest status with reception…',expired:'This ticket belongs to an earlier day. Please ask reception for a new one.'};
function fail(message){loader.hidden=true;$('track-error').textContent=message;$('track-error').hidden=false;$('track-content').hidden=true;}
function setSyncStatus(){
  const element=$('sync-state');
  const seconds=lastConfirmed?Math.floor((Date.now()-lastConfirmed)/1000):Infinity;
  if(!navigator.onLine){element.textContent='OFFLINE · RECONNECTING';return;}
  element.textContent=refreshing?'CHECKING LIVE STATUS':seconds>35?'RECONNECTING…':lastConfirmed?'LIVE · SYNCED':'CONNECTING…';
}
/** Prevent an older cached snapshot from undoing a confirmed call or final state. */
function applyTicket(ticket){
  if(!ticket)return;
  const rank={waiting:0,called:1,completed:2,skipped:2};
  if(currentTicket?.id===ticket.id && (rank[ticket.status]||0)<(rank[currentTicket.status]||0))return;
  currentTicket=ticket;
  if(!ticket._fromCache)lastConfirmed=Date.now();
  if(subscribedQueueId!==ticket.queueId){
    stopQueue?.();subscribedQueueId=ticket.queueId;currentQueue=null;
    stopQueue=observeQueue(hospitalId,ticket.queueId,q=>{
      if(q)currentQueue=q;
      else if(!['completed','skipped'].includes(currentTicket?.status))$('sync-state').textContent='DEPARTMENT UNAVAILABLE';
      update();
    },err=>{$('sync-state').textContent='RECONNECTING…';console.warn(helpfulError(err));});
  }
  update();
}
async function syncTicket(force=false){
  if(refreshing||!navigator.onLine||!ticketId||!configured)return;
  if(!force&&Date.now()-lastRefresh<12000)return;
  refreshing=true;lastRefresh=Date.now();setSyncStatus();
  try{
    const t=await fetchTicketFromServer(hospitalId,ticketId);
    if(t)applyTicket(t);
  }catch(err){console.warn('Queue status recheck failed:',helpfulError(err));}
  finally{refreshing=false;setSyncStatus();}
}
function update(){
  const t=currentTicket,q=currentQueue;
  if(!t)return;
  const status=effectiveTicketStatus(t,q,dayKey());
  const doctorQueue=q&&t.doctorId&&q.lanes?.[t.doctorId]?doctorQueueSummary(q,t.doctorId):q;
  const waiting=status==='waiting',estimate=waiting&&doctorQueue?waitingEstimate(doctorQueue,t.number):null;
  const validWait=Boolean(waiting&&estimate);
  const shownStatus=waiting&&!validWait&&q?'syncing':status;
  const ahead=validWait?estimate.peopleAhead:null;
  loader.hidden=true;$('track-error').hidden=true;$('track-content').hidden=false;
  $('track-code').textContent=t.code;
  $('track-queue').textContent=`${facility} · ${q?.name||t.queueName}`;
  $('track-patient').textContent=t.patientName?`Ticket for ${patientDisplayName(t)}`:'Patient name not recorded on this older ticket';
  $('track-visit').textContent=t.doctorName?`Visiting Dr. ${t.doctorName}${t.roomNumber?' · Room '+t.roomNumber:''}`:'Doctor / room details not recorded on this older ticket';
  $('track-call-history').textContent=callHistoryLine(t);
  $('track-state').textContent=tfn(shownStatus);
  $('track-state').style.color=shownStatus==='called'?'#095c46':'';
  $('ahead-label').textContent=tfn(validWait?'ahead':'queueStatus');
  $('ahead-count').textContent=validWait?ahead:shownStatus==='called'?'↗':shownStatus==='syncing'?'…':'✓';
  $('track-eta').textContent=validWait?(doctorQueue.paused?tfn('paused'):tfn('minutes',{n:estimate.range.join('–')})):'—';
  const eta=validWait&&!doctorQueue.paused?approximateTurnTime(estimate):null;
  $('track-eta-clock').textContent=eta?`Around ${eta.clock} (PKT) · estimate only`:'';
  $('track-serving').textContent=doctorQueue?.active?.code||'—';
  $('track-message').textContent=shownStatus==='called'?tfn('turnMessage',{counter:t.calledCounter||'reception'}):legacy?'This uses the older queue system. Please request a new QR ticket.':doctorQueue?.paused&&validWait?tfn('paused'):tfn(({waiting:'pleaseWait',completed:'completedMessage',skipped:'missedMessage'}[shownStatus]||shownStatus));
  const pct=validWait?Math.max(10,Math.min(92,Math.round(100/(ahead+1)))):shownStatus==='syncing'?65:100;
  $('track-progress-bar').style.width=`${pct}%`;
  $('progress-description').textContent=validWait?`${ahead===0?'You are next in line.':`${ahead} ${ahead===1?'person':'people'} ahead of you.`} Times can change; stay near reception.`:messages[shownStatus]||'';
  if(hadLoaded&&lastStatus!=='called'&&shownStatus==='called'&&vibrationEnabled&&typeof navigator.vibrate==='function'&&document.visibilityState==='visible'){
    navigator.vibrate([280,120,280,120,380]);
  }
  if(hadLoaded&&alerts&&'Notification' in window&&Notification.permission==='granted'){
    if(lastStatus!=='called'&&shownStatus==='called')notify('Your turn is ready',`${t.code} — please return to ${t.queueName}.`);
    else if(validWait&&ahead>0&&ahead<=2&&(lastAhead===null||lastAhead>2)&&!sessionStorage.getItem('ta-near-'+ticketId)){
      notify('Almost your turn',`${ahead} ahead of ${t.code}. Stay nearby.`);sessionStorage.setItem('ta-near-'+ticketId,'yes');
    }
  }
  renderArrival(status);showNearTurn(t,shownStatus,validWait?ahead:null);renderFeedback(status);
  lastStatus=shownStatus;lastAhead=ahead;hadLoaded=true;setSyncStatus();
}
function notify(title,body){new Notification('TurnAhead: '+title,{body,icon:'./assets/favicon.png'});}
/** Permission-free modal. Persist each milestone per ticket on this device. */
const nearModal=$('near-popup');
const milestonePriority={near:1,next:2,called:3};
let currentlyShown=null;
function showNearTurn(ticket,status,ahead){
  if(document.visibilityState!=='visible'||!ticketId||legacy)return;
  const kind=nearTurnMilestone(status,ahead);
  if(!kind)return;
  const key=`turnahead-v26-near:${hospitalId}:${ticketId}:${kind}`;
  const previously=sessionStorage.getItem(key);
  if(previously||currentlyShown&&milestonePriority[currentlyShown]>=milestonePriority[kind])return;
  if(kind==='near'&&(sessionStorage.getItem(`turnahead-v26-near:${hospitalId}:${ticketId}:next`)||sessionStorage.getItem(`turnahead-v26-near:${hospitalId}:${ticketId}:called`)))return;
  if(kind==='next'&&sessionStorage.getItem(`turnahead-v26-near:${hospitalId}:${ticketId}:called`))return;
  sessionStorage.setItem(key,'1');currentlyShown=kind;
  $('near-popup-title').textContent=tfn('alert'+kind.charAt(0).toUpperCase()+kind.slice(1));
  $('near-popup-text').textContent=tfn('alert'+kind.charAt(0).toUpperCase()+kind.slice(1)+'Text',kind==='called'?{counter:ticket.calledCounter||'reception'}:{n:kind==='next'?1:Math.max(2,ahead)});
  nearModal.hidden=false;$('near-popup-close').focus({preventScroll:true});
}
$('near-popup-close').addEventListener('click',()=>{nearModal.hidden=true;currentlyShown=null;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){
  if(!feedbackModal.hidden){e.preventDefault();closeFeedback();}
  else if(!nearModal.hidden){e.preventDefault();nearModal.hidden=true;currentlyShown=null;}
}});
function renderArrival(status){
  const panel=$('arrival-panel');
  panel.hidden=legacy||status!=='waiting';
  if(panel.hidden)return;
  const button=$('arrival-button');
  button.hidden=Boolean(arrival);
  button.disabled=Boolean(arrival);
  $('arrival-status').textContent=arrival?tfn(arrival.status==='verified'?'arrivalVerified':'arrivalWaiting'):'';
}
/** Completion feedback is a one-time, permission-free foreground dialog, never an inline card. */
const feedbackModal=$('feedback-popup');
const feedbackSeenKey=`turnahead-v26-feedback-seen:${hospitalId}:${ticketId}`;
const feedbackSubmittedKey=`turnahead-v26-feedback:${hospitalId}:${ticketId}`;
function closeFeedback(){
  feedbackModal.hidden=true;
  // The offer was already recorded when the modal appeared, including when dismissed.
  $('feedback-close').blur();
}
function renderFeedback(status){
  if(legacy||status!=='completed'||document.visibilityState!=='visible'||!feedbackModal.hidden)return;
  if(localStorage.getItem(feedbackSeenKey)==='yes'||localStorage.getItem(feedbackSubmittedKey)==='yes')return;
  // Completion takes priority over a previously displayed near-turn popup.
  nearModal.hidden=true;currentlyShown=null;
  localStorage.setItem(feedbackSeenKey,'yes');
  feedbackModal.hidden=false;
  $('feedback-form').hidden=false;
  $('feedback-state').textContent='';
  $('feedback-close').focus({preventScroll:true});
}
$('feedback-close').addEventListener('click',closeFeedback);
$('arrival-button').addEventListener('click',async()=>{
  const b=$('arrival-button');b.disabled=true;
  try{await requestArrival(hospitalId,ticketId);arrival={status:'pending'};renderArrival('waiting');}
  catch(err){$('arrival-status').textContent=helpfulError(err);b.disabled=false;}
});
$('feedback-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;
  const rating=form.querySelector('input[name=rating]:checked')?.value;
  try{
    await submitFeedback(hospitalId,ticketId,Number(rating),$('feedback-note').value);
    localStorage.setItem(feedbackSubmittedKey,'yes');
    closeFeedback();
  }catch(err){
    $('feedback-state').textContent='Feedback could not be submitted. It may already have been received. '+helpfulError(err);
  }finally{b.disabled=false;}
});
bindLanguage();
$('enable-alerts').addEventListener('click',async()=>{
  vibrationEnabled=typeof navigator.vibrate==='function';
  // User tap enables vibration where supported; many browsers (especially iOS) ignore it.
  if(vibrationEnabled)navigator.vibrate(40);
  if('Notification' in window&&window.isSecureContext)alerts=(await Notification.requestPermission())==='granted';
  let pushNote='Keep this page open for live browser alerts.';
  if(alerts&&!legacy&&hospitalId){try{const push=await registerTurnPush(hospitalId,ticketId);pushNote=push.reason;}catch(err){console.warn('Background push not registered:',err);pushNote='Background push unavailable. Live alerts still work while this page stays open.';}}
  $('alert-state').textContent=[alerts?'Browser alerts enabled':'Browser alerts unavailable',vibrationEnabled?'Vibration supported':'Vibration not supported',pushNote].join(' · ');
  $('enable-alerts').textContent='Turn alerts configured ✓';
});
if(!configured)fail('This website is not connected to Firebase yet. Please contact reception.');
else if(!ticketId||!/^[A-Za-z0-9]{20}$/.test(ticketId)||(hospitalId&&!/^[A-Za-z0-9]{20}$/.test(hospitalId)))
  fail('No valid ticket was supplied. Scan the QR code on your receipt to open your queue status.');
else{
  if(!legacy)getHospital(hospitalId).then(h=>{facility=h.name;update();}).catch(err=>console.warn('Hospital name unavailable:',helpfulError(err)));
  if(!legacy)stopArrival=observeArrival(hospitalId,ticketId,value=>{arrival=value;if(currentTicket)renderArrival(effectiveTicketStatus(currentTicket,currentQueue,dayKey()));},err=>console.warn('Arrival status unavailable:',helpfulError(err)));
  observeTicket(hospitalId,ticketId,t=>{
    if(!t){fail('Ticket not found. Check your QR code or ask reception.');return;}
    applyTicket(t);
    if(t._fromCache)syncTicket(true);
  },err=>{console.warn(helpfulError(err));$('sync-state').textContent='RECONNECTING…';syncTicket(true);});
  // Safari can suspend listeners while the device is locked. Recheck from the server
  // when the page resumes, and periodically while visible. These are bounded reads.
  const resume=()=>{if(document.visibilityState==='visible'){lastRefresh=0;syncTicket(true);update();}};
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pageshow',resume);
  window.addEventListener('focus',resume);
  window.addEventListener('online',()=>syncTicket(true));
  window.addEventListener('offline',setSyncStatus);
  setInterval(()=>{setSyncStatus();if(document.visibilityState==='visible'){
    if(!['completed','skipped','expired'].includes(currentTicket?.status))syncTicket();
    if(currentTicket)update();
  }},15000);
}
