import {configured,helpfulError} from './firebase.js';
import {getHospital} from './org-store.js';
import {observeQueues} from './store.js';
import {dayKey,displayClock,doctorActiveCodes} from './queue-engine.js';
import {t,language,bindLanguage} from './locale.js';
import {activeAnnouncements} from './v26-engine.js';
const {esc}=window.turnahead,el=document.getElementById('board-grid');
const hospitalId=new URLSearchParams(location.search).get('hospital');
let displayedQueues=[],displayedDate=dayKey(),lastActive=new Map(),boardReady=false,voiceEnabled=false;
const voiceButton=document.getElementById('board-voice-toggle'),voiceState=document.getElementById('board-voice-state');
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
function announce(queueCode,counter){
  if(!voiceEnabled||!('speechSynthesis' in window)||document.hidden)return;
  const text=language()==='ur'?`ٹکٹ ${queueCode}، ${counter} پر تشریف لائیں۔`:`Ticket ${queueCode.split('').join(' ')}, please proceed to ${counter}.`;
  const utterance=new SpeechSynthesisUtterance(text);
  const voices=window.speechSynthesis.getVoices();
  const voice=voices.find(v=>v.lang.toLowerCase().startsWith(language()==='ur'?'ur':'en-pk')) || voices.find(v=>v.lang.toLowerCase().startsWith('en'));
  if(voice)utterance.voice=voice;
  utterance.lang=voice?.lang||'en-US';utterance.rate=.9;
  window.speechSynthesis.speak(utterance);
}
function checkCalls(queues){
 const current=new Map(activeAnnouncements(queues).map(x=>[x.key,x]));
 if(boardReady){for(const [key,item] of current){
   if(lastActive.get(key)!==item.code)announce(item.code,item.counter);
 }}
 lastActive=new Map([...current].map(([key,item])=>[key,item.code]));boardReady=true;
}
voiceButton.addEventListener('click',()=>{
  if(!('speechSynthesis' in window)){voiceState.textContent=t('voiceUnavailable');return;}
  voiceEnabled=!voiceEnabled;
  if(!voiceEnabled)window.speechSynthesis.cancel();
  else{const primer=new SpeechSynthesisUtterance(language()==='ur'?'اعلانات فعال ہیں۔':'Announcements enabled.');primer.volume=.5;window.speechSynthesis.speak(primer);}
  voiceButton.textContent=t(voiceEnabled?'voiceMute':'voiceEnable');
  voiceState.textContent=t(voiceEnabled?'voiceOn':'voiceOff');
});
bindLanguage(()=>{renderBoard(displayedQueues);voiceButton.textContent=t(voiceEnabled?'voiceMute':'voiceEnable');});
function startBoard(){
  if(!configured){el.innerHTML='<div class="empty-state">TurnAhead is not connected to Firebase yet.</div>';return;}
  if(!/^[A-Za-z0-9]{20}$/.test(hospitalId||'')){
    document.getElementById('board-facility').textContent='Every hospital has its own public board link.';
    el.innerHTML='<div class="empty-state">Ask reception for its hospital-specific board URL.</div>';return;
  }
  getHospital(hospitalId).then(h=>{
    document.getElementById('board-facility').textContent=`${h.name} · Live queue overview`;
  }).catch(e=>{document.getElementById('board-facility').textContent=helpfulError(e);});
  observeQueues(hospitalId,queues=>{checkCalls(queues);displayedQueues=queues;displayedDate=dayKey();renderBoard(queues);
  },err=>{el.innerHTML=`<div class="empty-state">Unable to load the queue. ${esc(helpfulError(err))}</div>`;});
}
startBoard();
