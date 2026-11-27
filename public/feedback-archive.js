import {feedbackDay,feedbackBounds,feedbackMonthLabel,feedbackDateLabel} from './feedback-dates.js';
import {watchTodayFeedback,readFeedbackPage,discoverFeedbackMonths} from './feedback-store.js';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,action)=>{const b=node('button',text,'btn btn-small btn-outline feedback-more');b.type='button';b.addEventListener('click',action);return b;};
function entry(f){
 const date=f.createdAt?.toDate?.(),rating=Number.isInteger(f.rating)&&f.rating>=1&&f.rating<=5?f.rating:null;
 const item=node('article',undefined,'feedback-entry'),top=node('div',undefined,'feedback-entry-top');
 const stars=node('span',rating?'★'.repeat(rating)+'☆'.repeat(5-rating):'Rating unavailable','feedback-stars');stars.setAttribute('aria-label',rating?rating+' out of 5 stars':'Rating unavailable');
 top.append(stars,node('span',rating?rating+' / 5':'—','feedback-rating'));
 if(date instanceof Date&&Number.isFinite(+date)){const time=node('time',feedbackDateLabel(date));time.dateTime=date.toISOString();top.append(time);}
 item.append(top,node('p',f.note||'No written comment'));return item;
}
export function bindFeedbackArchive(){
 const host=document.getElementById('feedback-list');
 let hid=null,day=null,epoch=0,off=null,timer=null,active=false,todayList=null,monthsList=null,olderButton=null,todayMore=null,monthBefore=null,monthsBusy=false;
 let todayHead=[],todayTail=[],todayCursor=null,todayHasMore=false,todayBusy=false,monthPanels=new Map(),firstSnapshot=true;
 function valid(g){return active&&g===epoch;}
 function pause(){active=false;epoch++;off?.();off=null;clearInterval(timer);timer=null;}
 function stop(){pause();hid=null;day=null;todayHead=[];todayTail=[];monthPanels.clear();host.replaceChildren();}
 function paintToday(){const rows=new Map();for(const f of [...todayHead,...todayTail])rows.set(f.id,f);todayList.replaceChildren();for(const f of rows.values())todayList.append(entry(f));if(!rows.size)todayList.append(node('p','No feedback received today.','empty-state'));todayMore.hidden=!todayHasMore;todayMore.disabled=todayBusy;}
 async function moreToday(){if(todayBusy||!todayHasMore)return;const g=epoch;todayBusy=true;todayMore.disabled=true;try{const p=await readFeedbackPage(hid,day,null,todayCursor);if(!valid(g))return;todayTail.push(...p.records);todayCursor=p.cursor;todayHasMore=p.more;paintToday();}catch(e){if(valid(g)){todayMore.textContent='Retry loading more feedback';}}finally{if(valid(g)){todayBusy=false;todayMore.disabled=false;}}}
 function addMonth(month){
  if(monthPanels.has(month))return;
  const panel=node('details',undefined,'feedback-month');panel.dataset.feedbackMonth=month;
  const summary=node('summary'),label=node('div');label.append(node('strong',feedbackMonthLabel(month)),node('small',' · View responses'));summary.append(label,node('i',undefined,'history-chevron'));
  const body=node('div',undefined,'feedback-month-body'),list=node('div',undefined,'feedback-month-list');list.append(node('p','Expand to load feedback.','empty-state'));
  const state={cursor:null,loaded:false,busy:false,more:true};const more=button('Load more responses',load);more.hidden=true;
  async function load(){if(state.busy||!state.more||!valid(generation))return;state.busy=true;more.disabled=true;if(!state.loaded)list.textContent='Loading feedback…';
   try{const p=await readFeedbackPage(hid,day,month,state.cursor);if(!valid(generation))return;if(!state.loaded)list.replaceChildren();for(const f of p.records)list.append(entry(f));state.loaded=true;state.cursor=p.cursor;state.more=p.more;more.hidden=!p.more;more.textContent='Load more responses';if(!list.children.length)list.append(node('p','No feedback for this period.','empty-state'));}
   catch(e){if(valid(generation)){if(!state.loaded)list.textContent='Feedback could not be loaded.';more.textContent='Retry';more.hidden=false;}}
   finally{if(valid(generation)){state.busy=false;more.disabled=false;}}
  }
  const generation=epoch;
  panel.addEventListener('toggle',()=>{if(!panel.open)return;for(const other of monthPanels.values())if(other!==panel)other.open=false;if(!state.loaded)load();});
  body.append(list,more);panel.append(summary,body);monthPanels.set(month,panel);monthsList.append(panel);
 }
 async function moreMonths(){if(monthsBusy||!valid(epoch))return;const g=epoch;monthsBusy=true;olderButton.disabled=true;olderButton.textContent='Finding months…';
  try{const p=await discoverFeedbackMonths(hid,monthBefore);if(!valid(g))return;monthsList.querySelector('.empty-state')?.remove();for(const m of p.months)addMonth(m);monthBefore=p.before;olderButton.hidden=!p.more;olderButton.textContent='Show earlier months';if(!monthPanels.size)monthsList.append(node('p','No feedback from previous dates.','empty-state'));}
  catch(e){if(valid(g)){olderButton.textContent='Retry loading months';olderButton.hidden=false;}}
  finally{if(valid(g)){monthsBusy=false;olderButton.disabled=false;}}
 }
 function open(id){
  if(active&&hid===id&&day===feedbackDay())return;
  stop();hid=id;day=feedbackDay();active=true;const g=epoch;monthBefore=feedbackBounds(day).start;monthsBusy=false;todayBusy=false;todayCursor=null;todayHasMore=false;firstSnapshot=true;
  const todayHeading=node('div',undefined,'feedback-heading');todayHeading.append(node('h3','Today’s feedback'),node('small',day));
  todayList=node('div',undefined,'feedback-today');todayList.textContent='Loading today’s feedback…';todayMore=button('Load more today',moreToday);todayMore.hidden=true;
  const pastHeading=node('div',undefined,'feedback-heading');pastHeading.append(node('h3','Monthly archive'),node('small','Earlier dates'));
  monthsList=node('div',undefined,'feedback-month-list');olderButton=button('Show earlier months',moreMonths);
  host.replaceChildren(todayHeading,todayList,todayMore,pastHeading,monthsList,olderButton);
  off=watchTodayFeedback(hid,day,p=>{if(!valid(g))return;
   // Keep previously paginated responses visible if a new live response shifts the first page.
   if(!firstSnapshot&&todayTail.length){const ids=new Set(p.records.map(x=>x.id));todayTail=[...todayHead.filter(x=>!ids.has(x.id)),...todayTail];}
   todayHead=p.records;if(firstSnapshot||!todayTail.length){todayCursor=p.cursor;todayHasMore=p.more;}firstSnapshot=false;paintToday();
  },()=>{if(valid(g)){todayList.replaceChildren(node('p','Today’s feedback is unavailable.','empty-state'),button('Retry',()=>{const id=hid;pause();open(id);}));}});
  moreMonths();timer=setInterval(()=>{if(active&&day!==feedbackDay())open(hid);},15000);
 }
 document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden&&day!==feedbackDay())open(hid);});
 return {open,pause,stop};
}
