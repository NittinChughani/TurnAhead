const {test,expect}=require('@playwright/test');
const {mockWorkspace}=require('./fixtures.cjs');
for(const [route,prefix,password] of [['admin.html','admin','admin-password'],['desk.html','staff','password']]){
 test(route+' provides only designated login with password controls',async({page})=>{
  await mockWorkspace(page,prefix==='admin'?'owner':'receptionist',{signedOut:true});
  await page.goto('/'+route);
  await expect(page.getByText('Continue with Google',{exact:true})).toHaveCount(0);
  await expect(page.locator('#'+prefix+'-forgot-password')).toBeVisible();
  await page.locator('#'+password).fill('Synthetic-password-123');
  await page.locator('#'+prefix+'-show-password').click();
  await expect(page.locator('#'+password)).toHaveAttribute('type','text');
  await page.locator('#'+prefix+'-show-password').click();
  await expect(page.locator('#'+password)).toHaveAttribute('type','password');
 });
}
test('pricing sends the chosen plan and billing cycle to registration',async({page})=>{
 await page.goto('/pricing.html');
 await expect(page.getByRole('link',{name:'Select Professional ↗'})).toHaveAttribute('href',/plan=professional&cycle=monthly$/);
 await page.locator('[data-cycle=annual]').click();
 await expect(page.getByRole('link',{name:'Select Professional ↗'})).toHaveAttribute('href',/plan=professional&cycle=annual$/);
});
