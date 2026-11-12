import {configured,helpfulError} from './firebase.js';
import {getHospital} from './org-store.js';
import {observeQueues} from './store.js';
import {dayKey} from './queue-engine.js';
const {esc}=window.turnahead;
const el=document.getElementById('board-grid');
const hospitalId=new URLSearchParams(location.search).get('hospital');
async function startBoard(){
  if(!configured){el.innerHTML='<div class="empty-state">TurnAhead is not connected to Firebase yet.</div>';return;}
  if(!/^[A-Za-z0-9]{20}$/.test(hospitalId||'')){
    document.getElementById('board-facility').textContent='Every hospital has its own secure public board link.';
    el.innerHTML='<div class="empty-state">To open a live board, ask reception for its hospital-specific link. Hospital staff can copy it from their reception or administration dashboard.</div>';
    return;
  }
  try{
    // Firestore updates stream immediately while hospital metadata loads in parallel.
    getHospital(hospitalId).then(hospital=>{
      document.getElementById('board-facility').textContent=`${hospital.name} · Live queue overview`;
    }).catch(error=>{document.getElementById('board-facility').textContent=helpfulError(error);});
    observeQueues(hospitalId,queues=>{
      el.innerHTML=queues.map(q=>{
        if(q.dayKey!==dayKey())return `<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>NEW DAY</span></div><div class="board-card-middle"><small>QUEUE NOT STARTED</small><strong>—</strong></div><div class="board-card-bottom"><span>People waiting</span><b>0</b></div></article>`;
        return `<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>${q.paused?'PAUSED':'LIVE'}</span></div><div class="board-card-middle"><small>NOW SERVING</small><strong>${esc(q.active?.code||'—')}</strong></div><div class="board-card-bottom"><span>People waiting</span><b>${q.waiting}</b></div></article>`;
      }).join('')||'<div class="empty-state">No service queues configured yet. Reception can create the first department.</div>';
    },err=>{el.innerHTML=`<div class="empty-state">Unable to load the live queue. ${esc(helpfulError(err))}</div>`;});
  }catch(e){el.innerHTML=`<div class="empty-state">${esc(helpfulError(e))}</div>`;}
}
startBoard();
