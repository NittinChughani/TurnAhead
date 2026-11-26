import {loadAnalytics} from './analytics-store.js?v=3.3.1';
import {buildAnalytics,reportRows,analyticsCSV} from './analytics-engine.js?v=3.1.0';
import {hospitalCustomization,validateCustomization,compressHospitalLogo,applyHospitalBrand} from './hospital-custom.js?v=3.1.0';
import {updateHospitalCustomization} from './org-store.js?v=3.3.1';
import {dayKey} from './queue-engine.js';
const $=id=>document.getElementById(id),esc=window.turnahead.esc;
let generation=0,report=null,reportInfo=null,logo='',context=()=>null,notify=()=>{},customGeneration=0;
const num=n=>n==null?'—':String(n);
function exportReady(ready){$('analytics-csv').disabled=!ready;$('analytics-pdf').disabled=!ready;}
export function resetV3(){generation++;customGeneration++;report=null;reportInfo=null;logo='';exportReady(false);$('analytics-output').replaceChildren();$('analytics-state').textContent='Choose a period and generate a report.';$('analytics-load').disabled=false;$('analytics-cancel').hidden=true;$('custom-logo-preview').hidden=true;$('custom-logo-preview').removeAttribute('src');$('custom-logo-file').value='';}
function bars(items){const max=Math.max(1,...items.map(x=>x.value));return '<div class="analytics-bars">'+items.map(x=>'<div class="analytics-bar"><span>'+esc(x.label)+'</span><div><i style="width:'+Math.max(0,x.value/max*100)+'%"></i></div><b>'+esc(num(x.value))+'</b></div>').join('')+'</div>';}
function groupTable(rows){return '<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr><th>Group</th><th>Issued</th><th>Completed</th><th>Missed</th><th>Recalled</th><th>Avg wait</th><th>Avg service</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.label||r.date)+'</td>'+[r.issued,r.completed,r.missed,r.recalled,r.wait,r.service].map(v=>'<td>'+esc(num(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
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
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const navy=[16,35,68],blue=[34,104,235],teal=[6,160,135],muted=[88,106,132],pale=[240,245,252];let y=0;
 const header=(title)=>{doc.setFillColor(...navy);doc.rect(0,0,297,27,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('TurnAhead  /  '+title,12,12);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(doc.splitTextToSize(info.name+' | '+info.start+' to '+info.end,270),12,19);doc.setFillColor(...teal);doc.rect(0,27,297,2,'F');y=38;};
 const next=title=>{doc.addPage();header(title);};
 const note=(s)=>{doc.setFontSize(10);doc.setTextColor(...muted);doc.text(doc.splitTextToSize(s,270),12,y);};
 header('Operational overview');
 const metrics=[['Issued',r.total.issued],['Completed',r.total.completed],['Missed (final)',r.total.missed],['Unresolved',r.total.unresolved],['Recalled',r.total.recalled],['Recall completed',r.total.recalledCompleted],['Avg wait (min)',r.total.wait],['Avg service (min)',r.total.service],['Rating / 5',r.ratings.average],['Feedback',r.ratings.count],['Wait samples',r.total.waitN],['Service samples',r.total.serviceN]];
 metrics.forEach(([label,value],i)=>{const x=12+(i%4)*69,top=38+Math.floor(i/4)*29;doc.setFillColor(...pale);doc.roundedRect(x,top,65,25,2,2,'F');doc.setTextColor(...muted);doc.setFontSize(10);doc.text(label,x+4,top+7);doc.setTextColor(...blue);doc.setFont('helvetica','bold');doc.setFontSize(19);doc.text(String(value??'—'),x+4,top+18);doc.setFont('helvetica','normal');});
 y=135;note('Aggregate operational data only. Wait excludes recalled tickets; service includes valid completed visits. Missing timestamps are excluded. Feedback is grouped by submission date. Transferred visits count once in the final service department. No patient names or comments. Dates in PKT.');
 const table=(title,headers,rows,widths)=>{
  next(title);let index=0;
  const draw=(values,heading=false)=>{
   doc.setFont('helvetica',heading?'bold':'normal');doc.setFontSize(9);
   const strings=values.map((v,i)=>doc.splitTextToSize(String(v??'—'),widths[i]-4));
   const h=Math.max(...strings.map(s=>s.length))*4+5;
   if(!heading&&y+h>190){next(title+' (continued)');draw(headers,true);}
   doc.setFillColor(...(heading?navy:index++%2?pale:[255,255,255]));doc.rect(12,y, widths.reduce((s,v)=>s+v,0),h,'F');doc.setTextColor(...(heading?[255,255,255]:navy));let x=12;
   strings.forEach((s,i)=>{doc.text(s,x+2,y+5);x+=widths[i];});y+=h;
  };
  draw(headers,true);rows.forEach(r=>draw(r));
 };
 const groupHeaders=['Group','Issued','Done','Missed','Recall','Recall done','Unresolved','Wait min','Svc min','Wait n','Svc n'];
 const widths=[73,19,19,19,19,23,23,20,20,19,19];
 const row=g=>[g.date||g.label,g.issued,g.completed,g.missed,g.recalled,g.recalledCompleted,g.unresolved,g.wait,g.service,g.waitN,g.serviceN];
 table('Daily activity',groupHeaders,r.days.map(row),widths);
 table('Department comparison',groupHeaders,r.departments.map(row),widths);
 table('Doctor comparison',groupHeaders,r.doctors.map(row),widths);
 table('Peak issue hours (PKT)',['Hour','Tickets issued'],r.hours.map((n,i)=>[String(i).padStart(2,'0')+':00',n]),[135,138]);
 table('Patient satisfaction',['Date / rating','Responses','Average / 5'],[...r.ratings.trend.map(x=>[x.date,x.count,x.average]),...r.ratings.distribution.map((n,i)=>[(i+1)+' / 5',n,'—'])],[123,75,75]);
 for(let p=1;p<=doc.getNumberOfPages();p++){doc.setPage(p);doc.setFontSize(8);doc.setTextColor(...muted);doc.text('TurnAhead · Confidential aggregate report',12,202);doc.text(p+' / '+doc.getNumberOfPages(),285,202,{align:'right'});}
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
 const steps=[['Hospital workspace provisioned',true,'Your operator-created hospital is active.'],['Create a service department',departments.length>0,'Use Departments to create the first queue.'],['Register an active doctor',doctors.some(x=>x.active),'Use Doctors to make ticket issuance available.'],['Authorize reception staff',members.some(x=>x.active&&x.role!=='owner'),'Invite staff using their verified work email.'],['Set public hospital hours',c.hoursEnabled,'Optional: configure hours in Customization.'],['Upload hospital branding',!!c.logo,'Optional: choose a hospital logo.']];
 const routes=['','departments','doctors','invites','customization','customization'];const done=steps.filter(x=>x[1]).length;
 $('onboarding-list').innerHTML='<div class="onboarding-progress"><strong>'+done+' of '+steps.length+' setup items ready</strong><progress max="'+steps.length+'" value="'+done+'"></progress></div>'+steps.map(([title,done,description],i)=>'<div class="onboarding-step"><span class="onboarding-mark">'+(done?'✓':'○')+'</span><div><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></div><span class="role-chip">'+(done?'READY':'TO DO')+'</span>'+(routes[i]?'<button type="button" class="btn btn-small btn-outline" data-setup-section="'+routes[i]+'">Open</button>':'')+'</div>').join('');
}
export function bindV3(getContext,toast){
 context=getContext;notify=toast;
 $('analytics-date').value=dayKey();$('analytics-date').max=dayKey();
 $('analytics-load').addEventListener('click',async()=>{
  const h=context()?.hospital;if(!h)return;
  if(!navigator.onLine){$('analytics-state').textContent='Offline. Reconnect before generating a private report.';return;}
  const end=$('analytics-date').value,days=Number($('analytics-period').value),token=++generation;
  report=null;reportInfo=null;exportReady(false);$('analytics-output').replaceChildren();$('analytics-state').textContent='Loading private archive totals…';$('analytics-load').disabled=true;$('analytics-cancel').hidden=false;
  try{
   const data=await loadAnalytics(h.id,end,days,msg=>{if(token===generation)$('analytics-state').textContent=msg;},()=>token!==generation||context()?.hospital?.id!==h.id);
   if(token!==generation)return;
   report=buildAnalytics(data.records,data.feedback,data.dates);reportInfo={name:h.name,start:data.dates[0],end,token};
   renderAnalytics(report);$('analytics-state').textContent=reportInfo.start+' to '+end+' · '+report.total.issued+' archived tickets · generated '+new Date().toLocaleTimeString();exportReady(true);
  }catch(e){if(token===generation)$('analytics-state').textContent='Unable to generate report: '+e.message;}
  finally{if(token===generation){$('analytics-load').disabled=false;$('analytics-cancel').hidden=true;}}
 });
 $('analytics-cancel').addEventListener('click',()=>{generation++;$('analytics-load').disabled=false;$('analytics-cancel').hidden=true;$('analytics-state').textContent='Report cancelled.';});
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
