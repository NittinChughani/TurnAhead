import {validProfilePhoto,MAX_PHOTO_BYTES} from './profile-photo.js';
export const defaultCustomization={logo:'',accent:'#2268eb',receiptNote:'',opens:'09:00',closes:'17:00',hoursEnabled:false,counters:12,boardLayout:'standard',boardMessage:''};
const clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function validateCustomization(value){
 const v={...defaultCustomization,...value};
 if(!validProfilePhoto(v.logo)||!/^#[0-9a-fA-F]{6}$/.test(v.accent)||typeof v.receiptNote!=='string'||v.receiptNote.length>120||typeof v.boardMessage!=='string'||v.boardMessage.length>120||!clock.test(v.opens)||!clock.test(v.closes)||typeof v.hoursEnabled!=='boolean'||!Number.isInteger(v.counters)||v.counters<1||v.counters>12||!['standard','large'].includes(v.boardLayout))throw Error('Check the hospital customization fields.');
 if(v.hoursEnabled&&v.opens===v.closes)throw Error('Opening and closing times must differ.');
 return Object.fromEntries(Object.keys(defaultCustomization).map(k=>[k,v[k]]));
}
export function hospitalCustomization(h){try{return validateCustomization(h?.customization||{});}catch{return {...defaultCustomization};}}
export function hoursLabel(c){return c.hoursEnabled?c.opens+' – '+c.closes+' PKT'+(c.closes<c.opens?' (overnight)':''):'Hours not specified';}
export function counterOptions(c,queues){
 const active=new Set();
 for(const q of queues||[])for(const lane of Object.values(q.lanes||{})){const n=Number(lane.active?.counter?.replace('Counter ',''));if(Number.isInteger(n)&&n>=1&&n<=12)active.add(n);}
 return [...new Set([...Array.from({length:c.counters},(_,i)=>i+1),...active])].sort((a,b)=>a-b);
}
export function applyHospitalBrand(h){
 const c=hospitalCustomization(h);
 document.documentElement.style.setProperty('--hospital-accent',c.accent);
 for(const img of document.querySelectorAll('[data-hospital-logo]')){
  if(c.logo){img.src=c.logo;img.alt=h.name+' logo';img.hidden=false;}else{img.hidden=true;img.removeAttribute('src');}
 }
 for(const el of document.querySelectorAll('[data-hospital-hours]')){el.textContent=hoursLabel(c);el.hidden=!c.hoursEnabled;}
}
export async function compressHospitalLogo(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_PHOTO_BYTES)throw Error('Choose a PNG, JPEG or WebP logo under 5 MB.');
 const url=URL.createObjectURL(file);
 try{const img=new Image();img.src=url;await img.decode();
 const scale=Math.min(1,240/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
 canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 for(const q of [.85,.65,.45,.25]){const data=canvas.toDataURL('image/webp',q);if(validProfilePhoto(data))return data;}
 throw Error('Logo could not be compressed to the storage limit.');
 }finally{URL.revokeObjectURL(url);}
}
