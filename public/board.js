import {configured,helpfulError} from './firebase.js';
import {getHospital} from './org-store.js';
import {observeQueues} from './store.js';
import {dayKey,TIME_ZONE} from './queue-engine.js';
const {esc}=window.turnahead,el=document.getElementById('board-grid');
const hospitalId=new URLSearchParams(location.search).get('hospital');
let displayedQueues=[],displayedDate=dayKey();
function clock(){
  document.getElementById('board-time').textContent=new Intl.DateTimeFormat('en-GB',{
    timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
  }).format(new Date());
}
clock();setInterval(()=>{clock();const today=dayKey();if(today!==displayedDate){displayedDate=today;renderBoard(displayedQueues);}},1000);
function renderBoard(queues){
 el.innerHTML=queues.map(q=>{
   if(q.dayKey!==dayKey())return `<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>NEW DAY</span></div><div class="board-card-middle"><small>QUEUE NOT STARTED</small><strong>—</strong></div><div class="board-card-bottom"><span>People waiting</span><b>0</b></div></article>`;
   return `<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>${q.paused?'PAUSED':'LIVE'}</span></div><div class="board-card-middle"><small>NOW SERVING</small><strong>${esc(q.active?.code||'—')}</strong></div><div class="board-card-bottom"><span>People waiting</span><b>${q.waiting}</b></div></article>`;
 }).join('')||'<div class="empty-state">No departments configured yet.</div>';
}
function startBoard(){
  if(!configured){el.innerHTML='<div class="empty-state">TurnAhead is not connected to Firebase yet.</div>';return;}
  if(!/^[A-Za-z0-9]{20}$/.test(hospitalId||'')){
    document.getElementById('board-facility').textContent='Every hospital has its own public board link.';
    el.innerHTML='<div class="empty-state">Ask reception for its hospital-specific board URL.</div>';return;
  }
  getHospital(hospitalId).then(h=>{
    document.getElementById('board-facility').textContent=`${h.name} · Live queue overview`;
  }).catch(e=>{document.getElementById('board-facility').textContent=helpfulError(e);});
  observeQueues(hospitalId,queues=>{displayedQueues=queues;displayedDate=dayKey();renderBoard(queues);
  },err=>{el.innerHTML=`<div class="empty-state">Unable to load the queue. ${esc(helpfulError(err))}</div>`;});
}
startBoard();
