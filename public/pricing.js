import {PLANS,quote,money} from './subscription-model.js';
const $=id=>document.getElementById(id);
let cycle='monthly';
const benefits={essential:['2 departments','5 doctors','3 staff accounts','Live patient tracking','QR tickets & printing','Basic analytics','Standard support'],professional:['15 departments','50 doctors','30 staff accounts','All Essential features','Advanced analytics & PDF reports','Department comparisons','Priority support & onboarding'],enterprise:['Custom capacity','Multiple locations by agreement','Dedicated infrastructure options','Custom branding & integrations','Dedicated support arrangements']};
function render(){
 $('pricing-plans').innerHTML=Object.entries(PLANS).map(([key,p])=>{const q=quote(key,cycle);return '<article class="commercial-card plan-card '+(key==='professional'?'plan-featured':'')+'"><span class="kicker">'+(key==='essential'?'SMALL PRACTICES':key==='professional'?'HOSPITALS & CENTERS':'HEALTHCARE NETWORKS')+'</span><h2>'+p.name+'</h2><strong class="plan-price">'+money(q.recurring)+'</strong><small>'+(q.recurring===null?'Tailored proposal':cycle==='annual'?'per year':'per month')+'</small><p class="plan-setup">'+money(q.setup)+' · '+(q.setup===null?'implementation by agreement':'one-time setup')+'</p><ul>'+benefits[key].map(x=>'<li>'+x+'</li>').join('')+'</ul><p class="plan-first-total">'+(q.total===null?'Pricing by quotation':'First '+(cycle==='annual'?'year':'month')+' including setup: '+money(q.total))+'</p></article>';}).join('');
 document.querySelectorAll('[data-cycle]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cycle===cycle)));
}
const rows=[['Locations','1','1','By agreement'],['Departments','2','15','Custom'],['Doctors','5','50','Custom'],['Staff accounts','3','30','Custom'],['Live queues, QR tickets and public board','Included','Included','Included'],['Basic analytics','Included','Included','Included'],['Advanced analytics & reports','—','Included','Included'],['Department & feedback comparisons','—','Included','Included'],['Activity logs','Core safeguards','Included','Included'],['Support','Standard','Priority','Dedicated'],['Integrations','Separate quote','Separate quote','By agreement']];
$('pricing-comparison').innerHTML=rows.map(r=>'<tr><th scope="row">'+r[0]+'</th>'+r.slice(1).map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('');

document.querySelectorAll('[data-cycle]').forEach(b=>b.addEventListener('click',()=>{cycle=b.dataset.cycle;render();}));
render();
