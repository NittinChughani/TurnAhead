import {configured,helpfulError} from './firebase.js';
import {watchHospital} from './org-store.js?v=3.2.0';
import {hospitalCustomization,applyHospitalBrand} from './hospital-custom.js?v=3.1.0';
import {observeQueues} from './store.js?v=3.2.0';
import {dayKey,displayClock,doctorActiveCodes} from './queue-engine.js';
import {t,bindLanguage} from './locale.js?v=2.6.1';
import {announcementChanges} from './v26-engine.js?v=2.6.1';
const {esc}=window.turnahead,el=document.getElementById('board-grid');
const hospitalId=new URLSearchParams(location.search).get('hospital');
let boardConfirmed=false;
function boardConnection(){const node=document.getElementById('board-connection');node.textContent=!navigator.onLine?'OFFLINE · LAST KNOWN DATA':boardConfirmed?'LIVE · SYNCED':'RECONNECTING · LAST KNOWN DATA';node.dataset.state=boardConfirmed&&navigator.onLine?'live':'paused';}
window.addEventListener('offline',()=>{boardConfirmed=false;boardConnection();});window.addEventListener('online',boardConnection);
let displayedQueues=[],displayedDate=dayKey(),lastActive=new Map(),boardReady=false,voiceEnabled=false;
const voiceButton=document.getElementById('board-voice-toggle'),voiceState=document.getElementById('board-voice-state');
const synth=window.speechSynthesis;
const pendingCalls=[];
const MAX_QUEUED_CALLS=10;
const MAX_QUEUED_AGE_MS=120000;
let currentUtterance=null,utteranceTimer=null;
function clock(){
  document.getElementById('board-time').textContent=displayClock(new Date());
}
clock();setInterval(()=>{clock();const today=dayKey();if(today!==displayedDate){displayedDate=today;renderBoard(displayedQueues);}},1000);
function renderBoard(queues){
 el.innerHTML=queues.map(q=>{
   if(q.dayKey!==dayKey())return `<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>NEW DAY</span></div><div class="board-card-middle"><small>${esc(t('boardNewDay'))}</small><strong>—</strong></div><div class="board-card-bottom"><span>${esc(t('boardWait'))}</span><b>0</b></div></article>`;
   const serving=doctorActiveCodes(q);
   const codes=serving.length?serving.slice(0,5).map(x=>`<span class="board-code-chip"><b>${esc(x.code)}</b><small>${esc(x.counter||'Reception')}</small></span>`).join(''):q.active?.code?`<span class="board-code-chip">${esc(q.active.code)}</span>`:'<strong>—</strong>';
   return `<article class="board-card"><div class="board-card-top">${esc(q.name)} <span>${q.paused?'PAUSED':'LIVE'}</span></div><div class="board-card-middle"><small>NOW SERVING · ${serving.length} DOCTOR${serving.length===1?'':'S'}</small><div class="board-active-codes">${codes}</div></div><div class="board-card-bottom"><span>${esc(t('boardWait'))}</span><b>${q.waiting}</b></div></article>`;
 }).join('')||'<div class="empty-state">No departments configured yet.</div>';
}
/** Speak on the public display after a user gesture has enabled sound. */
function speakText(text,onFinish=()=>{}){
  if(!synth||!('SpeechSynthesisUtterance' in window))return false;
  const utterance=new SpeechSynthesisUtterance(text);
  const voices=synth.getVoices();
  const voice=voices.find(v=>v.lang.toLowerCase().startsWith('en-pk'))||
    voices.find(v=>v.lang.toLowerCase().startsWith('en'));
  if(voice)utterance.voice=voice;
  utterance.lang=voice?.lang||'en-US';utterance.rate=.9;
  currentUtterance=utterance;
  function finish(){
    if(currentUtterance!==utterance)return;
    clearTimeout(utteranceTimer);utteranceTimer=null;
    currentUtterance=null;onFinish();
  }
  utterance.onend=finish;
  utterance.onerror=()=>{
    voiceState.textContent='Voice playback was interrupted. Keep this board open and try a new call.';
    finish();
  };
  try{
    // Some browsers pause synthesis after a tab has been backgrounded.
    if(synth.paused)synth.resume();
    synth.speak(utterance);
    utteranceTimer=setTimeout(()=>{if(currentUtterance===utterance){synth.cancel();finish();}},20000);
    return true;
  }catch(err){console.warn('Board announcement unavailable:',err);finish();return false;}
}
function flushAnnouncements(){
  if(!voiceEnabled||!synth||document.hidden||currentUtterance)return;
  const cutoff=Date.now()-MAX_QUEUED_AGE_MS;
  while(pendingCalls.length&&pendingCalls[0].queuedAt<cutoff)pendingCalls.shift();
  const item=pendingCalls.shift();
  if(!item)return;
  const spokenCode=item.code.replace(/[^A-Za-z0-9]/g,'').split('').join(' ');
  const phrase=`Ticket ${spokenCode}, please proceed to ${item.counter}.`;
  if(!speakText(phrase,()=>{
    voiceState.textContent=`Last announced: ${item.code} · ${item.counter}`;
    flushAnnouncements();
  })){
    pendingCalls.unshift(item);
    voiceState.textContent='Voice could not start. Tap Enable announcements again.';
  }
}
function checkCalls(queues){
  const {current,calls}=announcementChanges(lastActive,queues,dayKey());
  if(boardReady&&voiceEnabled){
    for(const item of calls){
      pendingCalls.push({...item,queuedAt:Date.now()});
    }
    if(pendingCalls.length>MAX_QUEUED_CALLS)pendingCalls.splice(0,pendingCalls.length-MAX_QUEUED_CALLS);
    flushAnnouncements();
  }
  lastActive=current;
  boardReady=true;
}
voiceButton.addEventListener('click',()=>{
  if(!synth||!('SpeechSynthesisUtterance' in window)){
    voiceState.textContent=t('voiceUnavailable');return;
  }
  voiceEnabled=!voiceEnabled;
  pendingCalls.length=0;
  clearTimeout(utteranceTimer);utteranceTimer=null;
  currentUtterance=null;
  synth.cancel();
  if(voiceEnabled){
    voiceState.textContent='Sound enabled. New patient calls will be spoken aloud.';
    speakText('Announcements enabled.',flushAnnouncements);
  }else{
    voiceState.textContent=t('voiceOff');
  }
  voiceButton.textContent=t(voiceEnabled?'voiceMute':'voiceEnable');
});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&voiceEnabled){
    // Browser tabs used for reception often hide the public board while staff call.
    // Replay the queued fresh calls once this board is visible again.
    if(synth?.paused)synth.resume();
    flushAnnouncements();
  }
});
bindLanguage();
function startBoard(){
  if(!configured){el.innerHTML='<div class="empty-state">TurnAhead is not connected to Firebase yet.</div>';return;}
  if(!/^[A-Za-z0-9]{20}$/.test(hospitalId||'')){
    document.getElementById('board-facility').textContent='Every hospital has its own public board link.';
    el.innerHTML='<div class="empty-state">Ask reception for its hospital-specific board URL.</div>';return;
  }
  watchHospital(hospitalId,h=>{
    const c=hospitalCustomization(h);applyHospitalBrand(h);document.body.classList.toggle('board-large-layout',c.boardLayout==='large');
    const message=document.getElementById('board-custom-message');message.textContent=c.boardMessage;message.hidden=!c.boardMessage;
    document.getElementById('board-facility').textContent=`${h.name} · Live queue overview`;
  },e=>{document.getElementById('board-facility').textContent=helpfulError(e);});
  observeQueues(hospitalId,(queues,meta)=>{boardConfirmed=Boolean(meta?.confirmed);boardConnection();if(boardConfirmed)checkCalls(queues);displayedQueues=queues;displayedDate=dayKey();renderBoard(queues);
  },err=>{boardConfirmed=false;boardConnection();el.innerHTML=`<div class="empty-state">Unable to load the queue. ${esc(helpfulError(err))}</div>`;});
}
startBoard();
