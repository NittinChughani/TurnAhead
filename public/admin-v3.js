import {loadAnalytics} from './analytics-store.js?v=3.1.0';
import {buildAnalytics,reportRows,analyticsCSV} from './analytics-engine.js?v=3.1.0';
import {hospitalCustomization,validateCustomization,compressHospitalLogo,applyHospitalBrand} from './hospital-custom.js?v=3.1.0';
import {updateHospitalCustomization} from './org-store.js?v=3.1.0';
import {dayKey} from './queue-engine.js';
const $=id=>document.getElementById(id),esc=window.turnahead.esc;
let generation=0,report=null,reportInfo=null,logo='',context=()=>null,notify=()=>{},customGeneration=0;
const num=n=>n==null?'—':String(n);
function exportReady(ready){$('analytics-csv').disabled=!ready;$('analytics-pdf').disabled=!ready;}
export function resetV3(){generation++;customGeneration++;report=null;reportInfo=null;logo='';exportReady(false);$('analytics-output').replaceChildren();$('analytics-state').textContent='Choose a period and generate a report.';$('analytics-load').disabled=false;$('analytics-cancel').hidden=true;$('custom-logo-preview').hidden=true;$('custom-logo-preview').removeAttribute('src');$('custom-logo-file').value='';}
function bars(items){const max=Math.max(1,...items.map(x=>x.value));return '<div class="analytics-bars">'+items.map(x=>'<div class="analytics-bar"><span>'+esc(x.label)+'</span><div><i style="width:'+Math.max(0,x.value/max*100)+'%"></i></div><b>'+esc(num(x.value))+'</b></div>').join('')+'</div>';}
function groupTable(rows){return '<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr><th>Group</th><th>Issued</th><th>Completed</th><th>Missed</th><th>Recalled</th><th>Avg wait</th><th>Avg service</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.label||r.date)+'</td>'+[r.issued,r.completed,r.missed,r.recalled,r.wait,r.service].map(v=>'<td>'+esc(num(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function renderAnalytics(r){
 const t=r.total,stats=[['Issued',t.issued],['Completed',t.completed],['Missed · final',t.missed],['Recalled',t.recalled],['Recalled & completed',t.recalledCompleted],['Unresolved',t.unresolved],['Average wait · min',t.wait],['Average service · min',t.service],['Satisfaction / 5',r.ratings.average],['Feedback responses',r.ratings.count]];
 $('analytics-output').innerHTML='<div class="analytics-kpis">'+stats.map(([label,value])=>'<article class="analytics-kpi"><span>'+esc(label)+'</span><strong>'+esc(num(value))+'</strong></article>').join('')+'</div><div class="analytics-panels"><article><h3>Daily ticket volume</h3>'+bars(r.days.map(x=>({label:x.date.slice(5),value:x.issued})))+'</article><article><h3>Peak issue hours · PKT</h3>'+bars(r.hours.map((value,i)=>({label:String(i).padStart(2,'0')+':00',value})))+'</article><article><h3>Rating distribution</h3>'+bars(r.ratings.distribution.map((value,i)=>({label:String(i+1)+' / 5',value})))+'</article><article><h3>Satisfaction by date</h3><div class="analytics-table-wrap"><table class="analytics-table"><thead><tr><th>Date</th><th>Responses</th><th>Average / 5</th></tr></thead><tbody>'+r.ratings.trend.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+x.count+'</td><td>'+num(x.average)+'</td></tr>').join('')+'</tbody></table></div></article></div><h3>Department performance</h3>'+groupTable(r.departments)+'<h3>Doctor performance</h3>'+groupTable(r.doctors)+'<p class="admin-section-note">Wait time: issue to first call, excluding recalls because the original call timestamp is overwritten. Service time: call to completion. Missing or invalid timestamps excluded. Missed counts are final missed states; recalled counts can overlap completed. Unresolved includes waiting/called tickets. Feedback is grouped by submission date. Wait samples: '+t.waitN+'; service samples: '+t.serviceN+'. Operational timestamps are not clinical care-quality measures.</p>';
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function pdfExport(){
 if(!report||!reportInfo)return;
 const r=report,info={...reportInfo},button=$('analytics-pdf');button.disabled=true;
 try{
 const {jsPDF}=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
 if(reportInfo?.token!==info.token)return;
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const rows=reportRows(r);let y=17;
 function page(){doc.setFontSize(17);doc.text('TurnAhead | Operational analytics',12,12);doc.setFontSize(10);doc.text(doc.splitTextToSize(info.name+' | '+info.start+' to '+info.end,270),12,19);y=28;}
 page();
 const headers=['Section / group','Issued','Done','Missed','Recall','Recall done','Unresolved','Wait min','Svc min','Wait n','Svc n','Feedback','Avg rating'];
 function row(values,heading=false){
  const widths=[72,15,15,15,15,20,21,18,18,15,15,19,19];
  const strings=values.map((v,i)=>doc.splitTextToSize(String(v??''),widths[i]-2));
  const height=Math.max(...strings.map(s=>s.length))*4+3;
  if(y+height>195){doc.addPage();page();row(headers,true);}
  doc.setFontSize(8);doc.setFont('helvetica',heading?'bold':'normal');let x=12;
  strings.forEach((s,i)=>{doc.text(s,x,y);x+=widths[i];});y+=height;
 }
 row(headers,true);
 for(const line of rows.slice(1))row([line[0]+' | '+line[1],...line.slice(2)]);
 if(y>180){doc.addPage();page();}
 doc.setFontSize(9);doc.text(doc.splitTextToSize('Aggregate report only. Wait excludes recalled tickets; service includes valid completed visits. Feedback grouped by submission date. No patient names or comments. Dates in PKT.',270),12,y+5);
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
 $('onboarding-list').innerHTML=steps.map(([title,done,description])=>'<div class="onboarding-step"><span class="onboarding-mark">'+(done?'✓':'○')+'</span><div><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></div><span class="role-chip">'+(done?'READY':'TO DO')+'</span></div>').join('');
}
export function bindV3(getContext,toast){
 context=getContext;notify=toast;
 $('analytics-date').value=dayKey();$('analytics-date').max=dayKey();
 $('analytics-load').addEventListener('click',async()=>{
  const h=context()?.hospital;if(!h)return;
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
  e.preventDefault();const h=context()?.hospital;if(!h)return;
  const b=$('custom-save'),token=customGeneration;b.disabled=true;
  try{
   const c=validateCustomization({logo,accent:$('custom-accent').value,receiptNote:$('custom-receipt').value.trim(),opens:$('custom-open').value,closes:$('custom-close').value,hoursEnabled:$('custom-hours-enabled').checked,counters:Number($('custom-counters').value),boardLayout:$('custom-layout').value,boardMessage:$('custom-message').value.trim()});
   await updateHospitalCustomization(h.id,c);
   if(token!==customGeneration||context()?.hospital?.id!==h.id)return;
   h.customization=c;applyHospitalBrand(h);renderOnboarding(context());notify('Hospital customization saved.');
  }catch(err){notify('Customization not saved: '+err.message,true);}finally{b.disabled=false;}
 });
}
