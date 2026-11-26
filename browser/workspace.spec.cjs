const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
const {readFileSync}=require('node:fs');
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
 await page.locator('[data-admin-tab=onboarding]').click();await expect(page.locator('#onboarding-list')).toContainText('STEP 1 OF 6');
 await page.locator('#onboarding-list').getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('#onboarding-list')).toContainText('STEP 2 OF 6');
 await page.locator('[data-admin-tab=activity]').click();await expect(page.locator('#activity-list')).toContainText('Ticket issued');
 await page.locator('[data-admin-tab=history]').click();await page.locator('[data-history-day] summary').first().click();
 await page.locator('[data-history-full]').first().click();await expect(page.locator('[data-history-results]').first()).toContainText('Fictional Patient');
 expect(errors).toEqual([]);
});
test('reception workspace edits waiting ticket, selects another department and uses guide',async({page})=>{
 await mockWorkspace(page,'receptionist');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/desk.html');await expect(page.locator('#dashboard')).toBeVisible();
 await expect(page.locator('[data-change-ticket]').first()).toBeEnabled();
 await page.locator('[data-change-ticket]').first().click();await expect(page.locator('#ticket-change-dialog')).toBeVisible();
 await page.locator('#change-mode').selectOption('transfer');await page.locator('#change-doctor').selectOption('E'.repeat(20));await page.locator('#change-room').fill('2');
 await page.locator('#ticket-change-form button[type=submit]').click();await expect(page.locator('#notice')).toContainText('RAD-001');
 await page.locator('.v33-staff-guide summary').click();await expect(page.locator('#staff-guide-count')).toHaveText('1 of 5');
 await page.locator('#staff-guide-next').click();await expect(page.locator('#staff-guide-count')).toHaveText('2 of 5');
 expect(errors).toEqual([]);
});
test('patient workspace shows live position and private print option',async({page})=>{
 await mockWorkspace(page,'receptionist');await page.goto('/track.html?hospital='+'H'.repeat(20)+'&ticket='+'T'.repeat(20));
 await expect(page.locator('#track-code')).toHaveText('GEN-001');await expect(page.locator('#track-content')).toBeVisible();
 await expect(page.locator('#save-ticket')).toBeVisible();await expect(page.locator('[role=progressbar]')).toBeVisible();
});
