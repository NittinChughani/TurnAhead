// Staging-only Google authentication. Same-origin redirect avoids popup/iframe
// storage problems on the web.app alias. Firebase remains the identity authority.
const canonical='turnahead-staging.firebaseapp.com',alias='turnahead-staging.web.app';
const sdk=()=>import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
const key='turnahead-staging-google-pending';
export function googleSignInTarget(href){
 const u=new URL(href);
 if(u.protocol!=='https:'||![canonical,alias].includes(u.hostname))throw Error('Use the official TurnAhead staging website for Google sign-in.');
 if(u.hostname===alias){u.hostname=canonical;return u.href;}
 return null;
}
export async function startStagingGoogle(auth,{href=location.href,navigate=url=>location.assign(url),storage=sessionStorage,load=sdk}={}){
 const target=googleSignInTarget(href);
 if(target){navigate(target);return {navigating:true};}
 let timer;
 try{
  const redirect=async()=>{const {GoogleAuthProvider,signInWithRedirect}=await load();const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});storage.setItem(key,'1');await signInWithRedirect(auth,provider);};
  await Promise.race([redirect(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Google sign-in could not start. Reload the page and retry.')),25000);})]);return {navigating:true};
 }catch(e){storage.removeItem(key);throw e;}finally{clearTimeout(timer);}
}
export async function finishStagingGoogle(auth,{href=location.href,storage=sessionStorage,load=sdk}={}){
 if(new URL(href).hostname!==canonical||storage.getItem(key)!=='1')return null;
 let timer;
 try{
  const {getRedirectResult}=await load();
  const result=await Promise.race([getRedirectResult(auth),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Google sign-in did not return a result. Please try again.')),25000);})]);
  if(!result&&!auth.currentUser)throw Error('Google sign-in did not complete. Please try again.');
  return result;
 }finally{clearTimeout(timer);storage.removeItem(key);}
}
