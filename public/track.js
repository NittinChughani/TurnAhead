import {configured, helpfulError} from './firebase.js';
import {getHospital} from './org-store.js';
import {observeTicket,observeQueue} from './store.js';
import {dayKey,waitingEstimate} from './queue-engine.js';
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const ticketId=query.get('ticket'),hospitalId=query.get('hospital');
const legacy=!hospitalId;
let facility='Your hospital';
let currentTicket=null,currentQueue=null,stopQueue=null,alerts=false,hadLoaded=false,lastStatus='',lastAhead=null;
const messages={waiting:'Your place will update as reception calls the next person.',called:"It's your turn. Please go to your service counter.",completed:'Your queue visit has been marked as complete.',skipped:'This number was skipped. Please speak with reception.',expired:'This ticket belongs to an earlier day. Please ask reception for a new one.'};
function fail(message){$('track-error').textContent=message;$('track-error').hidden=false;$('track-content').hidden=true;}
function update(){
  if(!currentTicket||!currentQueue)return;
  const t=currentTicket,q=currentQueue;
  const status=t.dayKey!==dayKey()||t.dayKey!==q.dayKey?'expired':t.status;
  const waiting=status==='waiting',estimate=waiting?waitingEstimate(q,t.number):null;
  if(waiting&&!estimate){fail('This ticket is no longer in the active queue. Please speak to reception.');return;}
  const ahead=estimate?.peopleAhead??null;
  $('track-error').hidden=true;$('track-content').hidden=false;
  $('track-code').textContent=t.code;$('track-queue').textContent=`${facility} · ${q.name}`;
  $('track-state').textContent=status==='called'?'YOUR TURN':status.toUpperCase();
  $('track-state').style.color=status==='called'?'#095c46':'';
  $('ahead-label').textContent=waiting?'PEOPLE AHEAD OF YOU':'QUEUE STATUS';
  $('ahead-count').textContent=waiting?ahead:status==='called'?'↗':'✓';
  $('track-eta').textContent=waiting?(q.paused?'Paused':estimate.range.join('–')+' min'):'—';
  $('track-serving').textContent=q.active?.code||'—';
  $('track-message').textContent=legacy?'This ticket uses the older queue system. Its status is no longer updated. Please request a new QR ticket from reception.':q.paused&&waiting?'This queue is currently paused. Please check with reception.':messages[status]||'Please speak with reception.';
  const pct=waiting?Math.max(10,Math.min(92,Math.round(100/(ahead+1)))):100;
  $('track-progress-bar').style.width=`${pct}%`;
  $('progress-description').textContent=legacy?'Legacy ticket — live tracking is unavailable after the hospital upgrade.':waiting?`${ahead===0?'You are next in line.':`${ahead} ${ahead===1?'person':'people'} ahead of you.`} Waiting times may change as appointments take longer or shorter.`:messages[status]||'';
  if(hadLoaded&&alerts&&Notification.permission==='granted'){
    if(lastStatus==='waiting'&&status==='called')notify('Your turn is ready',`${t.code} — please return to ${q.name}.`);
    else if(waiting && ahead>0 && ahead<=2 && (lastAhead===null||lastAhead>2) && !sessionStorage.getItem('ta-near-'+ticketId)){
      notify('Almost your turn',`${ahead} ahead of ${t.code}. Stay nearby.`);sessionStorage.setItem('ta-near-'+ticketId,'yes');
    }
  }
  lastStatus=status;lastAhead=ahead;hadLoaded=true;
}
function notify(title,body){new Notification('TurnAhead: '+title,{body,icon:'./assets/favicon.png'});}
$('enable-alerts').addEventListener('click',async()=>{
  if(!('Notification' in window)){$('alert-state').textContent='Browser notifications are not supported here.';return;}
  if(!window.isSecureContext){$('alert-state').textContent='Notifications require HTTPS.';return;}
  const result=await Notification.requestPermission();alerts=result==='granted';
  $('alert-state').textContent=alerts?'Alerts are enabled while this page stays open.':'Browser alerts were not enabled.';
  $('enable-alerts').textContent=alerts?'Alerts enabled ✓':'Enable browser alerts ↗';
});
if(!configured) fail('This website is not connected to Firebase yet. Please contact reception.');
else if(!ticketId||!/^[A-Za-z0-9]{20}$/.test(ticketId)||(hospitalId&&!/^[A-Za-z0-9]{20}$/.test(hospitalId)))
  fail('No valid ticket was supplied. Scan the QR code on your receipt to open your queue status.');
else (async()=>{
  if(!legacy){
    try{facility=(await getHospital(hospitalId)).name;}
    catch(e){fail(helpfulError(e));return;}
  }
  observeTicket(hospitalId,ticketId,t=>{
    if(!t){fail('We could not find that ticket. Please check your QR code or ask reception.');return;}
    currentTicket=t;
    if(currentQueue?.id!==t.queueId){
      stopQueue?.();currentQueue=null;
      stopQueue=observeQueue(hospitalId,t.queueId,q=>{
        if(!q)fail('This service queue is no longer available.');
        else{currentQueue=q;update();}
      },e=>fail(helpfulError(e)));
    } else update();
  },e=>fail(helpfulError(e)));
})();
