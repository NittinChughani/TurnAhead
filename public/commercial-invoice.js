/** Render operator-issued records only; never mark a payment as verified on the client. */
export function buildInvoice(jsPDF,invoice,organization){
 if(!Number.isSafeInteger(invoice.total)||invoice.total<0||!['issued','paid','void'].includes(invoice.status)||!invoice.number)throw Error('Invalid invoice record.');
 const d=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 const amount=n=>'PKR '+n.toLocaleString('en-PK');
 const safe=(v,max=120)=>String(v||'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);
 d.setFillColor(16,35,68);d.rect(0,0,210,40,'F');d.setFillColor(6,189,146);d.rect(0,40,210,2,'F');d.setTextColor(255,255,255);d.setFont('helvetica','bold');d.setFontSize(25);d.text('TurnAhead',14,20);d.setFontSize(12);d.text('MANAGED SERVICE / INVOICE',14,31);d.text(safe(invoice.number,40),196,20,{align:'right'});
 d.setTextColor(16,35,68);d.setFontSize(11);d.text('BILL TO',14,55);d.setFont('helvetica','normal');d.text(d.splitTextToSize(safe(invoice.billTo||organization),175),14,63);d.text('Status: '+invoice.status.toUpperCase(),14,82);
 if(Number.isFinite(invoice.issuedAt?.toMillis?.()))d.text('Issued: '+new Date(invoice.issuedAt.toMillis()).toLocaleDateString('en-PK'),14,90);
 d.setFillColor(240,244,250);d.rect(14,105,182,12,'F');d.setFont('helvetica','bold');d.text('Description',18,113);d.text('Amount',192,113,{align:'right'});
 d.setFont('helvetica','normal');d.text(d.splitTextToSize(safe(invoice.description||'Managed service subscription'),125),18,126);d.text(amount(invoice.total),192,126,{align:'right'});d.line(14,150,196,150);d.setFont('helvetica','bold');d.setFontSize(16);d.text('Recorded total',14,164);d.text(amount(invoice.total),196,164,{align:'right'});
 d.setFont('helvetica','normal');d.setFontSize(10);d.text(d.splitTextToSize('This PDF reflects the recorded invoice status. Only a verified paid record indicates receipt of payment. Contact the platform operator for formal tax documentation.',180),14,180);
 return d;
}
