/** Account disclosure: no profile controls are visible until explicitly opened. */
export function bindAccountMenu(prefix){
 const $=id=>document.getElementById(prefix+'-'+id);
 const root=$('account'),trigger=$('greeting'),panel=$('account-panel'),file=$('profile-file'),choose=$('profile-choose');
 const close=(focus=false)=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus&&!root.hidden)trigger.focus();};
 trigger.addEventListener('click',()=>{if(!panel.hidden){close();return;}panel.hidden=false;trigger.setAttribute('aria-expanded','true');});
 choose.addEventListener('click',()=>{if(!choose.disabled&&!file.disabled)file.click();});
 document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();close(true);}});
 root.addEventListener('focusout',e=>{if(e.relatedTarget&&!root.contains(e.relatedTarget))close();});
 return {close,show(visible){root.hidden=!visible;if(!visible){close();file.value='';$('greeting-name').textContent='';$('nav-avatar').replaceChildren();$('profile-avatar').replaceChildren();}},busy(value){choose.disabled=value;$('profile-remove').disabled=value;}};
}
