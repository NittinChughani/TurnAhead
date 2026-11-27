import {loadAnalytics} from './analytics-store.js?v=4.0.0-ui.1';
import {buildAnalytics,reportRows,analyticsCSV} from './analytics-engine.js?v=3.1.0';
import {hospitalCustomization,validateCustomization,compressHospitalLogo,applyHospitalBrand} from './hospital-custom.js?v=3.1.0';
import {updateHospitalCustomization} from './org-store.js?v=3.3.1';
import {dayKey} from './queue-engine.js';
const $=id=>document.getElementById(id),esc=window.turnahead.esc;
let generation=0,report=null,reportInfo=null,logo='',context=()=>null,notify=()=>{},customGeneration=0,setupStep=0;
const num=n=>n==null?'—':String(n);
function exportReady(ready){$('analytics-csv').disabled=!ready;$('analytics-pdf').disabled=!ready;}
export function resetAnalytics(){generation++;report=null;reportInfo=null;exportReady(false);$('analytics-output').replaceChildren();$('analytics-output').removeAttribute('aria-busy');$('analytics-state').textContent='Choose a period and generate a report.';$('analytics-load').disabled=false;$('analytics-cancel').hidden=true;}
export function resetV3(){setupStep=0;customGeneration++;logo='';resetAnalytics();$('custom-logo-preview').hidden=true;$('custom-logo-preview').removeAttribute('src');$('custom-logo-file').value='';}
function bars(items){const max=Math.max(1,...items.map(x=>x.value));return '<div class="analytics-bars">'+items.map(x=>'<div class="analytics-bar"><span>'+esc(x.label)+'</span><div><i style="width:'+Math.max(0,x.value/max*100)+'%"></i></div><b>'+esc(num(x.value))+'</b></div>').join('')+'</div>';}
function groupTable(rows){return '<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr><th>Group</th><th>Issued</th><th>Completed</th><th>Missed</th><th>Recalled</th><th>Avg wait</th><th>Avg service</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.label||r.date)+'</td>'+[r.issued,r.completed,r.missed,r.recalled,r.wait,r.service].map(v=>'<td>'+esc(num(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function renderBasic(r){const t=r.total;const metrics=[['Issued',t.issued],['Completed',t.completed],['Missed',t.missed],['Unresolved',t.unresolved],['Average wait (min)',t.wait],['Average service (min)',t.service]];$('analytics-output').innerHTML='<div class="report-heading"><h2>Basic operational overview</h2><p>Aggregate queue totals for the selected period.</p></div><div class="report-kpis">'+metrics.map(([name,value])=>'<article class="report-kpi"><span>'+esc(name)+'</span><strong>'+esc(num(value))+'</strong></article>').join('')+'</div><p class="admin-section-note">Advanced comparisons, satisfaction trends and report exports are included in Professional and Enterprise. Individual attendance records and their export remain available.</p>';}
function renderAnalytics(r){
 const t=r.total;
 const cards=items=>'<div class="report-kpis">'+items.map(([label,value,unit])=>'<article class="report-kpi"><span>'+esc(label)+'</span><strong>'+esc(num(value))+' <small>'+esc(unit||'')+'</small></strong></article>').join('')+'</div>';
 const section=(n,title,body)=>'<section class="report-section"><header><span class="report-index">'+n+'</span><h3>'+title+'</h3></header>'+body+'</section>';
 $('analytics-output').innerHTML='<div class="report-heading"><span class="kicker">TURNAHEAD / OPERATIONS</span><h2>Operational overview</h2><p>'+esc(reportInfo.start+' — '+reportInfo.end+' · '+reportInfo.name)+'</p></div>'+
 section('01','Queue outcomes',cards([['Issued',t.issued],['Completed',t.completed],['Missed · final',t.missed],['Unresolved',t.unresolved],['Recalled',t.recalled],['Recalled & completed',t.recalledCompleted]]))+
 section('02','Waiting & service',cards([['Average wait',t.wait,'min'],['Average service',t.service,'min'],['Wait samples',t.waitN],['Service samples',t.serviceN]])+
 '<div class="report-charts"><article><h4>Daily ticket volume</h4>'+bars(r.days.map(x=>({label:x.date.slice(5),value:x.issued})))+'</article><article><h4>Peak issue hours · PKT</h4>'+bars(r.hours.map((value,i)=>({label:String(i).padStart(2,'0')+':00',value})))+'</article></div>')+
 section('03','Department & doctor comparison','<h4>Department performance</h4>'+groupTable(r.departments)+'<h4>Doctor performance</h4>'+groupTable(r.doctors))+
 section('04','Patient experience',cards([['Satisfaction',r.ratings.average,'/ 5'],['Feedback responses',r.ratings.count]])+'<div class="report-charts"><article><h4>Rating distribution</h4>'+bars(r.ratings.distribution.map((value,i)=>({label:String(i+1)+' / 5',value})))+'</article><article><h4>Satisfaction by date</h4><div class="analytics-table-wrap"><table class="analytics-table"><thead><tr><th>Date</th><th>Responses</th><th>Average / 5</th></tr></thead><tbody>'+r.ratings.trend.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+x.count+'</td><td>'+num(x.average)+'</td></tr>').join('')+'</tbody></table></div></article></div>')+
 section('05','How to read this report','<p class="admin-section-note">Wait: issue to first call, excluding recalls. Service: call to completion. Missing or invalid timestamps excluded. Missed counts are final; recalled counts can overlap completed. Unresolved includes waiting/called tickets. Feedback is grouped by submission date. Transferred visits are counted once under the final service department; wait includes time before transfer. Operational timestamps are not clinical care-quality measures.</p>');
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function pdfExport(){
 if(!report||!reportInfo)return;
 const r=report,info={...reportInfo},button=$('analytics-pdf');button.disabled=true;
 try{
 const {jsPDF}=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
 if(reportInfo?.token!==info.token)return;
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 const navy=[16,35,68],blue=[34,104,235],teal=[6,160,135],muted=[88,106,132],pale=[240,245,252];
 const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),margin=12,bodyWidth=W-2*margin,bottom=H-19;let y=0,currentTitle='';
 const value=v=>v==null?'—':String(v);
 const header=title=>{currentTitle=title;doc.setFillColor(...navy);doc.rect(0,0,W,33,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('TurnAhead  /  '+title,margin,12);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(doc.splitTextToSize(info.name,bodyWidth).slice(0,2),margin,19);doc.text(info.start+' to '+info.end,margin,28);doc.setFillColor(...teal);doc.rect(0,33,W,2,'F');y=43;};
 const next=title=>{doc.addPage('a4','portrait');header(title);};
 const paragraph=s=>{doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(...muted);const lines=doc.splitTextToSize(s,bodyWidth);if(y+lines.length*4.7>bottom)next(currentTitle);doc.text(lines,margin,y);y+=lines.length*4.7+7;};
 header('Operational overview');
 const metrics=[['Issued',r.total.issued],['Completed',r.total.completed],['Missed (final)',r.total.missed],['Unresolved',r.total.unresolved],['Recalled',r.total.recalled],['Recall completed',r.total.recalledCompleted],['Avg wait (min)',r.total.wait],['Avg service (min)',r.total.service],['Rating / 5',r.ratings.average],['Feedback',r.ratings.count],['Wait samples',r.total.waitN],['Service samples',r.total.serviceN]];
 const cardGap=4,cardW=(bodyWidth-2*cardGap)/3,cardH=26;
 metrics.forEach(([label,val],i)=>{const x=margin+(i%3)*(cardW+cardGap),top=43+Math.floor(i/3)*(cardH+4);doc.setFillColor(...pale);doc.roundedRect(x,top,cardW,cardH,2,2,'F');doc.setTextColor(...muted);doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.text(label,x+4,top+7);doc.setTextColor(...blue);doc.setFont('helvetica','bold');doc.setFontSize(19);doc.text(value(val),x+4,top+19);});
 y=170;paragraph('Report guide: waiting time excludes recalled tickets; service includes valid completed visits. Missing timestamps are excluded. Feedback is grouped by submission date. Transferred visits count once in the final service department. No patient names or comments. Dates in PKT.');
 const table=(title,headers,rows,weights)=>{
  const widths=weights.map(x=>x*bodyWidth/weights.reduce((a,b)=>a+b,0));let index=0;
  const measure=(values,bold)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(9);const lines=values.map((val,i)=>doc.splitTextToSize(value(val),widths[i]-4));return {lines,h:Math.max(...lines.map(s=>s.length))*4.4+5};};
  const paint=(values,heading=false)=>{
   const {lines,h}=measure(values,heading);
   doc.setFillColor(...(heading?navy:index++%2?pale:[255,255,255]));doc.rect(margin,y,bodyWidth,h,'F');doc.setTextColor(...(heading?[255,255,255]:navy));let x=margin;
   lines.forEach((s,i)=>{doc.text(s,x+2,y+5);x+=widths[i];});y+=h;
  };
  const headingHeight=measure(headers,true).h,firstHeight=rows.length?measure(rows[0],false).h:10;
  if(y+12+headingHeight+firstHeight>bottom)next(currentTitle.replace(/ \(cont\.\)$/,'')+' (cont.)');
  doc.setTextColor(...blue);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text(title,margin,y);y+=6;paint(headers,true);
  if(!rows.length){paint(['No records',...headers.slice(1).map(()=>null)]);y+=10;return;}
  for(const row of rows){
   if(y+measure(row,false).h>bottom){next(currentTitle.replace(/ \(cont\.\)$/,'')+' (cont.)');doc.setFont('helvetica','bold');doc.setTextColor(...blue);doc.setFontSize(11);doc.text(title+' (continued)',margin,y);y+=6;paint(headers,true);}
   paint(row);
  }y+=10;
 };
 const group=(title,items)=>{next(title);const label=g=>g.date||g.label;
  table('Queue outcomes',['Group','Issued','Done','Missed','Recall','Recall done','Unresolved'],items.map(g=>[label(g),g.issued,g.completed,g.missed,g.recalled,g.recalledCompleted,g.unresolved]),[54,22,20,22,22,23,23]);
  table('Waiting and service',['Group','Wait min','Service min','Wait samples','Service samples'],items.map(g=>[label(g),g.wait,g.service,g.waitN,g.serviceN]),[62,31,31,31,31]);};
 group('Daily activity',r.days);group('Department comparison',r.departments);group('Doctor comparison',r.doctors);
 next('Peak issue hours (PKT)');table('Hourly ticket volume',['Hour','Tickets issued'],r.hours.map((n,i)=>[String(i).padStart(2,'0')+':00',n]),[93,93]);
 next('Patient satisfaction');table('Rating distribution',['Rating','Responses'],r.ratings.distribution.map((n,i)=>[(i+1)+' / 5',n]),[93,93]);table('Satisfaction by date',['Date','Responses','Average / 5'],r.ratings.trend.map(x=>[x.date,x.count,x.average]),[86,50,50]);
 for(let p=1;p<=doc.getNumberOfPages();p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...muted);doc.setDrawColor(225,232,241);doc.line(margin,H-14,W-margin,H-14);doc.text('TurnAhead · Confidential aggregate report',margin,H-9);doc.text(p+' / '+doc.getNumberOfPages(),W-margin,H-9,{align:'right'});}
 doc.save('turnahead-analytics-'+info.end+'.pdf');
 }catch(e){notify('PDF export failed: '+e.message,true);}finally{button.disabled=!report;}
}
function previewLogo(){const img=$('custom-logo-preview');img.hidden=!logo;if(logo)img.src=logo;else img.removeAttribute('src');}
export function renderCustomization(h){
 const c=hospitalCustomization(h);customGeneration++;logo=c.logo;previewLogo();
 for(const [id,value] of Object.entries({'custom-accent':c.accent,'custom-receipt':c.receiptNote,'custom-open':c.opens,'custom-close':c.closes,'custom-counters':c.counters,'custom-layout':c.boardLayout,'custom-message':c.boardMessage}))$(id).value=value;
 $('custom-hours-enabled').checked=c.hoursEnabled;
 applyHospitalBrand(h);
}
export function renderOnboarding({hospital,departments,doctors,members}){
 if(!hospital)return;
 const c=hospitalCustomization(hospital);
 const steps=[
 ['Workspace',true,'The operator-provisioned hospital is active.',''],
 ['Departments',departments.length>0,'Create at least one department with a unique ticket prefix.','departments'],
 ['Doctors',doctors.some(x=>x.active),'Register an active doctor and their room in a department.','doctors'],
 ['Reception team',members.some(x=>x.active&&x.role!=='owner'),'Invite receptionists or supervisors by verified work email.','invites'],
 ['Counters & branding',Boolean(hospital.customization),'Set the number of counters, logo, colors and receipt preferences.','customization'],
 ['Hours & public board',c.hoursEnabled,'Optional: configure hospital hours and the board layout.','customization']
 ];
 const done=steps.filter(x=>x[1]).length;setupStep=Math.max(0,Math.min(steps.length-1,setupStep));
 const [title,ready,description,route]=steps[setupStep];
 $('onboarding-list').innerHTML='<div class="onboarding-progress"><strong>'+done+' of '+steps.length+' configured</strong><progress aria-label="Hospital setup progress" max="'+steps.length+'" value="'+done+'"></progress></div><div class="setup-wizard"><nav class="setup-steps" aria-label="Setup steps">'+steps.map(([name,ok],i)=>'<button type="button" class="btn btn-small btn-outline" data-wizard-step="'+i+'" '+(i===setupStep?'aria-current="step"':'')+'>'+(ok?'✓ ':'')+(i+1)+'. '+esc(name)+'</button>').join('')+'</nav><article class="report-section"><span class="kicker">STEP '+(setupStep+1)+' OF '+steps.length+'</span><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p><p class="role-chip">'+(ready?'READY':'TO DO')+'</p>'+(route?'<button type="button" class="btn btn-primary" data-setup-section="'+route+'">Open settings ↗</button>':'')+'<div class="demo-controls"><button type="button" class="btn btn-outline btn-small" data-wizard-step="'+(setupStep-1)+'" '+(setupStep===0?'disabled':'')+'>Previous</button><button type="button" class="btn btn-outline btn-small" data-wizard-step="'+(setupStep+1)+'" '+(setupStep===steps.length-1?'disabled':'')+'>Next</button></div></article></div>';
}
export function bindV3(getContext,toast){
 context=getContext;notify=toast;
 $('onboarding-list').addEventListener('click',e=>{const b=e.target.closest('[data-wizard-step]');if(!b)return;setupStep=Number(b.dataset.wizardStep);renderOnboarding(context());});
 $('analytics-date').value=dayKey();$('analytics-date').max=dayKey();
 $('analytics-mode').addEventListener('change',resetAnalytics);
 $('analytics-load').addEventListener('click',async()=>{
  const h=context()?.hospital;if(!h)return;
  if(!navigator.onLine){$('analytics-state').textContent='Offline. Reconnect before generating a private report.';return;}
  const access=context()?.analyticsAccess,advanced=$('analytics-mode').value==='advanced';
  if(advanced&&!['legacy','advanced'].includes(access)){$('analytics-state').textContent='Advanced reports require Professional or Enterprise.';return;}
  const end=$('analytics-date').value,days=Number($('analytics-period').value),token=++generation;
  report=null;reportInfo=null;exportReady(false);$('analytics-output').innerHTML='<div class="report-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div>';$('analytics-output').setAttribute('aria-busy','true');$('analytics-state').textContent='Loading private archive totals…';$('analytics-load').disabled=true;$('analytics-cancel').hidden=false;
  try{
   const data=await loadAnalytics(h.id,end,days,msg=>{if(token===generation)$('analytics-state').textContent=msg;},()=>token!==generation||context()?.hospital?.id!==h.id,{advanced,managed:access==='advanced'});
   if(token!==generation)return;
   report=data.report||buildAnalytics(data.records,data.feedback,data.dates);reportInfo={name:h.name,start:data.dates[0],end,token};
   if(advanced)renderAnalytics(report);else renderBasic(report);$('analytics-state').textContent=reportInfo.start+' to '+end+' · '+report.total.issued+' archived tickets · generated '+new Date().toLocaleTimeString();exportReady(advanced);if(!advanced){report=null;reportInfo=null;}
  }catch(e){if(token===generation){$('analytics-output').replaceChildren();$('analytics-state').textContent='Unable to generate report: '+e.message;}}
  finally{if(token===generation){$('analytics-output').removeAttribute('aria-busy');$('analytics-load').disabled=false;$('analytics-cancel').hidden=true;}}
 });
 $('analytics-cancel').addEventListener('click',()=>{generation++;$('analytics-output').replaceChildren();$('analytics-output').removeAttribute('aria-busy');$('analytics-load').disabled=false;$('analytics-cancel').hidden=true;$('analytics-state').textContent='Report cancelled.';});
 $('analytics-csv').addEventListener('click',()=>{if(report&&reportInfo)download(new Blob(['\uFEFF'+analyticsCSV(reportRows(report))],{type:'text/csv;charset=utf-8'}),'turnahead-analytics-'+reportInfo.end+'.csv');});
 $('analytics-pdf').addEventListener('click',pdfExport);
 $('custom-logo-file').addEventListener('change',async e=>{const token=customGeneration;const file=e.target.files?.[0];if(!file)return;e.target.disabled=true;$('custom-save').disabled=true;try{const next=await compressHospitalLogo(file);if(token===customGeneration){logo=next;previewLogo();}}catch(err){notify(err.message,true);}finally{e.target.value='';e.target.disabled=false;$('custom-save').disabled=false;}});
 $('custom-logo-remove').addEventListener('click',()=>{logo='';previewLogo();});
 $('customization-form').addEventListener('submit',async e=>{
  e.preventDefault();const h=context()?.hospital;if(!h)return;if(!navigator.onLine){notify('Reconnect before saving settings.',true);return;}
  const b=$('custom-save'),token=customGeneration;b.disabled=true;
  try{
   const c=validateCustomization({logo,accent:$('custom-accent').value,receiptNote:$('custom-receipt').value.trim(),opens:$('custom-open').value,closes:$('custom-close').value,hoursEnabled:$('custom-hours-enabled').checked,counters:Number($('custom-counters').value),boardLayout:$('custom-layout').value,boardMessage:$('custom-message').value.trim()});
   await updateHospitalCustomization(h.id,c);
   if(token!==customGeneration||context()?.hospital?.id!==h.id)return;
   h.customization=c;applyHospitalBrand(h);renderOnboarding(context());notify('Hospital customization saved.');
  }catch(err){notify('Customization not saved: '+err.message,true);}finally{b.disabled=false;}
 });
}
