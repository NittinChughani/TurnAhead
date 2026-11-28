import {cp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {firebaseConfig} from '../public/config.js';
import {turnaheadPushConfig} from '../public/push-config.js';
if(firebaseConfig.projectId!=='turnahead-staging'||firebaseConfig.authDomain!=='turnahead-staging.firebaseapp.com'||!firebaseConfig.appId)throw Error('Refusing non-staging Firebase configuration.');
if(turnaheadPushConfig.vapidPublicKey||turnaheadPushConfig.appCheckSiteKey)throw Error('Staging push delivery must remain disabled.');
const dest=resolve('staging-dist');
await rm(dest,{recursive:true,force:true});
await cp(resolve('public'),dest,{recursive:true});
await rm(join(dest,'v4-preview'),{recursive:true,force:true});
const notice='<div role="status" style="position:sticky;top:0;z-index:9999;padding:8px 12px;text-align:center;background:#fef3c7;color:#78350f;font:600 13px system-ui">STAGING ONLY · Synthetic records only · Not for live patient care</div>';
async function check(dir){
 for(const item of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,item.name);
  if(item.isDirectory()){await check(path);continue;}
  if(!/\.(js|html|json|webmanifest|css|svg)$/i.test(item.name))continue;
  let s=await readFile(path,'utf8');
  if(/turnahead-b34f9|348690841921:web:4a091271d11a618258e1c0/i.test(s))throw Error('Production Firebase reference in staging asset: '+item.name);
  if(item.name.endsWith('.html')){s=s.replace(/<body\b[^>]*>/i,m=>m+notice);await writeFile(path,s);}
  if(item.name==='manifest.webmanifest'){const m=JSON.parse(s);m.name='TurnAhead Staging';m.short_name='TA Staging';await writeFile(path,JSON.stringify(m,null,2));}
 }
}
await check(dest);
await writeFile(join(dest,'robots.txt'),'User-agent: *\nDisallow: /\n');
console.log('Built isolated staging assets; no production Firebase reference found.');
