const {test,expect}=require('@playwright/test');
test('demo issuance, FIFO call, completion and pause without Firebase',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/demo.html');await expect(page.locator('#demo-patient')).toContainText('GEN-002');
 await page.locator('#demo-issue').click();await expect(page.locator('#demo-patient')).toContainText('GEN-004');
 await page.locator('#demo-call').click();await expect(page.locator('#demo-board')).toContainText('GEN-001');
 await page.locator('[data-ticket="1"]').click();await expect(page.locator('#demo-patient')).toContainText('Counter 1');
 await page.locator('#demo-complete').click();await expect(page.locator('#demo-patient')).toContainText('COMPLETED');
 await page.locator('#demo-pause').click();await expect(page.locator('#demo-call')).toBeDisabled();
 await page.locator('#demo-reset').click();await expect(page.locator('#demo-patient')).toContainText('GEN-002');
 expect(requests.filter(s=>/firestore\.googleapis|firebaseio|identitytoolkit/i.test(s))).toEqual([]);
});
test('public mobile navigation and help search',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/index.html');await expect(page.getByRole('link',{name:'Try interactive demo'})).toBeVisible();
 await page.goto('/help.html');await page.locator('#help-search').fill('print');await expect(page.locator('#help-count')).toContainText('matching topics');await expect(page.getByText('How do I print a QR ticket?')).toBeVisible();
 await expect(page.getByText('Who can see patient history?')).toBeHidden();
 await page.goto('/privacy.html');await expect(page.getByRole('heading',{name:'Privacy information'})).toBeVisible();
});
