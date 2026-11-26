import {configured,helpfulError} from './firebase.js';
import {getHospital} from './org-store.js';
import {applyHospitalBrand} from './hospital-custom.js?v=3.1.0';
import {registerTurnPush} from './push-client.js';
import {observeTicket,observeQueue,fetchTicketFromServer,submitFeedback} from './store.js?v=3.2.0';
import {t as tfn,bindLanguage} from './locale.js?v=2.6.1';
import {nearTurnMilestone,shouldApplyTicket} from './v26-engine.js?v=2.6.3';
import {dayKey,refinedWaitingEstimate,effectiveTicketStatus,approximateTurnTime,patientDisplayName,doctorQueueSummary,callHistoryLine} from './queue-engine.js?v=3.3.0';
import {persistent,session} from './reliability.js?v=3.2.0';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const ticketId=params.get('ticket'),hospitalId=params.get('hospital');
const legacy=!hospitalId;
let facility='Your hospital',currentTicket=null,currentQueue=null,stopQueue=null,subscribedQueueId=null,alerts=false,vibrationEnabled=false,hadLoaded=false,lastStatus='',lastAhead=null,lastConfirmed=0,refreshing=false,lastRefresh=0,missingConfirmed=false;
const loader=$('track-loading');
setTimeout(()=>{if(!loader.hidden)$('track-loading-note').textContent='Still connecting. Your queue will appear as soon as the live service responds.';},3200);
const messages={waiting:'Your place updates as reception calls each patient.',called:"It's your turn. Please go to your service counter.",completed:'Your visit was marked completed. Thank you for coming.',skipped:'Reception marked this turn as missed. Please ask them for help.',syncing:'Checking the latest status with reception…',expired:'This ticket belongs to an earlier day. Please ask reception for a new one.'};
function clearPrivateTicket(){const img=$('saved-ticket-qr');img.hidden=true;img.removeAttribute('src');currentTicket=null;currentQueue=null;stopQueue?.();stopQueue=null;subscribedQueueId=null;lastConfirmed=0;for(const id of ['track-code','track-patient','track-visit','track-queue','track-call-history'])$(id).textContent='';}
function missingTicket(){missingConfirmed=true;clearPrivateTicket();for(const id of ['near-popup','feedback-popup','feedback-success','feedback-progress']){const node=$(id);if(node)node.hidden=true;}if($('feedback-note'))$('feedback-note').value='';fail('Ticket not found or no longer available. Ask reception for help.');}
function fail(message){loader.hidden=true;$('track-error').textContent=message;$('track-error').hidden=false;$('track-content').hidden=true;}
function setSyncStatus(){
  const element=$('sync-state');
  const seconds=lastConfirmed?Math.floor((Date.now()-lastConfirmed)/1000):Infinity;
  if(missingConfirmed){element.textContent='TICKET UNAVAILABLE';return;}
  if(!navigator.onLine){element.textContent='OFFLINE · RECONNECTING';return;}
  element.textContent=refreshing?'CHECKING LIVE STATUS':seconds>95?'RECONNECTING…':lastConfirmed?'LIVE · SYNCED':'CONNECTING…';
}
/** Prevent an older cached snapshot from undoing a confirmed call or final state. */
function applyTicket(ticket){
  if(!ticket||missingConfirmed&&ticket._fromCache)return;
  missingConfirmed=false;
  if(!shouldApplyTicket(currentTicket,ticket)||ticket._fromCache&&currentTicket&&!currentTicket._fromCache&&ticket.changeId!==currentTicket.changeId)return;
  currentTicket=ticket;
  if(!ticket._fromCache)lastConfirmed=Date.now();
  if(subscribedQueueId!==ticket.queueId){
    stopQueue?.();subscribedQueueId=ticket.queueId;currentQueue=null;
    const queueId=ticket.queueId;
    stopQueue=observeQueue(hospitalId,queueId,q=>{
      if(subscribedQueueId!==queueId)return;
      if(q)currentQueue=q;
      else if(!['completed','skipped'].includes(currentTicket?.status))$('sync-state').textContent='DEPARTMENT UNAVAILABLE';
      update();
    },err=>{$('sync-state').textContent='RECONNECTING…';console.warn(helpfulError(err));});
  }
  update();
}
async function syncTicket(force=false){
  if(refreshing||!navigator.onLine||!ticketId||!configured)return;
  if(Date.now()-lastRefresh<(force?5000:60000))return;
  refreshing=true;lastRefresh=Date.now();setSyncStatus();
  try{
    const t=await fetchTicketFromServer(hospitalId,ticketId);
    if(t)applyTicket(t);else missingTicket();
  }catch(err){console.warn('Queue status recheck failed:',helpfulError(err));}
  finally{refreshing=false;setSyncStatus();}
}
function update(){
  const t=currentTicket,q=currentQueue;
  if(!t)return;
  const status=effectiveTicketStatus(t,q,dayKey());
  const doctorQueue=q&&t.doctorId&&q.lanes?.[t.doctorId]?doctorQueueSummary(q,t.doctorId):q;
  const waiting=status==='waiting',estimate=waiting&&doctorQueue?refinedWaitingEstimate(doctorQueue,t.number):null;
  const validWait=Boolean(waiting&&estimate);
  const shownStatus=waiting&&!validWait&&q?'syncing':status;
  const ahead=validWait?estimate.peopleAhead:null;
  loader.hidden=true;$('track-error').hidden=true;$('track-content').hidden=false;
  $('track-code').textContent=t.code;
  $('track-transfer').hidden=!t.originQueueId;$('track-transfer').textContent=t.originQueueId?'Your ticket was transferred. Use the current number shown above; your original QR still works.':'';
  $('track-queue').textContent=`${facility} · ${q?.name||t.queueName}`;
  $('track-patient').textContent=t.patientName?`Ticket for ${patientDisplayName(t)}`:'Patient name not recorded on this older ticket';
  $('track-visit').textContent=t.doctorName?`Visiting Dr. ${t.doctorName}${t.roomNumber?' · Room '+t.roomNumber:''}`:'Doctor / room details not recorded on this older ticket';
  $('track-call-history').textContent=callHistoryLine(t);
  $('track-state').textContent=t.recallCount?({waiting:'RECALLED · WAITING',called:'RECALLED · YOUR TURN',completed:'RECALLED & COMPLETED',skipped:'RECALLED · MISSED AGAIN'}[shownStatus]||tfn(shownStatus)):tfn(shownStatus);
  $('track-state').style.color=shownStatus==='called'?'#095c46':'';
  $('ahead-label').textContent=tfn(validWait?'ahead':'queueStatus');
  $('ahead-count').textContent=validWait?ahead:shownStatus==='called'?'↗':shownStatus==='syncing'?'…':'✓';
  $('track-eta').textContent=validWait?(doctorQueue.paused?tfn('paused'):tfn('minutes',{n:estimate.range.join('–')})):'—';
  const eta=validWait&&!doctorQueue.paused?approximateTurnTime(estimate):null;
  $('track-eta-clock').textContent=eta?`Around ${eta.clock} (PKT) · estimate only`:'';
  $('track-serving').textContent=doctorQueue?.active?.code||'—';
  $('track-message').textContent=shownStatus==='called'?tfn('turnMessage',{counter:t.calledCounter||'reception'}):shownStatus==='waiting'&&t.recallCount?'Your ticket has been recalled. You are back in the queue for your doctor.':shownStatus==='completed'&&t.recallCount?'Your recalled turn was completed. Thank you for visiting.':shownStatus==='skipped'&&t.recallCount?'Your recalled turn was marked missed again. Please ask reception for help.':legacy?'This uses the older queue system. Please request a new QR ticket.':doctorQueue?.paused&&validWait?tfn('paused'):tfn(({waiting:'pleaseWait',completed:'completedMessage',skipped:'missedMessage'}[shownStatus]||shownStatus));
  const pct=validWait?Math.max(10,Math.min(95,Math.round(100/(ahead+1)))):shownStatus==='called'||shownStatus==='completed'?100:0;
  const progress=$('track-progress-bar').parentElement;progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Approximate queue progress');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');progress.setAttribute('aria-valuenow',String(pct));progress.setAttribute('aria-valuetext',validWait?ahead+' ahead':shownStatus);
  const delay=$('track-delay');delay.hidden=!validWait||(!doctorQueue.paused&&!doctorQueue.pauseReason);delay.textContent=doctorQueue?.paused?'Queue paused. Please wait for reception to resume.':({'running-late':'Doctor is running behind schedule.','unexpected-delay':'Unexpected delay. Please remain near reception.','extended-service':'Current appointment is taking longer than expected.'}[doctorQueue?.pauseReason]||'');
  if(!delay.textContent)delay.hidden=true;
  $('track-progress-bar').style.width=`${pct}%`;
  $('progress-description').textContent=validWait?`${ahead===0?'You are next in line.':`${ahead} ${ahead===1?'person':'people'} ahead of you.`} Times can change; stay near reception.`:messages[shownStatus]||'';
  if(hadLoaded&&lastStatus!=='called'&&shownStatus==='called'&&vibrationEnabled&&typeof navigator.vibrate==='function'&&document.visibilityState==='visible'){
    navigator.vibrate([280,120,280,120,380]);
  }
  if(hadLoaded&&alerts&&'Notification' in window&&Notification.permission==='granted'){
    if(lastStatus!=='called'&&shownStatus==='called')notify('Your turn is ready',`${t.code} — please return to ${t.queueName}.`);
    else if(validWait&&ahead>0&&ahead<=2&&(lastAhead===null||lastAhead>2)&&!session.getItem('ta-near-'+ticketId+'-'+(t.recallCount||0))){
      notify('Almost your turn',`${ahead} ahead of ${t.code}. Stay nearby.`);session.setItem('ta-near-'+ticketId+'-'+(t.recallCount||0),'yes');
    }
  }
  showNearTurn(t,shownStatus,validWait?ahead:null);renderFeedback(status);
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
  const phase=`turnahead-v26-near:${hospitalId}:${ticketId}:${ticket.recallCount||0}`;
  const key=`${phase}:${kind}`;
  const previously=session.getItem(key);
  if(previously||currentlyShown&&milestonePriority[currentlyShown]>=milestonePriority[kind])return;
  if(kind==='near'&&(session.getItem(`${phase}:next`)||session.getItem(`${phase}:called`)))return;
  if(kind==='next'&&session.getItem(`${phase}:called`))return;
  session.setItem(key,'1');currentlyShown=kind;
  $('near-popup-title').textContent=tfn('alert'+kind.charAt(0).toUpperCase()+kind.slice(1));
  $('near-popup-text').textContent=tfn('alert'+kind.charAt(0).toUpperCase()+kind.slice(1)+'Text',kind==='called'?{counter:ticket.calledCounter||'reception'}:{n:kind==='next'?1:Math.max(2,ahead)});
  nearModal.hidden=false;$('near-popup-close').focus({preventScroll:true});
}
$('near-popup-close').addEventListener('click',()=>{nearModal.hidden=true;currentlyShown=null;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){
  if(!feedbackSuccess.hidden){e.preventDefault();closeFeedbackSuccess();}
  else if(!feedbackModal.hidden){e.preventDefault();closeFeedback();}
  else if(!nearModal.hidden){e.preventDefault();nearModal.hidden=true;currentlyShown=null;}
}});
/** Save without holding the patient in a blocking modal; confirm only after Firestore acknowledges. */
const feedbackModal=$('feedback-popup');
const feedbackProgress=$('feedback-progress');
const feedbackSuccess=$('feedback-success');
const feedbackSeenKey='turnahead-v262-feedback-seen:'+hospitalId+':'+ticketId;
const feedbackSubmittedKey='turnahead-v26-feedback:'+hospitalId+':'+ticketId;
let feedbackSending=false,feedbackSuccessTimer=null;
function closeFeedback(){
  if(feedbackSending)return;
  feedbackModal.hidden=true;
  persistent.setItem(feedbackSeenKey,'yes');
  $('feedback-close').blur();
}
function closeFeedbackSuccess(){
  clearTimeout(feedbackSuccessTimer);
  feedbackSuccessTimer=null;
  feedbackSuccess.hidden=true;
  if(document.activeElement===$('feedback-success-close'))$('feedback-success-close').blur();
}
function showFeedbackSuccess(){
  feedbackModal.hidden=true;
  feedbackProgress.hidden=true;
  feedbackSuccess.hidden=false;
  $('feedback-success-close').focus({preventScroll:true});
  clearTimeout(feedbackSuccessTimer);
  feedbackSuccessTimer=setTimeout(closeFeedbackSuccess,5000);
}
function renderFeedback(status){
  if(legacy||status!=='completed'||document.visibilityState!=='visible'||feedbackSending||!feedbackModal.hidden||!feedbackSuccess.hidden)return;
  if(persistent.getItem(feedbackSeenKey)==='yes'||persistent.getItem(feedbackSubmittedKey)==='yes')return;
  // Completion takes priority over the near-turn alert.
  nearModal.hidden=true;currentlyShown=null;
  feedbackModal.hidden=false;
  $('feedback-state').textContent='';
  feedbackModal.querySelector('input[name=rating]')?.focus({preventScroll:true});
}
$('feedback-close').addEventListener('click',closeFeedback);
$('feedback-success-close').addEventListener('click',closeFeedbackSuccess);
$('feedback-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(feedbackSending)return;
  if(!navigator.onLine){$('feedback-state').textContent='You are offline. Reconnect before sending feedback.';return;}
  const form=e.currentTarget,b=form.querySelector('[type=submit]');
  const rating=form.querySelector('input[name=rating]:checked')?.value;
  feedbackSending=true;
  b.disabled=true;
  $('feedback-state').textContent='';
  // Leave the tracking page usable while the network confirms the write.
  feedbackModal.hidden=true;
  feedbackProgress.hidden=false;
  try{
    await submitFeedback(hospitalId,ticketId,Number(rating),$('feedback-note').value);
    persistent.setItem(feedbackSubmittedKey,'yes');
    persistent.setItem(feedbackSeenKey,'yes');
    showFeedbackSuccess();
  }catch(err){
    feedbackProgress.hidden=true;
    feedbackModal.hidden=false;
    $('feedback-state').textContent=err?.code==='permission-denied'?'Feedback was not saved. Hospital feedback permissions may need the updated Firestore rules. Ask the administrator to check the deployment.':'Feedback was not saved. Please try again. '+helpfulError(err);
    $('feedback-state').focus({preventScroll:true});
  }finally{
    feedbackSending=false;
    b.disabled=false;
  }
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
  if(!legacy)getHospital(hospitalId).then(h=>{facility=h.name;applyHospitalBrand(h);update();}).catch(err=>console.warn('Hospital name unavailable:',helpfulError(err)));
  observeTicket(hospitalId,ticketId,(t,meta)=>{
    if(!t){if(meta?.fromCache){syncTicket(true);return;}missingTicket();return;}
    applyTicket(t);
    if(t._fromCache)syncTicket(true);
  },err=>{console.warn(helpfulError(err));$('sync-state').textContent='RECONNECTING…';syncTicket(true);});
  // Safari can suspend listeners while the device is locked. Recheck from the server
  // when the page resumes, and periodically while visible. These are bounded reads.
  const resume=()=>{if(document.visibilityState==='visible'){syncTicket(true);update();}};
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pageshow',resume);
  window.addEventListener('focus',resume);
  window.addEventListener('online',()=>syncTicket(true));
  window.addEventListener('offline',setSyncStatus);
  setInterval(()=>{setSyncStatus();if(document.visibilityState==='visible'){
    if(!missingConfirmed&&!['completed','expired'].includes(currentTicket?.status)&&Date.now()-lastConfirmed>60000)syncTicket();
    if(currentTicket)update();
  }},15000);
}

$('save-ticket').addEventListener('click',()=>{if(!currentTicket||missingConfirmed)return;const img=$('saved-ticket-qr');try{const url=new URL(location.pathname,location.origin);url.searchParams.set('ticket',ticketId);if(hospitalId)url.searchParams.set('hospital',hospitalId);img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(window.turnaheadQR.svg(url.href));img.hidden=false;window.print();}catch{window.print();}});window.addEventListener('afterprint',()=>{const img=$('saved-ticket-qr');img.hidden=true;img.removeAttribute('src');});
