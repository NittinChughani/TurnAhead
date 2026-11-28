/** Shared login screen. No artificial minimum animation duration. */
export function bindSignInLoader(button){
 const el=document.createElement('div');el.className='ta-signin-overlay';el.hidden=true;el.setAttribute('role','status');el.setAttribute('aria-live','polite');
 el.innerHTML='<div class="ta-signin-card"><div class="ta-loader-brand"><img class="logo-day" src="./assets/brand-light-blended.webp" alt="TurnAhead"><img class="logo-night" src="./assets/brand-dark-blended.webp" alt="TurnAhead"></div><div class="ta-queue-loader" aria-hidden="true"><i></i><i></i><i></i><i></i><span>✓</span></div><h2 id="ta-loader-title">Signing in</h2><p id="ta-loader-detail">Connecting securely to your workspace</p><div class="ta-loader-track" aria-hidden="true"><span></span></div><small id="ta-loader-slow" hidden>This connection is taking longer than usual. If Google opened a sign-in window, finish or close it first.</small><button id="ta-loader-retry" type="button" class="btn btn-outline full" style="margin-top:14px" hidden>Return to sign-in / retry</button></div>';
 document.body.append(el);
 const retry=el.querySelector('#ta-loader-retry');
 retry.addEventListener('click',()=>location.reload());
 let timer=null,active=false,blocked=[];
 return (busy,stage='Signing in')=>{
  button.disabled=busy;
  if(busy){
   el.querySelector('#ta-loader-title').textContent=stage;el.querySelector('#ta-loader-detail').textContent=stage==='Checking access'?'Verifying your credentials':'Connecting securely to your workspace';
   if(!active){active=true;el.hidden=false;blocked=[...document.body.children].filter(n=>n!==el&&['HEADER','MAIN','FOOTER'].includes(n.tagName)&&!n.inert);for(const n of blocked)n.inert=true;document.body.classList.add('ta-signin-busy');timer=setTimeout(()=>{el.querySelector('#ta-loader-slow').hidden=false;retry.hidden=false;},9000);}
  }else{active=false;clearTimeout(timer);timer=null;el.hidden=true;el.querySelector('#ta-loader-slow').hidden=true;retry.hidden=true;for(const n of blocked)n.inert=false;blocked=[];document.body.classList.remove('ta-signin-busy');}
 };
}

/** Bound read-only authorization checks; a timeout never grants access. */
export async function withWorkspaceTimeout(operation,ms=25000){
 let timer;
 try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Workspace verification timed out. Check your connection and retry sign-in. If your hospital is newly registered, confirm operational provisioning in TCC.')),ms);})]);}
 finally{clearTimeout(timer);}
}
