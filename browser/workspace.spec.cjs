const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
const {readFileSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const {PNG}=require('pngjs');
const jsQR=require('jsqr');
test('owner workspace renders analytics, exports a real PDF, navigates setup and activity',async({page})=>{
 await mockWorkspace(page,'owner');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin.html');
 await expect(page.locator('#admin-content')).toBeVisible();
 await page.locator('[data-admin-tab=analytics]').click();
 await page.locator('#analytics-load').click();
 await expect(page.locator('#analytics-output')).toContainText('Operational overview');
 await expect(page.locator('#analytics-output')).toContainText('Department performance');
 await expect(page.locator('#analytics-output')).toContainText('Patient experience');
 const download=page.waitForEvent('download');await page.locator('#analytics-pdf').click();const pdf=await download;
 expect(pdf.suggestedFilename()).toMatch(/^turnahead-analytics-.*\.pdf$/);
 const bytes=readFileSync(await pdf.path());expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(1000);
 const raw=bytes.toString('latin1'),boxes=[...raw.matchAll(/\/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
 expect(boxes.length).toBeGreaterThanOrEqual(6);
 for(const box of boxes){expect(Number(box[1])).toBeCloseTo(595.28,0);expect(Number(box[2])).toBeCloseTo(841.89,0);}
 await expect(page.locator('#admin-account-panel')).toBeHidden();
 await page.locator('#admin-greeting').click();await expect(page.locator('#admin-profile-choose')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.locator('#admin-profile-choose').click();await chooser;
 await page.locator('#admin-profile-remove').click();await expect(page.locator('#admin-toast')).toContainText('Profile photo removed');
 await page.keyboard.press('Escape');await expect(page.locator('#admin-account-panel')).toBeHidden();
 await page.locator('[data-admin-tab=onboarding]').click();await expect(page.locator('#onboarding-list')).toContainText('STEP 1 OF 6');
 await page.locator('#onboarding-list').getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('#onboarding-list')).toContainText('STEP 2 OF 6');
 await page.locator('[data-admin-tab=activity]').click();await expect(page.locator('#activity-list')).toContainText('Ticket issued');
 await page.locator('[data-admin-tab=history]').click();await expect(page.locator('[data-history-day]').first()).toHaveAttribute('open','');
 await page.locator('[data-history-full]').first().click();await expect(page.locator('[data-history-results]').first()).toContainText('Fictional Patient');
 expect(errors).toEqual([]);
});
test('reception workspace edits waiting ticket, selects another department and uses guide',async({page})=>{
 await mockWorkspace(page,'receptionist');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/desk.html');await expect(page.locator('#dashboard')).toBeVisible();
 await expect(page.locator('[data-staff-section=overview]')).toBeVisible();
 await expect(page.locator('[data-staff-section=queues]')).toBeHidden();
 await expect(page.locator('#staff-account-panel')).toBeHidden();
 await page.locator('#staff-greeting').click();await expect(page.locator('#staff-profile-remove')).toBeVisible();
 await page.locator('#staff-profile-remove').click();await expect(page.locator('#notice')).toContainText('Profile photo removed');
 await page.keyboard.press('Escape');await expect(page.locator('#staff-account-panel')).toBeHidden();
 await page.locator('[data-staff-tab=queues]').click();
 await expect(page.locator('.delay-notice-panel')).toBeVisible();await expect(page.locator('[data-staff-section=overview]')).toBeHidden();
 await page.locator('[data-delay-select]').selectOption('running-late');await page.locator('[data-delay-save]').click();await expect(page.locator('#notice')).toContainText('Delay notice updated');
 await page.locator('[data-staff-tab=tickets]').click();
 await expect(page.locator('[data-change-ticket]').first()).toBeEnabled();
 await page.locator('[data-change-ticket]').first().click();await expect(page.locator('#ticket-change-dialog')).toBeVisible();
 await page.locator('#change-mode').selectOption('transfer');await page.locator('#change-doctor').selectOption('E'.repeat(20));await page.locator('#change-room').fill('2');
 await page.locator('#ticket-change-form button[type=submit]').click();await expect(page.locator('#notice')).toContainText('RAD-001');
 await page.locator('[data-staff-tab=guide]').click();await expect(page.locator('#staff-guide-count')).toHaveText('1 of 5');
 await page.locator('#staff-guide-next').click();await expect(page.locator('#staff-guide-count')).toHaveText('2 of 5');
 await page.locator('[data-staff-tab=missed]').click();await expect(page.locator('#missed-list')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.locator('#staff-greeting').click();await expect(page.locator('#staff-account-panel')).toBeVisible();
 const menu=await page.locator('#staff-account-panel').boundingBox();expect(menu.x).toBeGreaterThanOrEqual(0);expect(menu.x+menu.width).toBeLessThanOrEqual(391);
 expect(errors).toEqual([]);
});
function checkTicketPDF(path,expectedURL){
 const text=execFileSync('pdftotext',[path,'-'],{encoding:'utf8'});
 for(const value of ['TurnAhead','GEN-001','Fictional Patient','General OPD','Demo Doctor','Room','Scan to follow your turn live'])expect(text).toContain(value);
 const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});expect(info).toMatch(/Pages:\s+1\b/);
 const raster=execFileSync('pdftoppm',['-f','1','-l','1','-r','130','-png',path],{maxBuffer:20*1024*1024});
 const png=PNG.sync.read(raster);const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
 expect(decoded?.data).toBe(expectedURL);
}
test('patient downloads and prints a nonblank private ticket with the original scannable QR',async({page},testInfo)=>{
 await mockWorkspace(page,'receptionist');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/track.html?hospital='+'H'.repeat(20)+'&ticket='+'T'.repeat(20));
 await expect(page.locator('#track-code')).toHaveText('GEN-001');await expect(page.locator('#track-content')).toBeVisible();
 if(await page.locator('#near-popup').isVisible())await page.locator('#near-popup-close').click();
 await expect(page.locator('#save-ticket')).toBeVisible();await expect(page.locator('[role=progressbar]')).toBeVisible();
 const canonical=new URL(page.url());canonical.search='';canonical.searchParams.set('ticket','T'.repeat(20));canonical.searchParams.set('hospital','H'.repeat(20));
 const waiting=page.waitForEvent('download');await page.locator('#save-ticket').click();const download=await waiting;
 expect(download.suggestedFilename()).toBe('TurnAhead-GEN-001.pdf');
 checkTicketPDF(await download.path(),canonical.href);
 // Stub only the browser print dialog; the real print layout is rendered to a PDF by Chromium.
 await page.evaluate(()=>{window.print=()=>{window.__printInvoked=true;}});
 await page.locator('#print-patient-ticket').click();expect(await page.evaluate(()=>window.__printInvoked)).toBe(true);
 await page.emulateMedia({media:'print'});
 await expect(page.locator('#patient-print-ticket')).toBeVisible();await expect(page.locator('#patient-print-code')).toHaveText('GEN-001');
 await expect(page.locator('.track-main')).toBeHidden();
 const path=testInfo.outputPath('patient-print.pdf');await page.pdf({path,preferCSSPageSize:true,printBackground:true});
 checkTicketPDF(path,canonical.href);
 await page.emulateMedia({media:'screen'});await expect(page.locator('#patient-print-ticket')).toBeHidden();
 expect(errors).toEqual([]);
});

test('pricing is public-only, displays approved amounts, and contains no onboarding section',async({page})=>{
 await page.goto('/pricing.html');
 await expect(page.locator('#pricing-plans')).toContainText('PKR 4,999');
 await expect(page.locator('#pricing-plans')).toContainText('PKR 19,999');
 await page.locator('[data-cycle=annual]').click();
 await expect(page.locator('#pricing-plans')).toContainText('PKR 149,990');
 await expect(page.locator('#pricing-plans')).toContainText('PKR 184,990');
 await expect(page.locator('#request')).toHaveCount(0);
 await expect(page.locator('#pricing-auth')).toHaveCount(0);
 await expect(page.locator('main')).not.toContainText('COMING SOON');
});
test('staged subscription tab preserves legacy analytics and does not enable commercial writes',async({page})=>{
 await mockWorkspace(page,'owner');
 await page.goto('/admin.html');await expect(page.locator('#admin-content')).toBeVisible();
 await page.locator('[data-admin-tab=subscription]').click();
 await expect(page.locator('#subscription-summary')).toContainText('Commercial onboarding coming soon');
 await expect(page.locator('#subscription-request button[type=submit]')).toBeDisabled();
 await expect(page.locator('#subscription-invoices')).toContainText('Available after commercial activation.');
 await page.locator('[data-admin-tab=analytics]').click();
 await expect(page.locator('#analytics-mode')).toHaveValue('advanced');
 await page.locator('#analytics-load').click();
 await expect(page.locator('#analytics-output')).toContainText('Operational overview');
});

test('both workspaces use a centered queue loader during permission checks',async({page})=>{
 for(const [role,url,content] of [['owner','/admin.html','#admin-content'],['receptionist','/desk.html','#dashboard']]){
  await mockWorkspace(page,role,{loginDelay:650});
  await page.goto(url);
  const loader=page.locator('.ta-signin-overlay');await expect(loader).toBeVisible();
  await expect(loader).toContainText('Checking access');const box=await loader.boundingBox();expect(box.x).toBe(0);expect(box.y).toBe(0);
  await expect(page.locator(content)).toBeVisible();await expect(loader).toBeHidden();
  await page.unrouteAll({behavior:'wait'});
 }
});
test('archive defaults to current month and latest expanded; date finder reaches older months',async({page})=>{
 await mockWorkspace(page,'owner',{archiveDates:true});
 await page.goto('/admin.html');await expect(page.locator('#admin-content')).toBeVisible();
 await expect(page.locator('#history-days [data-history-day]')).toHaveCount(0);
 await page.locator('[data-admin-tab=history]').click();
 const dates=page.locator('[data-history-day]');await expect(dates).toHaveCount(2);
 await expect(dates.first()).toHaveAttribute('open','');
 await expect(dates.nth(1)).not.toHaveAttribute('open','');
 await expect(dates.first().locator('[data-history-results]')).toContainText('Fictional Patient');
 await dates.nth(1).locator('summary').click();await expect(dates.nth(1)).toHaveAttribute('open','');
 await expect(dates.nth(1).locator('[data-history-results]')).toContainText('Fictional Patient');
 await page.locator('#history-date').fill('2020-01-01');await page.locator('#history-open-date').click();
 const custom=page.locator('[data-history-day="2020-01-01"]');await expect(custom).toHaveAttribute('open','');await expect(custom.locator('summary')).toContainText('Date search');
 await expect(custom.locator('[data-history-results]')).toContainText('Fictional Patient');
 await page.locator('#refresh-history').click();await expect(custom).toHaveCount(0);await expect(dates).toHaveCount(2);
});
