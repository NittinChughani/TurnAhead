import {configured, helpfulError} from './firebase.js';
import {facility,observeQueues} from './store.js';
import {dayKey} from './queue-engine.js';
const {esc}=window.turnahead;
const el=document.getElementById('board-grid');
document.getElementById('board-facility').textContent=`${facility} · Live queue overview`;
if(!configured)el.innerHTML='<div class="empty-state">Live queue not connected yet. The organization must configure Firebase before opening its public board.</div>';
else observeQueues(queues=>{
  el.innerHTML=queues.map(q=>{if(q.dayKey!==dayKey())return `<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>NEW DAY</span></div><div class="board-card-middle"><small>QUEUE NOT STARTED</small><strong>—</strong></div><div class="board-card-bottom"><span>People waiting</span><b>0</b></div></article>`;return `<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>${q.paused?'PAUSED':'LIVE'}</span></div><div class="board-card-middle"><small>NOW SERVING</small><strong>${esc(q.active?.code||'—')}</strong></div><div class="board-card-bottom"><span>People waiting</span><b>${q.waiting}</b></div></article>`;}).join('')||'<div class="empty-state">No service queues configured yet. Reception can create the first department.</div>';
},err=>{el.innerHTML=`<div class="empty-state">Unable to load the live queue. ${esc(helpfulError(err))}</div>`;});
