'use strict';
(() => {
  const {api,listen}=window.turnahead;
  const $=id=>document.getElementById(id);
  const secret=location.pathname.split('/').filter(Boolean)[1];
  let lastStatus='';
  let alerts=false;
  let hadLoaded=false;
  const messages={waiting:'Your place will update as reception calls the next person.',called:'It\'s your turn. Please go to your service counter.',completed:'Your queue visit has been marked as complete.',skipped:'This number was skipped. Please speak with reception.',expired:'This ticket belongs to a previous day. Please ask reception for a new one.'};
  function update(s){
    $('track-content').hidden=false;$('track-error').hidden=true;
    $('track-code').textContent=s.code;
    $('track-queue').textContent=`${s.facility} · ${s.queue}`;
    $('track-state').textContent=s.status==='called'?'YOUR TURN':s.status.toUpperCase();
    $('track-state').style.color=(s.status==='called')?'#095c46':'';
    const waiting=s.status==='waiting';
    $('ahead-label').textContent=waiting?'PEOPLE AHEAD OF YOU':'QUEUE STATUS';
    $('ahead-count').textContent=waiting?s.peopleAhead:(s.status==='called'?'↗':'✓');
    $('track-eta').textContent=waiting?(s.paused?'Paused':s.estimatedMinutes?s.estimatedMinutes.join('–')+' min':'Updating'):'—';
    $('track-serving').textContent=s.nowServing||'—';
    $('track-message').textContent=s.paused&&waiting?'This queue is currently paused. Please check with reception.':messages[s.status]||'Please speak with reception.';
    const pct=waiting?Math.max(10,Math.min(92,Math.round(100/(s.peopleAhead+1)))):100;
    $('track-progress-bar').style.width=`${pct}%`;
    $('progress-description').textContent=waiting?`${s.peopleAhead===0?'You are next in line.':`${s.peopleAhead} ${s.peopleAhead===1?'person':'people'} ahead of you.`} Waiting times may change as appointments take longer or shorter.`:messages[s.status]||'';
    if(hadLoaded && alerts && lastStatus==='waiting' && s.status==='called' && Notification.permission==='granted'){
      new Notification('TurnAhead: Your turn is ready',{body:`${s.code} — please return to ${s.queue}.`,icon:'/assets/favicon.png'});
    }
    if(hadLoaded && alerts && lastStatus==='waiting' && waiting && s.peopleAhead<=2 && s.peopleAhead>0 && Notification.permission==='granted' && !sessionStorage.getItem('ta_near_'+secret)){
      new Notification('TurnAhead: Almost your turn',{body:`${s.peopleAhead} ahead of ${s.code}. Stay nearby.`,icon:'/assets/favicon.png'});
      sessionStorage.setItem('ta_near_'+secret,'yes');
    }
    lastStatus=s.status;hadLoaded=true;
  }
  async function refresh(){try{update(await api(`/api/track/${encodeURIComponent(secret)}`));}catch{$('track-error').hidden=false;$('track-content').hidden=true;}}
  $('enable-alerts').addEventListener('click',async()=>{
    if(!('Notification' in window)){$('alert-state').textContent='Browser notifications are not supported here.';return;}
    if(!window.isSecureContext){$('alert-state').textContent='Notifications require HTTPS (or localhost).';return;}
    const result=await Notification.requestPermission();alerts=result==='granted';$('alert-state').textContent=alerts?'Alerts are enabled while this page stays open.':'Browser alerts were not enabled.';
    $('enable-alerts').textContent=alerts?'Alerts enabled ✓':'Enable browser alerts ↗';
  });
  listen(()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  // Fall back to polling if network infrastructure buffers SSE events.
  setInterval(()=>{if(!document.hidden)refresh();},30000);
  refresh();
})();