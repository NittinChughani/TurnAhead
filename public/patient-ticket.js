/** Patient's private queue receipt. No server processing, no new database writes. */
export function trackingURL(locationHref,ticketId,hospitalId){
 if(!/^[A-Za-z0-9]{20}$/.test(ticketId||'')||(hospitalId&&!/^[A-Za-z0-9]{20}$/.test(hospitalId)))throw Error('Invalid ticket tracking link.');
 const url=new URL(locationHref);url.search='';url.hash='';url.searchParams.set('ticket',ticketId);if(hospitalId)url.searchParams.set('hospital',hospitalId);return url.href;
}
export function receiptDetails(ticket,facility){
 const clean=(value,fallback='Not recorded')=>String(value||fallback);
 return {code:clean(ticket.code,'Ticket'),facility:clean(facility,'Your hospital'),rows:[
  ['Patient',ticket.patientName?(ticket.patientGender==='male'?'Mr ':ticket.patientGender==='female'?'Ms ':'')+ticket.patientName:'Not recorded'],
  ['Department',clean(ticket.queueName)],['Doctor',ticket.doctorName?'Dr. '+ticket.doctorName:'Not recorded'],
  ['Room',clean(ticket.roomNumber)],['Queue date',clean(ticket.dayKey)]
 ],filename:'TurnAhead-'+String(ticket.code||'ticket').replace(/[^a-z0-9-]/gi,'')+'.pdf'};
}
/** Vector modules make the QR sharp at any printer resolution, without loading an image. */
export function drawQR(doc,modules,x,y,size){
 if(!Array.isArray(modules)||!modules.length||modules.some(row=>!Array.isArray(row)||row.length!==modules.length))throw Error('QR generation failed.');
 const unit=size/(modules.length+8);doc.setFillColor(255,255,255);doc.rect(x,y,size,size,'F');doc.setFillColor(20,36,67);
 modules.forEach((row,r)=>{let start=-1;for(let i=0;i<=row.length;i++){if(row[i]&&start===-1)start=i;if(!row[i]&&start!==-1){doc.rect(x+(start+4)*unit,y+(r+4)*unit,(i-start)*unit,unit,'F');start=-1;}}});
}
export function buildTicketPDF(jsPDF,details,modules,url){
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 const navy=[16,35,68],blue=[23,106,231],muted=[76,94,115],teal=[6,160,135];
 const x=25,w=160,center=105;
 doc.setFillColor(...navy);doc.roundedRect(x,18,w,30,3,3,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text('TurnAhead',x+8,30);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('PRIVATE PATIENT QUEUE TICKET',x+8,39);
 doc.setFillColor(...teal);doc.rect(x,48,w,1.5,'F');doc.setTextColor(...muted);doc.setFontSize(11);doc.text(doc.splitTextToSize(details.facility,w-12),center,59,{align:'center'});
 doc.setFillColor(240,245,252);doc.roundedRect(x,72,w,31,3,3,'F');doc.setTextColor(...muted);doc.setFontSize(9);doc.text('YOUR QUEUE NUMBER',center,79,{align:'center'});doc.setTextColor(...blue);doc.setFont('helvetica','bold');doc.setFontSize(31);doc.text(details.code,center,94,{align:'center'});
 let y=114;
 for(const [label,val] of details.rows){
  doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(...muted);doc.text(label,x+2,y);
  doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(...navy);const lines=doc.splitTextToSize(val,w-51);doc.text(lines,x+48,y);
  const h=Math.max(9,lines.length*4.5+4);doc.setDrawColor(225,232,241);doc.line(x,y+h-4,x+w,y+h-4);y+=h;
 }
 const qrTop=Math.max(163,y+2),qrSize=60;
 drawQR(doc,modules,center-qrSize/2,qrTop,qrSize);
 doc.setTextColor(...navy);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('Scan to follow your turn live',center,qrTop+qrSize+5,{align:'center'});
 doc.setTextColor(...blue);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.textWithLink('Open private tracking page',center-23,qrTop+qrSize+12,{url});
 doc.setTextColor(...muted);doc.setFontSize(9);doc.text('Keep this ticket private. Your QR link contains visit details.',center,Math.min(280,qrTop+qrSize+20),{align:'center'});
 doc.setProperties({title:'TurnAhead '+details.code+' patient ticket',author:'TurnAhead',subject:'Private queue ticket'});
 return doc;
}
