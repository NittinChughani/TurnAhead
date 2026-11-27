// Preview is in-memory only; avoid any login or personal information input.
document.addEventListener('DOMContentLoaded',()=>{
 for(const id of ['pricing-login','admin-login-form']){const el=document.getElementById(id);if(el)el.hidden=true;}
 const link=document.getElementById('open-reception');if(link){const fix=()=>{if(link.getAttribute('href')!=='./demo.html')link.setAttribute('href','./demo.html');};new MutationObserver(fix).observe(link,{attributes:true,attributeFilter:['href']});fix();}
 for(const id of ['admin-profile-choose','admin-profile-remove','custom-logo-file','custom-logo-remove']){const el=document.getElementById(id);if(el)el.disabled=true;}
 const note=document.getElementById('subscription-message');if(note)note.placeholder='Fictional information only. Nothing is transmitted.';
});
