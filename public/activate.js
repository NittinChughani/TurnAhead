import {configured,auth,helpfulError} from './firebase.js';
import {observeAuth,register,login,logout,requestVerification,refreshVerification,findInvitation,acceptInvitation,getHospital} from './org-store.js';
import {normalizeEmail} from './org-model.js';
const $=id=>document.getElementById(id);const show=(id,v)=>$(id).hidden=!v;
const hospitalId=new URLSearchParams(location.search).get('invite');
let activationBusy=false,lastUserId=null;
function info(message,error=false){$('activation-notice').textContent=message;$('activation-notice').classList.toggle('error',error);show('activation-notice',true);}
function mode(view){show('activation-form',view==='new');show('existing-form',view==='existing');show('activation-actions',view==='verify'||view==='accept');show('activation-accept',view==='accept');show('activation-verify',view==='verify');show('activation-resend',view==='verify');show('activation-options',view==='new'||view==='existing'||view==='verify'||view==='accept'||view==='none');}
async function update(){
  if(!configured || !/^[A-Za-z0-9]{20}$/.test(hospitalId||'')){mode('none');$('activation-state').textContent='This invitation link is invalid or Firebase is not configured.';return;}
  const user=auth.currentUser;
  if(!user){mode('new');$('activation-state').textContent='An administrator must add your exact work email before you can join. New staff set a password here once, then use Staff Login from then on.';return;}
  if(!user.emailVerified){mode('verify');$('activation-state').textContent=`Verify ${user.email} before accepting your invitation. We never authorize an unverified email.`;return;}
  try{
    const [hospital,invite]=await Promise.all([getHospital(hospitalId),findInvitation(hospitalId,user.email)]);
    const valid=invite?.status==='pending'&&invite.expiresAt?.toMillis()>Date.now()&&invite.email===normalizeEmail(user.email);
    if(!valid){mode('none');$('activation-state').textContent='You are not registered for this hospital. Ask your administrator to add your exact email address or renew your invitation.';return;}
    mode('accept');$('activation-state').textContent=`${hospital.name} has invited ${user.email} as ${invite.role}. Accept to enable your staff access.`;
  }catch(e){mode('none');$('activation-state').textContent=helpfulError(e);}
}
$('activation-options').querySelector('#activation-existing').addEventListener('click',()=>mode('existing'));
$('activation-new').addEventListener('click',()=>mode('new'));
$('activation-switch').addEventListener('click',async()=>{try{await logout();mode('new');}catch(e){info(helpfulError(e),true);}});
$('activation-form').addEventListener('submit',async e=>{
 e.preventDefault();if(activationBusy)return;activationBusy=true;const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;
 try{
   // UI signup is available only through a hospital invitation. Server-side rules still
   // block users without the exact verified emailed invitation from getting membership.
   const u=await register($('activation-email').value,$('activation-password').value);
   $('activation-password').value='';await requestVerification(u.user);
   info('Account created. Check your email, verify it, then return here to join your hospital.');
 }catch(err){$('activation-error').textContent=helpfulError(err);}finally{activationBusy=false;btn.disabled=false;}
});
$('existing-form').addEventListener('submit',async e=>{
 e.preventDefault();if(activationBusy)return;activationBusy=true;const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;
 try{await login($('existing-email').value,$('existing-password').value);$('existing-password').value='';}
 catch(err){$('existing-error').textContent=helpfulError(err);}finally{activationBusy=false;btn.disabled=false;}
});
$('activation-verify').addEventListener('click',async()=>{try{if(await refreshVerification())await update();else info('Email not verified yet. Check your inbox.',true);}catch(e){info(helpfulError(e),true);}});
$('activation-resend').addEventListener('click',async()=>{try{await requestVerification();info('Verification email sent.');}catch(e){info(helpfulError(e),true);}});
$('activation-accept').addEventListener('click',async()=>{const b=$('activation-accept');b.disabled=true;try{await acceptInvitation(hospitalId);window.location.assign('./desk.html');}catch(e){info(helpfulError(e),true);}finally{b.disabled=false;}});
if(configured)observeAuth(u=>{if(lastUserId!==u?.uid){lastUserId=u?.uid;update();}});else update();
