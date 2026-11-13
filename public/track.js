import {configured,helpfulError} from './firebase.js';
import {getHospital} from './org-store.js';
import {observeTicket,observeQueue} from './store.js';
import {dayKey,waitingEstimate,effectiveTicketStatus,approximateTurnTime} from './queue-engine.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const ticketId=params.get('ticket'),hospitalId=params.get('hospital');
const legacy=!hospitalId;
let facility='Your hospital',currentTicket=null,currentQueue=null,stopQueue=null,alerts=false,hadLoaded=false,lastStatus='',lastAhead=null;
const messages={waiting:'Your place updates as reception calls each patient.',called:"It's your turn. Please go to your service counter.",completed:'Your visit was marked completed. Thank you for coming.',skipped:'Reception marked this turn as missed. Please ask them for help.',syncing:'Checking the latest status with reception…',expired:'This ticket belongs to an earlier day. Please ask reception for a new one.'};
function fail(message){$('track-error').textContent=message;$('track-error').hidden=false;$('track-content').hidden=true;}
function update(){
  const t=currentTicket,q=currentQueue;
  if(!t)return;
  const status=effectiveTicketStatus(t,q,dayKey());
  if(!q&&['waiting','called'].includes(status))return;
  const waiting=status==='waiting',estimate=waiting&&q?waitingEstimate(q,t.number):null;
  const validWait=Boolean(waiting&&estimate);
  const shownStatus=waiting&&!validWait?'syncing':status;
  const ahead=validWait?estimate.peopleAhead:null;
  $('track-error').hidden=true;$('track-content').hidden=false;
  $('track-code').textContent=t.code;
  $('track-queue').textContent=`${facility} · ${q?.name||t.queueName}`;
  $('track-patient').textContent=t.patientName?`Ticket for ${t.patientName}`:'Patient name not recorded on this older ticket';
  $('track-state').textContent=shownStatus==='called'?'YOUR TURN':shownStatus==='syncing'?'UPDATING…':shownStatus.toUpperCase();
  $('track-state').style.color=shownStatus==='called'?'#095c46':'';
  $('ahead-label').textContent=validWait?'PEOPLE AHEAD OF YOU':'QUEUE STATUS';
  $('ahead-count').textContent=validWait?ahead:shownStatus==='called'?'↗':shownStatus==='syncing'?'…':'✓';
  $('track-eta').textContent=validWait?(q.paused?'Paused':estimate.range.join('–')+' min'):'—';
  const eta=validWait&&!q.paused?approximateTurnTime(estimate):null;
  $('track-eta-clock').textContent=eta?`Around ${eta.clock} (PKT) · estimate only`:'';
  $('track-serving').textContent=q?.active?.code||'—';
  $('track-message').textContent=legacy?'This uses the older queue system. Please request a new QR ticket.':q?.paused&&validWait?'This queue is paused. Check with reception.':messages[shownStatus]||'Please speak with reception.';
  const pct=validWait?Math.max(10,Math.min(92,Math.round(100/(ahead+1)))):shownStatus==='syncing'?65:100;
  $('track-progress-bar').style.width=`${pct}%`;
  $('progress-description').textContent=validWait?`${ahead===0?'You are next in line.':`${ahead} ${ahead===1?'person':'people'} ahead of you.`} Times can change; stay near reception.`:messages[shownStatus]||'';
  if(hadLoaded&&alerts&&Notification.permission==='granted'){
    if(lastStatus!=='called'&&shownStatus==='called')notify('Your turn is ready',`${t.code} — please return to ${t.queueName}.`);
    else if(validWait&&ahead>0&&ahead<=2&&(lastAhead===null||lastAhead>2)&&!sessionStorage.getItem('ta-near-'+ticketId)){
      notify('Almost your turn',`${ahead} ahead of ${t.code}. Stay nearby.`);sessionStorage.setItem('ta-near-'+ticketId,'yes');
    }
  }
  lastStatus=shownStatus;lastAhead=ahead;hadLoaded=true;
}
function notify(title,body){new Notification('TurnAhead: '+title,{body,icon:'./assets/favicon.png'});}
$('enable-alerts').addEventListener('click',async()=>{
  if(!('Notification' in window)){$('alert-state').textContent='Browser notifications are not supported here.';return;}
  if(!window.isSecureContext){$('alert-state').textContent='Notifications require HTTPS.';return;}
  alerts=(await Notification.requestPermission())==='granted';
  $('alert-state').textContent=alerts?'Alerts are enabled while this page stays open.':'Browser alerts were not enabled.';
  $('enable-alerts').textContent=alerts?'Alerts enabled ✓':'Enable browser alerts ↗';
});
if(!configured)fail('This website is not connected to Firebase yet. Please contact reception.');
else if(!ticketId||!/^[A-Za-z0-9]{20}$/.test(ticketId)||(hospitalId&&!/^[A-Za-z0-9]{20}$/.test(hospitalId)))
  fail('No valid ticket was supplied. Scan the QR code on your receipt to open your queue status.');
else{
  if(!legacy)getHospital(hospitalId).then(h=>{facility=h.name;update();}).catch(err=>console.warn('Hospital name unavailable:',helpfulError(err)));
  observeTicket(hospitalId,ticketId,t=>{
    if(!t){fail('Ticket not found. Check your QR code or ask reception.');return;}
    currentTicket=t;
    if(currentQueue?.id!==t.queueId){
      stopQueue?.();currentQueue=null;
      stopQueue=observeQueue(hospitalId,t.queueId,q=>{
        if(!q){if(['completed','skipped'].includes(t.status))update();else fail('This department is currently unavailable.');}
        else{currentQueue=q;update();}
      },err=>fail(helpfulError(err)));
    }
    update();
  },err=>fail(helpfulError(err)));
  // Update the approximate clock without causing extra Firebase reads.
  setInterval(()=>{if(document.visibilityState==='visible'&&currentTicket)update();},20000);
}
