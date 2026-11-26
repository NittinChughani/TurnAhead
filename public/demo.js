const $=id=>document.getElementById(id);let tickets=[],selected=null,paused=false,seq=0;
const code=t=>'GEN-'+String(t.id).padStart(3,'0'),active=()=>tickets.find(t=>t.status==='called'),waiting=()=>tickets.filter(t=>t.status==='waiting');
function issue(){const t={id:++seq,status:'waiting'};tickets.push(t);selected=t.id;}
function render(msg=''){const a=active(),w=waiting(),t=tickets.find(t=>t.id===selected);
 $('demo-message').textContent=msg;
 $('demo-desk').innerHTML='<p>'+w.length+' waiting · '+(paused?'Doctor paused':'Doctor available')+'</p><div class="demo-list">'+tickets.map(t=>'<button type="button" data-ticket="'+t.id+'" aria-pressed="'+(t.id===selected)+'">'+code(t)+' <span>'+t.status+'</span></button>').join('')+'</div>';
 $('demo-patient').innerHTML=t?'<strong class="demo-code">'+code(t)+'</strong><p>'+t.status.toUpperCase()+'</p><p>'+(t.status==='waiting'?(paused?'Doctor paused. No new calls.':w.indexOf(t)+' waiting ahead'+(a?' · one in service':'')):t.status==='called'?'Please go to Counter 1.':t.status==='completed'?'Thank you for visiting.':'Please ask reception for help.')+'</p>':'No ticket selected.';
 $('demo-admin').innerHTML='<div class="report-kpis">'+[['Issued',tickets.length],['Waiting',w.length],['Completed',tickets.filter(t=>t.status==='completed').length],['Missed',tickets.filter(t=>t.status==='skipped').length]].map(([k,v])=>'<article class="report-kpi"><span>'+k+'</span><strong>'+v+'</strong></article>').join('')+'</div>';
 $('demo-board').innerHTML='<strong class="demo-code">'+(a?code(a):'—')+'</strong><p>'+(a?'Counter 1':'Waiting for next call')+'</p><p>'+w.length+' waiting</p>';
 $('demo-call').disabled=paused||!!a||!w.length;$('demo-complete').disabled=$('demo-skip').disabled=!a;$('demo-pause').textContent=paused?'Resume doctor':'Pause doctor';$('demo-issue').disabled=paused||tickets.length>=100;
}
$('demo-desk').addEventListener('click',e=>{const b=e.target.closest('[data-ticket]');if(b){selected=Number(b.dataset.ticket);render('Patient view updated.');}});
$('demo-issue').onclick=()=>{if(!paused&&tickets.length<100){issue();render('New simulated ticket issued.');}};
$('demo-call').onclick=()=>{if(!paused&&!active()&&waiting().length){waiting()[0].status='called';render('Next patient called.');}};
for(const [id,status] of [['demo-complete','completed'],['demo-skip','skipped']])$(id).onclick=()=>{if(active()){active().status=status;render('Visit marked '+status+'.');}};
$('demo-pause').onclick=()=>{paused=!paused;render(paused?'Doctor paused.':'Doctor resumed.');};
function reset(){tickets=[];seq=0;paused=false;issue();issue();issue();selected=2;render('Simulation ready. Select any ticket to see its patient view.');}
$('demo-reset').onclick=reset;reset();