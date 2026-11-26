import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {receiptDetails,trackingURL,drawQR} from '../public/patient-ticket.js';
test('patient export keeps current ticket and private QR, excludes unrelated URL parameters',()=>{
 const ticket='T'.repeat(20),hospital='H'.repeat(20);
 const url=trackingURL('https://example.test/TurnAhead/track.html?unrelated=1#other',ticket,hospital);
 assert.equal(url,'https://example.test/TurnAhead/track.html?ticket='+ticket+'&hospital='+hospital);
 assert.throws(()=>trackingURL(url,'invalid',hospital));
 const d=receiptDetails({code:'RAD-009',queueName:'Radiology',patientName:'Fictional Patient',patientGender:'male',doctorName:'Demo Doctor',roomNumber:'2',dayKey:'2026-11-27'},'Demo hospital');
 assert.equal(d.filename,'TurnAhead-RAD-009.pdf');assert.deepEqual(d.rows[0],['Patient','Mr Fictional Patient']);assert.deepEqual(d.rows[1],['Department','Radiology']);
});
test('PDF QR is drawn with white quiet zone and vector black modules',()=>{
 const rects=[],doc={setFillColor(){},rect(...args){rects.push(args);}};
 drawQR(doc,[[true,false],[true,true]],0,0,50);
 assert.deepEqual(rects,[[0,0,50,50,'F'],[20,20,5,5,'F'],[20,25,10,5,'F']]);
});
test('patient print uses separate direct body receipt and page-specific stylesheet',()=>{
 const html=readFileSync(new URL('../public/track.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/patient-ticket.css',import.meta.url),'utf8');
 assert.match(html,/<section id="patient-print-ticket"/);assert.match(css,/body\.tracking>#patient-print-ticket:not\(\[hidden\]\)\{display:block!important/);
 assert.match(css,/size:A4 portrait/);assert.match(html,/id="print-patient-ticket"/);
});
