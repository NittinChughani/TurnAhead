/** Hospital-owner-only client-side PDF export; no patient details leave the browser. */
export function patientReportRows(ticket, names={}) {
  const dt=ms=>Number.isFinite(ms)&&ms>0?new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Karachi'}).format(new Date(ms)):'Not recorded';
  const name=(ticket.patientGender==='male'?'Mr ':ticket.patientGender==='female'?'Ms ':'')+(ticket.patientName||'Patient');
  return [
    ['Ticket',ticket.code||'Not recorded'],['Patient',name],['Department',ticket.queueName||'Not recorded'],
    ['Doctor',ticket.doctorName?'Dr. '+ticket.doctorName:'Not recorded'],['Room number',ticket.roomNumber||'Not recorded'],
    ['Queue date',ticket.dayKey||'Not recorded'],['Ticket issued',dt(ticket.issuedAt)],
    ['Issued by',names.issuedBy||'Not recorded'],['Issuing counter',ticket.issuedCounter||'Not recorded'],
    ['Called at',dt(ticket.calledAt)],['Calling counter',ticket.calledCounter||'Not recorded'],
    ['Called by',names.calledBy||'Not recorded'],['Finished at',dt(ticket.finishedAt)],
    ['Finished by',names.finishedBy||'Not recorded'],
    ['Attendance',ticket.attendance==='present'?'Attended':ticket.attendance==='missed'?'Missed':'Not confirmed'],
    ['Status',ticket.status||'Not recorded']
  ];
}
export function safeReportFilename(ticket) {
  return `TurnAhead-${String(ticket.code||'ticket').replace(/[^A-Za-z0-9-]/g,'')}-${String(ticket.dayKey||'date').replace(/[^0-9-]/g,'')}.pdf`;
}
export async function downloadPatientReport(ticket,rows,hospitalName='TurnAhead hospital',authorized=()=>true) {
  // Load only on explicit click; no remote PDF processing or server upload.
  const {jsPDF}=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
  if(!authorized())throw Error('Administrator session changed; export cancelled.');
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const width=210,side=19;let y=19;
  pdf.setFillColor(13,43,76);pdf.rect(0,0,width,43,'F');
  pdf.setTextColor(255,255,255);pdf.setFont('helvetica','bold');pdf.setFontSize(22);pdf.text('TurnAhead',side,23);
  pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text('PRIVATE / PATIENT QUEUE RECORD',side,33);
  y=56;pdf.setTextColor(20,48,78);pdf.setFontSize(16);pdf.setFont('helvetica','bold');pdf.text('Ticket '+String(ticket.code||'—'),side,y);
  y+=9;pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.setTextColor(75,103,132);
  const hosp=pdf.splitTextToSize(String(hospitalName||'TurnAhead').slice(0,90),170);pdf.text(hosp,side,y);y+=hosp.length*5+4;
  for(const [label,value] of rows){
    const text=String(value||'—');const lines=pdf.splitTextToSize(text,107);
    const height=Math.max(9,lines.length*5+3);
    if(y+height>274){pdf.addPage();y=22;}
    pdf.setDrawColor(226,234,242);pdf.line(side,y+height-2,width-side,y+height-2);
    pdf.setFont('helvetica','normal');pdf.setTextColor(94,112,135);pdf.setFontSize(9);pdf.text(label,side,y+4);
    pdf.setFont('helvetica','bold');pdf.setTextColor(23,48,80);pdf.text(lines,82,y+4);
    y+=height;
  }
  if(y+24>275){pdf.addPage();y=22;}
  pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(116,130,148);
  pdf.text('Private administrative record. Keep securely; do not share without authorization.',side,y+10);
  pdf.text('Generated '+new Date().toLocaleString('en-PK',{timeZone:'Asia/Karachi'}),side,y+16);
  pdf.setProperties({title:`TurnAhead ${ticket.code||''} patient queue record`,subject:'Private hospital queue record',author:'TurnAhead'});
  pdf.save(safeReportFilename(ticket));
}
